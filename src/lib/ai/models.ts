import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const aiModelRegistry = {
  hermes: {
    provider: "openrouter",
    plan: "free",
    modelEnv: "OPENROUTER_HERMES_MODEL",
    apiKeyEnv: "OPENROUTER_API_KEY",
    inputCostEnv: "AI_HERMES_INPUT_USD_PER_MILLION",
    outputCostEnv: "AI_HERMES_OUTPUT_USD_PER_MILLION",
  },
  claude: {
    provider: "anthropic",
    plan: "paid",
    modelEnv: "ANTHROPIC_MODEL",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    inputCostEnv: "AI_CLAUDE_INPUT_USD_PER_MILLION",
    outputCostEnv: "AI_CLAUDE_OUTPUT_USD_PER_MILLION",
  },
  openai: {
    provider: "openai",
    plan: "paid",
    modelEnv: "OPENAI_MODEL",
    apiKeyEnv: "OPENAI_API_KEY",
    inputCostEnv: "AI_OPENAI_INPUT_USD_PER_MILLION",
    outputCostEnv: "AI_OPENAI_OUTPUT_USD_PER_MILLION",
  },
  grok: {
    provider: "xai",
    plan: "paid",
    modelEnv: "XAI_MODEL",
    apiKeyEnv: "XAI_API_KEY",
    inputCostEnv: "AI_GROK_INPUT_USD_PER_MILLION",
    outputCostEnv: "AI_GROK_OUTPUT_USD_PER_MILLION",
  },
} as const;

export type AiModelKey = keyof typeof aiModelRegistry;
export type AiProvider = (typeof aiModelRegistry)[AiModelKey]["provider"];
export type AiModelPlan = (typeof aiModelRegistry)[AiModelKey]["plan"];

export type ConfiguredAiModel = {
  key: AiModelKey;
  provider: AiProvider;
  plan: AiModelPlan;
  modelId: string;
};

export function estimateAiCostUsd(key: AiModelKey, usage: { inputTokens?: number; outputTokens?: number }) {
  const model = aiModelRegistry[key];
  const inputRateValue = process.env[model.inputCostEnv]?.trim();
  const outputRateValue = process.env[model.outputCostEnv]?.trim();
  if (!inputRateValue || !outputRateValue) return null;
  const inputRate = Number(inputRateValue);
  const outputRate = Number(outputRateValue);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  if (!Number.isFinite(inputRate) || inputRate < 0 || !Number.isFinite(outputRate) || outputRate < 0) return null;
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return null;
  return Number(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000).toFixed(8));
}

export function isAiModelKey(value: unknown): value is AiModelKey {
  return typeof value === "string" && Object.hasOwn(aiModelRegistry, value);
}

export function getConfiguredAiModel(key: AiModelKey): ConfiguredAiModel | null {
  const model = aiModelRegistry[key];
  const modelId = process.env[model.modelEnv]?.trim();
  const apiKey = process.env[model.apiKeyEnv]?.trim();
  if (!modelId || !apiKey) return null;

  return { key, provider: model.provider, plan: model.plan, modelId };
}

export function createOpenRouterLanguageModel(modelId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OpenRouter API key.");
  return createOpenRouter({ apiKey })(modelId);
}

export function createAiLanguageModel(model: ConfiguredAiModel) {
  const apiKey = process.env[aiModelRegistry[model.key].apiKeyEnv]?.trim();
  if (!apiKey) throw new Error(`Missing API key for ${model.provider}.`);

  switch (model.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model.modelId);
    case "openai":
      return createOpenAI({ apiKey })(model.modelId);
    case "xai":
      return createXai({ apiKey })(model.modelId);
    case "openrouter":
      return createOpenRouterLanguageModel(model.modelId);
  }
}