import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createFreeModelRouter, FreeModelQuotaError } from "../src/lib/ai/route-free-core.ts";

function model(id) {
  return {
    id,
    label: id,
    supportsTools: true,
    supportsJson: true,
    contextWindow: 8192,
    tasks: ["chat", "brief", "plan"],
    enabled: true,
  };
}

function options(models, execute) {
  return { userId: "user-1", usageId: "usage-1", plan: "free", task: "chat", models, execute };
}

function createRouter(overrides = {}) {
  const attempts = [];
  let now = 1_000;
  const router = createFreeModelRouter({
    reserve: async () => {},
    log: async (_options, selectedModel, attempt, _startedAt, success, _usage, errorCode) => {
      attempts.push({ model: selectedModel.id, attempt, success, errorCode });
    },
    now: () => now,
    failureThreshold: 2,
    breakerDurationMs: 600_000,
    ...overrides,
  });
  return { router, attempts, advance: (milliseconds) => { now += milliseconds; } };
}

test("falls back to the next model in catalog order after a retryable provider error", async () => {
  const calls = [];
  const reservations = [];
  const { router, attempts } = createRouter({
    reserve: async (_options, selectedModel) => reservations.push(selectedModel.id),
  });
  const result = await router.run(options([model("first"), model("second")], async (selectedModel) => {
    calls.push(selectedModel.id);
    if (selectedModel.id === "first") throw Object.assign(new Error("rate limit"), { status: 429 });
    return { answer: "ready", usage: { inputTokens: 4, outputTokens: 2 } };
  }));

  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(reservations, ["first"]);
  assert.equal(result.model.id, "second");
  assert.deepEqual(attempts.map(({ model: id, success }) => [id, success]), [["first", false], ["second", true]]);
});

test("opens a breaker after repeated failures and skips the model until expiry", async () => {
  const calls = [];
  const { router, advance } = createRouter();
  const run = () => router.run(options([model("unstable"), model("healthy")], async (selectedModel) => {
    calls.push(selectedModel.id);
    if (selectedModel.id === "unstable") throw Object.assign(new Error("upstream unavailable"), { status: 503 });
    return { answer: "ok" };
  }));

  await run();
  await run();
  await run();
  assert.deepEqual(calls, ["unstable", "healthy", "unstable", "healthy", "healthy"]);
  advance(600_001);
  await run();
  assert.equal(calls.at(-2), "unstable");
});

test("retries invalid Zod output once on the same model before accepting valid output", async () => {
  const schema = z.object({ answer: z.string() });
  const calls = [];
  const { router, attempts } = createRouter();
  const result = await router.run({
    ...options([model("structured")], async (selectedModel) => {
      calls.push(selectedModel.id);
      const parsed = schema.safeParse(calls.length === 1 ? { answer: 42 } : { answer: "valid" });
      if (!parsed.success) throw Object.assign(new Error("Invalid JSON object output"), { name: "TypeValidationError" });
      return { object: parsed.data };
    }),
    retryInvalidOutput: true,
  });

  assert.deepEqual(calls, ["structured", "structured"]);
  assert.deepEqual(result.result.object, { answer: "valid" });
  assert.deepEqual(attempts.map(({ success }) => success), [false, true]);
});

test("stops before calling a provider when quota reservation is exhausted", async () => {
  let providerCalls = 0;
  const { router } = createRouter({ reserve: async () => { throw new FreeModelQuotaError("user_daily_cap"); } });

  await assert.rejects(
    router.run(options([model("never-called")], async () => {
      providerCalls += 1;
      return { answer: "unexpected" };
    })),
    (error) => error instanceof FreeModelQuotaError && error.quotaCode === "user_daily_cap",
  );
  assert.equal(providerCalls, 0);
});

test("live streaming returns after the first usable chunk before the provider finishes", async () => {
  const { router } = createRouter();
  let finishPendingRead;
  let providerFinished = false;
  let pullCount = 0;
  const providerStream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "text-delta", delta: "The time is " });
    },
    pull(controller) {
      pullCount += 1;
      if (pullCount === 1) {
        return new Promise((resolve) => {
          finishPendingRead = () => {
            providerFinished = true;
            controller.enqueue({ type: "text-delta", delta: "available in context." });
            controller.close();
            resolve();
          };
        });
      }
      return undefined;
    },
    cancel() {
      finishPendingRead = undefined;
    },
  });

  const routed = await router.streamLive({
    ...options([model("fast-first-token")], () => ({ stream: providerStream })),
  });
  assert.equal(providerFinished, false);
  const reader = routed.stream.getReader();
  const first = await reader.read();
  assert.deepEqual(first.value, { type: "text-delta", delta: "The time is " });
  await reader.cancel();
});