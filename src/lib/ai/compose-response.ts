import { z } from "zod";
import { adBriefSchema } from "@/lib/ai/brief";

export const composeResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("brief"), brief: adBriefSchema }).strict(),
  z.object({
    kind: z.literal("answer"),
    answer: z.string().trim().min(1).max(6000),
    sources: z.array(z.object({ title: z.string().max(300), url: z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value)) }).strict()).max(5).optional(),
  }).strict(),
]);

export type ComposeResponse = z.infer<typeof composeResponseSchema>;