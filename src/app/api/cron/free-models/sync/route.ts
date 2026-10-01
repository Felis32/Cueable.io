import { z } from "zod";
import { getFreeModelPool } from "@/lib/ai/free-models";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext } from "@/lib/admin-requests";

export const maxDuration = 30;

const modelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(240).optional(),
  context_length: z.number().int().nonnegative(),
  pricing: z.object({
    prompt: z.union([z.string(), z.number()]),
    completion: z.union([z.string(), z.number()]),
  }).passthrough(),
  supported_parameters: z.array(z.string()).optional(),
}).passthrough();

const catalogResponseSchema = z.object({ data: z.array(z.unknown()) }).passthrough();

function isZeroPrice(value: string | number) {
  const price = Number(value);
  return Number.isFinite(price) && price === 0;
}

async function syncFreeModelCatalog() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "OpenRouter catalog sync is not configured." }, { status: 503 });

  let catalog: unknown;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ error: "OpenRouter model catalog is temporarily unavailable." }, { status: 502 });
    catalog = await response.json();
  } catch {
    return Response.json({ error: "OpenRouter model catalog could not be reached." }, { status: 502 });
  }

  const catalogResult = catalogResponseSchema.safeParse(catalog);
  if (!catalogResult.success) return Response.json({ error: "OpenRouter returned an invalid model catalog." }, { status: 502 });

  const admin = createAdminClient();
  const { data: existingRows, error: existingError } = await admin.from("free_models")
    .select("id, label, capabilities, last_seen, healthy, enabled, priority, last_error");
  if (existingError) return Response.json({ error: "Free model catalog storage is unavailable. Apply 202609300008_free_models.sql." }, { status: 503 });

  const existingById = new Map((existingRows ?? []).map((row) => [row.id, row]));
  const configured = getFreeModelPool();
  const configuredById = new Map(configured.map((model, index) => [model.id, { model, index }]));
  const now = new Date().toISOString();
  const healthyModels = new Map<string, Record<string, unknown>>();

  for (const rawModel of catalogResult.data.data) {
    const parsed = modelSchema.safeParse(rawModel);
    if (!parsed.success) continue;
    const model = parsed.data;
    const parameters = model.supported_parameters ?? [];
    if (!isZeroPrice(model.pricing.prompt) || !isZeroPrice(model.pricing.completion)) continue;
    if (!parameters.includes("tools") || model.context_length < 65_536) continue;

    const existing = existingById.get(model.id);
    const configuredModel = configuredById.get(model.id);
    const supportsJson = parameters.some((parameter) => ["structured_outputs", "json_schema", "response_format"].includes(parameter));
    healthyModels.set(model.id, {
      id: model.id,
      label: model.name?.trim() || model.id,
      capabilities: {
        contextWindow: model.context_length,
        supportsTools: true,
        supportsJson,
        tasks: supportsJson ? ["chat", "brief", "plan"] : ["chat"],
        pricing: { prompt: model.pricing.prompt, completion: model.pricing.completion },
      },
      last_seen: now,
      healthy: true,
      enabled: existing?.enabled ?? configuredModel?.model.enabled ?? false,
      priority: existing?.priority ?? configuredModel?.index ?? 1000,
      last_error: null,
      updated_at: now,
    });
  }

  const rowsToUpsert = [...healthyModels.values()];
  const configuredIds = new Set(configured.map((model) => model.id));
  for (const [index, model] of configured.entries()) {
    if (healthyModels.has(model.id)) continue;
    const existing = existingById.get(model.id);
    rowsToUpsert.push({
      id: model.id,
      label: existing?.label ?? model.label,
      capabilities: existing?.capabilities ?? {
        contextWindow: model.contextWindow,
        supportsTools: model.supportsTools,
        supportsJson: model.supportsJson,
        tasks: model.tasks,
      },
      last_seen: existing?.last_seen ?? null,
      healthy: false,
      enabled: existing?.enabled ?? model.enabled,
      priority: existing?.priority ?? index,
      last_error: "Not returned as a free tool-capable model with at least 64K context.",
      updated_at: now,
    });
  }
  for (const existing of existingRows ?? []) {
    if (healthyModels.has(existing.id) || configuredIds.has(existing.id)) continue;
    rowsToUpsert.push({ ...existing, healthy: false, last_error: "No longer returned as an eligible free model.", updated_at: now });
  }

  if (rowsToUpsert.length) {
    const { error } = await admin.from("free_models").upsert(rowsToUpsert, { onConflict: "id" });
    if (error) return Response.json({ error: "Unable to update the free model catalog." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    synced: healthyModels.size,
    unavailable: rowsToUpsert.length - healthyModels.size,
    checkedAt: now,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized catalog sync." }, { status: 401 });
  }
  return syncFreeModelCatalog();
}

export async function POST() {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;
  return syncFreeModelCatalog();
}