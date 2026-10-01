import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { freeModelConfigSchema, getFreeModelPool, type FreeModelConfig, type FreeModelTask } from "@/lib/ai/free-models";
import { createFreeModelRouter, FreeModelQuotaError, FreeModelRouteError, type AttemptOptions, type ModelStreamResult, type TokenUsage, type UsageAwareResult } from "@/lib/ai/route-free-core";

export { FreeModelQuotaError, FreeModelRouteError } from "@/lib/ai/route-free-core";

function missingCatalog(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

function fromSeededPool(task: FreeModelTask, requiresTools: boolean, requiresJson: boolean) {
  return getFreeModelPool().filter((model) => model.enabled
    && model.tasks.includes(task)
    && (!requiresTools || model.supportsTools)
    && (!requiresJson || model.supportsJson));
}

export async function getFreeModelCandidates(
  task: FreeModelTask,
  requirements: { tools?: boolean; json?: boolean } = {},
  userId?: string,
) {
  const requiresTools = requirements.tools ?? false;
  const requiresJson = requirements.json ?? false;
  let candidates: FreeModelConfig[];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("free_models")
      .select("id, label, capabilities, healthy, enabled, is_primary, priority")
      .order("priority", { ascending: true })
      .order("id", { ascending: true });
    if (error && !missingCatalog(error)) throw new FreeModelRouteError("The free-model catalog is unavailable.");
    if (!error && data?.length) {
      candidates = data.toSorted((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary))).flatMap((row) => {
        if (!row.healthy || !row.enabled || !row.capabilities || typeof row.capabilities !== "object") return [];
        const capabilities = row.capabilities as Record<string, unknown>;
        const parsed = freeModelConfigSchema.safeParse({
          id: row.id,
          label: row.label,
          supportsTools: capabilities.supportsTools,
          supportsJson: capabilities.supportsJson,
          contextWindow: capabilities.contextWindow,
          tasks: capabilities.tasks,
          enabled: row.enabled,
        });
        if (!parsed.success) return [];
        if (!parsed.data.tasks.includes(task)
          || (requiresTools && !parsed.data.supportsTools)
          || (requiresJson && !parsed.data.supportsJson)) return [];
        return [parsed.data];
      });
    } else candidates = fromSeededPool(task, requiresTools, requiresJson);
  } catch (error) {
    if (error instanceof FreeModelRouteError) throw error;
    candidates = fromSeededPool(task, requiresTools, requiresJson);
  }

  if (userId) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.from("free_model_user_overrides")
        .select("model_id")
        .eq("user_id", userId)
        .maybeSingle();
      const preferredIndex = error ? -1 : candidates.findIndex((model) => model.id === data?.model_id);
      if (preferredIndex > 0) {
        const preferred = candidates[preferredIndex];
        candidates = [preferred, ...candidates.filter((_, index) => index !== preferredIndex)];
      }
    } catch {
    }
  }

  return candidates;
}

function configuredLimit(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

async function logAttempt(options: AttemptOptions, model: FreeModelConfig, attempt: number, startedAt: number, success: boolean, usage?: TokenUsage, errorCode?: string) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("free_model_calls").insert({
      usage_id: options.usageId,
      user_id: options.userId,
      model_id: model.id,
      task: options.task,
      attempt_number: attempt,
      latency_ms: Math.max(0, Date.now() - startedAt),
      success,
      error_code: success ? null : errorCode ?? "provider_error",
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cost_usd: 0,
    });
    if (error) console.error("Free model attempt logging failed.");
  } catch {
    console.error("Free model attempt logging failed.");
  }
}

async function reserveQuota(options: AttemptOptions, model: FreeModelConfig) {
  const defaultUserCap = configuredLimit(`FREE_DAILY_USER_CAP_${options.plan.toUpperCase()}`, options.plan === "free" ? 10 : options.plan === "pro" ? 250 : 1000);
  const globalBudget = configuredLimit("FREE_DAILY_BUDGET", 10_000);
  const admin = createAdminClient();
  const { data: override, error: overrideError } = await admin.from("free_model_user_overrides")
    .select("daily_cap")
    .eq("user_id", options.userId)
    .maybeSingle();
  if (overrideError && !missingCatalog(overrideError)) throw new FreeModelRouteError("Per-user free AI limits are unavailable.");
  const userCap = !overrideError && typeof override?.daily_cap === "number" ? override.daily_cap : defaultUserCap;
  const { data, error } = await admin.rpc("reserve_free_model_quota", {
    p_usage_id: options.usageId,
    p_user_id: options.userId,
    p_plan: options.plan,
    p_model_id: model.id,
    p_task: options.task,
    p_global_daily_budget: globalBudget,
    p_user_daily_cap: userCap,
  });
  if (error) throw new FreeModelRouteError("Free AI usage limits are temporarily unavailable.");
  const result = Array.isArray(data) ? data[0] as { allowed?: boolean; error_code?: string | null } | undefined : undefined;
  if (!result) throw new FreeModelRouteError("Free AI usage limit checks returned no result.");
  if (result.allowed) return;
  if (result.error_code === "global_daily_budget" || result.error_code === "user_daily_cap") {
    throw new FreeModelQuotaError(result.error_code);
  }
  throw new FreeModelRouteError("Free AI usage limits are temporarily unavailable.");
}

const breakerMinutes = configuredLimit("FREE_MODEL_BREAKER_MINUTES", 10);
const failureThreshold = configuredLimit("FREE_MODEL_FAILURE_THRESHOLD", 2);
const router = createFreeModelRouter({
  reserve: reserveQuota,
  log: logAttempt,
  failureThreshold: failureThreshold || 2,
  breakerDurationMs: (breakerMinutes || 10) * 60_000,
});

export async function runFreeModelFallback<T extends UsageAwareResult>(
  options: AttemptOptions & { models: FreeModelConfig[]; execute: (model: FreeModelConfig) => Promise<T>; retryInvalidOutput?: boolean },
) {
  return router.run<T>(options);
}

export async function startFreeModelStream<RESULT extends ModelStreamResult>(
  options: AttemptOptions & {
    models: FreeModelConfig[];
    execute: (model: FreeModelConfig) => RESULT;
    retryInvalidOutput?: boolean;
    onStreamError?: (model: FreeModelConfig, error: unknown) => Promise<void> | void;
    onStreamFinish?: (model: FreeModelConfig, success: boolean, usage?: TokenUsage) => Promise<void> | void;
  },
) {
  return router.stream<RESULT>(options);
}

export async function startFreeModelLiveStream<RESULT extends ModelStreamResult>(
  options: AttemptOptions & {
    models: FreeModelConfig[];
    execute: (model: FreeModelConfig) => RESULT;
    retryInvalidOutput?: boolean;
    onStreamError?: (model: FreeModelConfig, error: unknown) => Promise<void> | void;
    onStreamFinish?: (model: FreeModelConfig, success: boolean, usage?: TokenUsage) => Promise<void> | void;
  },
) {
  return router.streamLive<RESULT>(options);
}

export function isFreeModelQuotaError(error: unknown): error is FreeModelQuotaError {
  return error instanceof FreeModelQuotaError;
}

export function freeModelQuotaResponse(error: unknown) {
  if (!isFreeModelQuotaError(error)) return null;
  return Response.json({
    error: error.message,
    code: "free_quota_exhausted",
    upgradeUrl: error.quotaCode === "user_daily_cap" ? "/pricing" : null,
  }, { status: 429 });
}