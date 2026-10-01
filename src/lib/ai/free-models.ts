import "server-only";

import { z } from "zod";

export const freeModelTaskSchema = z.enum(["chat", "brief", "plan"]);

export const freeModelConfigSchema = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(120),
  supportsTools: z.boolean(),
  supportsJson: z.boolean(),
  contextWindow: z.number().int().min(0).max(10_000_000),
  tasks: z.array(freeModelTaskSchema).max(3),
  enabled: z.boolean(),
}).strict();

const freeModelPoolSchema = z.array(freeModelConfigSchema).max(100).superRefine((models, context) => {
  const ids = new Set<string>();
  for (const [index, model] of models.entries()) {
    if (ids.has(model.id)) {
      context.addIssue({ code: "custom", path: [index, "id"], message: "Free model IDs must be unique." });
    }
    ids.add(model.id);
  }
});

export type FreeModelTask = z.infer<typeof freeModelTaskSchema>;
export type FreeModelConfig = z.infer<typeof freeModelConfigSchema>;

const seededFreeModelPool: FreeModelConfig[] = [
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "NVIDIA Nemotron 3 Ultra", supportsTools: true, supportsJson: true, contextWindow: 131072, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "NVIDIA Nemotron 3 Super", supportsTools: true, supportsJson: true, contextWindow: 131072, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "poolside/laguna-s-2.1:free", label: "Poolside Laguna S 2.1", supportsTools: true, supportsJson: true, contextWindow: 65536, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "moonshotai/kimi-k2.6:free", label: "Kimi K2.6", supportsTools: true, supportsJson: true, contextWindow: 131072, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4 Flash", supportsTools: true, supportsJson: true, contextWindow: 131072, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "nex-agi/nex-n2-pro:free", label: "NEX N2 Pro", supportsTools: true, supportsJson: true, contextWindow: 65536, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "baidu/cobuddy:free", label: "Baidu CoBuddy", supportsTools: true, supportsJson: true, contextWindow: 65536, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Nous Hermes 3 Llama 3.1 405B", supportsTools: true, supportsJson: true, contextWindow: 131072, tasks: ["chat", "brief", "plan"], enabled: true },
  { id: "openrouter/free", label: "OpenRouter Free Fallback", supportsTools: true, supportsJson: true, contextWindow: 65536, tasks: ["chat", "brief", "plan"], enabled: true },
];

function keepFallbackLast(models: FreeModelConfig[]) {
  const fallback = models.find((model) => model.id === "openrouter/free")
    ?? seededFreeModelPool[seededFreeModelPool.length - 1];
  return [...models.filter((model) => model.id !== "openrouter/free"), fallback];
}

export function getFreeModelPool() {
  const override = process.env.OPENROUTER_FREE_MODELS_JSON?.trim();
  if (!override) return keepFallbackLast(seededFreeModelPool);

  try {
    const parsed = freeModelPoolSchema.safeParse(JSON.parse(override));
    if (parsed.success) return keepFallbackLast(parsed.data);
  } catch {
  }

  console.error("OPENROUTER_FREE_MODELS_JSON is invalid; using the bundled free-model candidates.");
  return keepFallbackLast(seededFreeModelPool);
}