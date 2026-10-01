import type { FreeModelConfig, FreeModelTask } from "@/lib/ai/free-models";

export type TokenUsage = { inputTokens?: number; outputTokens?: number };
export type UsageValue = TokenUsage | PromiseLike<TokenUsage>;
export type UsageAwareResult = { usage?: UsageValue };
export type ModelStreamResult = UsageAwareResult & { stream: ReadableStream<unknown> };

export type AttemptOptions = {
  usageId: string;
  userId: string;
  plan: "free" | "pro" | "business";
  task: FreeModelTask;
  requiresTools?: boolean;
  requiresJson?: boolean;
};

type RouterHooks = {
  reserve: (options: AttemptOptions, model: FreeModelConfig) => Promise<void>;
  log: (options: AttemptOptions, model: FreeModelConfig, attempt: number, startedAt: number, success: boolean, usage?: TokenUsage, errorCode?: string) => Promise<void>;
  now?: () => number;
  failureThreshold?: number;
  breakerDurationMs?: number;
};

type Circuit = { failures: number; openUntil: number };

export class FreeModelRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeModelRouteError";
  }
}

export class FreeModelQuotaError extends Error {
  readonly quotaCode: "global_daily_budget" | "user_daily_cap";

  constructor(code: "global_daily_budget" | "user_daily_cap") {
    super(code === "global_daily_budget"
      ? "Today’s free AI capacity has been reached. Please try again tomorrow."
      : "You’ve reached today’s free AI limit. Upgrade your plan for more AI requests.");
    this.name = "FreeModelQuotaError";
    this.quotaCode = code;
  }
}

function classifyError(error: unknown) {
  const value = error && typeof error === "object" ? error as { name?: string; message?: string; status?: number; statusCode?: number; code?: string } : {};
  const text = `${value.name ?? ""} ${value.message ?? ""} ${value.code ?? ""}`.toLowerCase();
  const status = value.status ?? value.statusCode;
  if (status === 429 || /rate.?limit|too many requests/.test(text)) return { retry: true, code: "rate_limit" };
  if ((typeof status === "number" && status >= 500) || /internal server|bad gateway|service unavailable|server error/.test(text)) return { retry: true, code: "server_error" };
  if (/timeout|timed out|aborterror|etimedout|econnreset/.test(text)) return { retry: true, code: "timeout" };
  if (/model not found|no such model|unknown model/.test(text)) return { retry: true, code: "model_not_found" };
  if (/noobjectgenerated|typevalidationerror|invalid.*(json|object|output)|could not parse/.test(text)) return { retry: true, code: "invalid_output" };
  return { retry: false, code: "provider_error" };
}

function isSchemaFailure(error: unknown) {
  return classifyError(error).code === "invalid_output";
}

function isReadyStreamChunk(chunk: unknown) {
  if (!chunk || typeof chunk !== "object") return true;
  const value = chunk as { type?: unknown; error?: unknown };
  if (value.type === "error") throw value.error;
  return typeof value.type === "string" && !["start", "start-step", "raw"].includes(value.type);
}

export function createFreeModelRouter(hooks: RouterHooks) {
  const circuits = new Map<string, Circuit>();
  const now = hooks.now ?? Date.now;

  function isCircuitOpen(modelId: string) {
    const circuit = circuits.get(modelId);
    if (!circuit) return false;
    if (circuit.openUntil > now()) return true;
    if (circuit.openUntil) circuits.delete(modelId);
    return false;
  }

  function recordSuccess(modelId: string) {
    circuits.delete(modelId);
  }

  function recordFailure(modelId: string, retryable: boolean) {
    if (!retryable) return;
    const circuit = circuits.get(modelId) ?? { failures: 0, openUntil: 0 };
    circuit.failures += 1;
    const threshold = hooks.failureThreshold ?? 2;
    if (circuit.failures >= threshold) circuit.openUntil = now() + (hooks.breakerDurationMs ?? 10 * 60_000);
    circuits.set(modelId, circuit);
  }

  async function run<T extends UsageAwareResult>(
    options: AttemptOptions & { models: FreeModelConfig[]; execute: (model: FreeModelConfig) => Promise<T>; retryInvalidOutput?: boolean },
  ) {
    const candidates = options.models.filter((model) => !isCircuitOpen(model.id));
    if (!candidates.length) throw new FreeModelRouteError("Free models are temporarily unavailable. Try again in a few minutes.");

    await hooks.reserve(options, candidates[0]);
    let attempt = 0;
    let lastError: unknown;
    for (const model of candidates) {
      const schemaRetries = options.retryInvalidOutput ? 1 : 0;
      for (let retry = 0; retry <= schemaRetries; retry += 1) {
        attempt += 1;
        const startedAt = now();
        try {
          const result = await options.execute(model);
          const usage = await Promise.resolve(result.usage).catch(() => undefined);
          await hooks.log(options, model, attempt, startedAt, true, usage);
          recordSuccess(model.id);
          return { model, result, usage, attempt };
        } catch (error) {
          lastError = error;
          const failure = classifyError(error);
          await hooks.log(options, model, attempt, startedAt, false, undefined, failure.code);
          recordFailure(model.id, failure.retry);
          if (isSchemaFailure(error) && retry === 0 && options.retryInvalidOutput) continue;
          if (failure.retry) break;
          throw error;
        }
      }
    }
    throw lastError ?? new FreeModelRouteError("Free model requests failed. Try again shortly.");
  }

  async function stream<RESULT extends ModelStreamResult>(
    options: AttemptOptions & {
      models: FreeModelConfig[];
      execute: (model: FreeModelConfig) => RESULT;
      retryInvalidOutput?: boolean;
      onStreamError?: (model: FreeModelConfig, error: unknown) => Promise<void> | void;
      onStreamFinish?: (model: FreeModelConfig, success: boolean, usage?: TokenUsage) => Promise<void> | void;
    },
  ) {
    const candidates = options.models.filter((model) => !isCircuitOpen(model.id));
    if (!candidates.length) throw new FreeModelRouteError("Free models are temporarily unavailable. Try again in a few minutes.");

    await hooks.reserve(options, candidates[0]);
    let lastError: unknown;
    let attempt = 0;
    for (const model of candidates) {
      const schemaRetries = options.retryInvalidOutput ? 1 : 0;
      for (let retry = 0; retry <= schemaRetries; retry += 1) {
        attempt += 1;
        const startedAt = now();
        let result: RESULT | undefined;
        let reader: ReadableStreamDefaultReader<unknown> | undefined;
        let chunks: unknown[];
        let usage: TokenUsage | undefined;
        try {
          result = options.execute(model);
          reader = result.stream.getReader();
          chunks = [];
          let ready = false;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            const value = next.value as unknown;
            if (value && typeof value === "object" && (value as { type?: unknown }).type === "error") {
              throw (value as { error?: unknown }).error;
            }
            chunks.push(value);
            ready ||= isReadyStreamChunk(value);
          }
          if (!ready) throw new Error("The model ended before producing output.");
          usage = await Promise.resolve(result.usage).catch(() => undefined);
        } catch (error) {
          lastError = error;
          const failure = classifyError(error);
          try {
            await reader?.cancel(error);
          } catch {
          }
          const failedUsage = result ? await Promise.resolve(result.usage).catch(() => undefined) : undefined;
          await hooks.log(options, model, attempt, startedAt, false, failedUsage, failure.code);
          recordFailure(model.id, failure.retry);
          await options.onStreamError?.(model, error);
          if (isSchemaFailure(error) && retry < schemaRetries) continue;
          if (failure.retry) break;
          throw error;
        }

        recordSuccess(model.id);
        await hooks.log(options, model, attempt, startedAt, true, usage);
        await options.onStreamFinish?.(model, true, usage);
        const stream = new ReadableStream<unknown>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        });
        return { model, result, stream: stream as RESULT["stream"], attempt };
      }
    }
    throw lastError ?? new FreeModelRouteError("Free model requests failed. Try again shortly.");
  }

  async function streamLive<RESULT extends ModelStreamResult>(
    options: AttemptOptions & {
      models: FreeModelConfig[];
      execute: (model: FreeModelConfig) => RESULT;
      retryInvalidOutput?: boolean;
      onStreamError?: (model: FreeModelConfig, error: unknown) => Promise<void> | void;
      onStreamFinish?: (model: FreeModelConfig, success: boolean, usage?: TokenUsage) => Promise<void> | void;
    },
  ) {
    const candidates = options.models.filter((model) => !isCircuitOpen(model.id));
    if (!candidates.length) throw new FreeModelRouteError("Free models are temporarily unavailable. Try again in a few minutes.");

    await hooks.reserve(options, candidates[0]);
    let lastError: unknown;
    let attempt = 0;
    for (const model of candidates) {
      const schemaRetries = options.retryInvalidOutput ? 1 : 0;
      for (let retry = 0; retry <= schemaRetries; retry += 1) {
        attempt += 1;
        const startedAt = now();
        let result: RESULT | undefined;
        let reader: ReadableStreamDefaultReader<unknown> | undefined;
        let prefix: unknown[];
        try {
          result = options.execute(model);
          reader = result.stream.getReader();
          prefix = [];
          let ready = false;
          while (!ready) {
            const next = await reader.read();
            if (next.done) throw new Error("The model ended before producing output.");
            const value = next.value as unknown;
            if (value && typeof value === "object" && (value as { type?: unknown }).type === "error") {
              throw (value as { error?: unknown }).error;
            }
            prefix.push(value);
            ready = isReadyStreamChunk(value);
          }
        } catch (error) {
          lastError = error;
          const failure = classifyError(error);
          try {
            await reader?.cancel(error);
          } catch {
          }
          const usage = result ? await Promise.resolve(result.usage).catch(() => undefined) : undefined;
          await hooks.log(options, model, attempt, startedAt, false, usage, failure.code);
          recordFailure(model.id, failure.retry);
          try {
            await options.onStreamError?.(model, error);
          } catch {
          }
          if (isSchemaFailure(error) && retry < schemaRetries) continue;
          if (failure.retry) break;
          throw error;
        }

        const liveResult = result;
        const liveReader = reader;
        const initialChunks = prefix;
        const stream = new ReadableStream<unknown>({
          async start(controller) {
            let succeeded = false;
            let failureCode: string | undefined;
            let usage: TokenUsage | undefined;
            try {
              for (const chunk of initialChunks) controller.enqueue(chunk);
              while (true) {
                const next = await liveReader.read();
                if (next.done) break;
                const value = next.value as unknown;
                if (value && typeof value === "object" && (value as { type?: unknown }).type === "error") {
                  throw (value as { error?: unknown }).error;
                }
                controller.enqueue(value);
              }
              succeeded = true;
              recordSuccess(model.id);
              controller.close();
            } catch (error) {
              failureCode = classifyError(error).code;
              recordFailure(model.id, classifyError(error).retry);
              try {
                await options.onStreamError?.(model, error);
              } catch {
              }
              controller.error(error);
            } finally {
              usage = await Promise.resolve(liveResult.usage).catch(() => undefined);
              await hooks.log(options, model, attempt, startedAt, succeeded, usage, failureCode);
              try {
                await options.onStreamFinish?.(model, succeeded, usage);
              } catch {
              }
            }
          },
          cancel(reason) {
            return liveReader.cancel(reason);
          },
        });
        return { model, result: liveResult, stream: stream as RESULT["stream"], attempt };
      }
    }
    throw lastError ?? new FreeModelRouteError("Free model requests failed. Try again shortly.");
  }

  return { run, stream, streamLive };
}