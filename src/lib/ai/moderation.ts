import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const moderationResponseSchema = z.object({
  results: z.array(z.object({
    flagged: z.boolean(),
    categories: z.record(z.string(), z.boolean()).optional(),
  }).passthrough()).min(1),
}).passthrough();

export type ModerationResult =
  | { ok: true; provider: "openai" }
  | { ok: false; status: 400 | 503; error: string };

async function saveModerationResult(
  usageId: string,
  modelId: string,
  status: "passed" | "blocked" | "unavailable",
  categories: Record<string, boolean> | null,
) {
  try {
    const admin = createAdminClient();
    const values: Record<string, unknown> = {
      model_id: modelId,
      moderation_status: status,
      moderation_provider: "openai",
      moderation_categories: categories,
    };
    if (status !== "passed") {
      values.status = "failed";
      values.completed_at = new Date().toISOString();
    }
    const { error } = await admin.from("ai_usage").update(values).eq("id", usageId);
    return !error;
  } catch {
    return false;
  }
}

export async function moderateAiInput(usageId: string, modelId: string, input: string): Promise<ModerationResult> {
  const enabled = process.env.CONTENT_MODERATION_ENABLED === "true";
  const apiKey = process.env.MODERATION_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!enabled || !apiKey) {
    await saveModerationResult(usageId, modelId, "unavailable", null);
    return { ok: false, status: 503, error: "Cueable safety checks are unavailable. Please try again later." };
  }

  const content = input.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  if (!content || content.length > 40_000) {
    await saveModerationResult(usageId, modelId, "blocked", null);
    return { ok: false, status: 400, error: "That request is too long or empty. Edit it and try again." };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.MODERATION_MODEL?.trim() || "omni-moderation-latest", input: content }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Moderation provider returned an error.");
    const result = moderationResponseSchema.safeParse(await response.json());
    if (!result.success) throw new Error("Moderation provider returned an invalid response.");

    const outcome = result.data.results[0];
    const categories = outcome.categories ?? {};
    if (outcome.flagged) {
      if (!await saveModerationResult(usageId, modelId, "blocked", categories)) {
        return { ok: false, status: 503, error: "Cueable safety checks could not be recorded. Please try again." };
      }
      return { ok: false, status: 400, error: "This request includes content Cueable can’t help create. Edit it and try again." };
    }

    if (!await saveModerationResult(usageId, modelId, "passed", null)) {
      return { ok: false, status: 503, error: "Cueable safety checks could not be recorded. Please try again." };
    }
    return { ok: true, provider: "openai" };
  } catch {
    await saveModerationResult(usageId, modelId, "unavailable", null);
    return { ok: false, status: 503, error: "Cueable couldn’t complete its safety check. Please try again later." };
  }
}