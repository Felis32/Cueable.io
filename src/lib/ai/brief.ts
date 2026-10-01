import { z } from "zod";

export const aspectRatioSchema = z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/);

export const adBriefSchema = z.object({
  product: z.string().min(1).max(240),
  audience: z.string().min(1).max(400),
  duration: z.number().int().min(1).max(600),
  aspectRatios: z.array(aspectRatioSchema).min(1).max(4),
  hookStyle: z.string().min(1).max(240),
  tone: z.string().min(1).max(200),
  voiceover: z.boolean(),
  cta: z.string().min(1).max(240),
  mustInclude: z.array(z.string().min(1).max(200)).max(10),
  mustAvoid: z.array(z.string().min(1).max(200)).max(10),
}).strict();

export type AdBrief = z.infer<typeof adBriefSchema>;