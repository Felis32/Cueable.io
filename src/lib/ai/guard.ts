import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { aiModelRegistry, getConfiguredAiModel, isAiModelKey, type AiModelKey } from "@/lib/ai/models";

export type AiPlan = "free" | "pro" | "business";

type GuardSuccess = {
  ok: true;
  userId: string;
  plan: AiPlan;
  model: NonNullable<ReturnType<typeof getConfiguredAiModel>>;
  usageId: string;
  remainingCredits: number;
};

type GuardFailure = {
  ok: false;
  status: 400 | 401 | 403 | 402 | 429 | 503;
  error: string;
};

export type AiGuardResult = GuardSuccess | GuardFailure;

function positiveLimit(envName: string, fallback: number) {
  const value = Number.parseInt(process.env[envName] ?? "", 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function planFromMetadata(value: unknown): AiPlan {
  if (typeof value !== "string") return "free";
  const normalized = value.trim().toLowerCase();
  if (normalized === "pro") return "pro";
  if (normalized === "business") return "business";
  return "free";
}

function databaseFailure(error: { code?: string; message?: string }): GuardFailure {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return { ok: false, status: 503, error: "AI usage storage is not installed. Apply the latest AI foundation migration." };
  }
  return { ok: false, status: 503, error: "Unable to verify AI usage limits." };
}

export async function guardAiRequest(modelKey: unknown, openRouterModelId?: string): Promise<AiGuardResult> {
  if (process.env.AI_ENABLED !== "true") {
    return { ok: false, status: 503, error: "Cueable AI is currently disabled." };
  }
  if (!isAiModelKey(modelKey)) {
    return { ok: false, status: 400, error: "Choose a supported AI model." };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, status: 401, error: "Sign in to use Cueable AI." };

  const plan = planFromMetadata(user.app_metadata?.plan ?? user.app_metadata?.subscription_tier);
  const definition = aiModelRegistry[modelKey];
  if (definition.plan === "paid" && plan === "free") {
    return { ok: false, status: 403, error: "This AI model is available on a paid plan." };
  }

  let model: NonNullable<ReturnType<typeof getConfiguredAiModel>> | null;
  if (openRouterModelId !== undefined) {
    if (modelKey !== "hermes" || definition.provider !== "openrouter" || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(openRouterModelId)) {
      return { ok: false, status: 400, error: "Choose a valid OpenRouter free model." };
    }
    if (!process.env[definition.apiKeyEnv]?.trim()) {
      return { ok: false, status: 503, error: "OpenRouter is not configured on the server." };
    }
    model = { key: "hermes", provider: "openrouter", plan: definition.plan, modelId: openRouterModelId };
  } else {
    model = getConfiguredAiModel(modelKey);
  }
  if (!model) return { ok: false, status: 503, error: "This AI model is not configured on the server." };

  const rateLimit = positiveLimit("AI_REQUESTS_PER_MINUTE", 10);
  const monthlyCredits = positiveLimit(
    plan === "free" ? "AI_FREE_MONTHLY_CREDITS" : "AI_PAID_MONTHLY_CREDITS",
    plan === "free" ? 30 : 1000,
  );

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reserve_ai_usage", {
      p_user_id: user.id,
      p_model_key: model.key,
      p_provider: model.provider,
      p_plan: plan,
      p_monthly_credit_limit: monthlyCredits,
      p_per_minute_limit: rateLimit,
    });
    if (error) return databaseFailure(error);

    const reservation = Array.isArray(data) ? data[0] as {
      usage_id: string | null;
      error_code: string | null;
      remaining_credits: number;
    } | undefined : undefined;
    if (!reservation) return { ok: false, status: 503, error: "AI usage reservation returned no result." };
    if (reservation.error_code === "rate_limit") {
      return { ok: false, status: 429, error: "You’re sending requests too quickly. Please wait a moment and try again." };
    }
    if (reservation.error_code === "credits_exhausted") {
      return { ok: false, status: 402, error: "You’re out of AI credits for this month." };
    }
    if (!reservation.usage_id) return { ok: false, status: 503, error: "Unable to reserve an AI credit." };

    return {
      ok: true,
      userId: user.id,
      plan,
      model,
      usageId: reservation.usage_id,
      remainingCredits: reservation.remaining_credits,
    };
  } catch {
    return { ok: false, status: 503, error: "AI usage checks are temporarily unavailable." };
  }
}