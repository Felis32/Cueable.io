import { z } from "zod";
import { adBriefSchema, aspectRatioSchema } from "@/lib/ai/brief";

export const planSceneSchema = z.object({
  sceneNumber: z.number().int().min(1).max(12),
  visualDescription: z.string().min(1).max(600),
  onScreenText: z.string().max(240),
  voiceoverLine: z.string().max(600),
  seconds: z.number().int().min(1).max(600),
}).strict();

export const planVariantSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  hook: z.string().min(1).max(280),
  aspectRatio: aspectRatioSchema,
  script: z.string().min(1).max(6000),
  scenes: z.array(planSceneSchema).min(1).max(12),
}).strict();

export const scenePlanSchema = z.object({
  variants: z.array(planVariantSchema).min(1).max(3),
}).strict();

export const planRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    modelKey: z.enum(["hermes", "claude", "openai", "grok"]).default("hermes"),
    freeModelId: z.string().trim().min(1).max(200).optional(),
    thirdPartyConsent: z.boolean().default(false),
    brief: adBriefSchema,
    assetIds: z.array(z.string().uuid()).max(12).default([]),
    variantMode: z.enum(["single", "three-hooks", "two-placements"]).default("single"),
  }).strict(),
  z.object({
    action: z.literal("regenerate-scene"),
    modelKey: z.enum(["hermes", "claude", "openai", "grok"]).default("hermes"),
    freeModelId: z.string().trim().min(1).max(200).optional(),
    thirdPartyConsent: z.boolean().default(false),
    brief: adBriefSchema,
    assetIds: z.array(z.string().uuid()).max(12).default([]),
    variant: z.object({
      label: z.string().min(1).max(80),
      aspectRatio: aspectRatioSchema,
      hook: z.string().min(1).max(280),
    }).strict(),
    scene: planSceneSchema,
  }).strict(),
]);

export type PlanScene = z.infer<typeof planSceneSchema>;
export type PlanVariant = z.infer<typeof planVariantSchema>;
export type ScenePlan = z.infer<typeof scenePlanSchema>;