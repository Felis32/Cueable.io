import { z } from "zod";
import { requireAdminContext } from "@/lib/admin-requests";

const updateModelSchema = z.object({
  id: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
}).strict().or(z.object({
  id: z.string().trim().min(1).max(200),
  primary: z.literal(true),
}).strict());

export async function GET() {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { data, error } = await context.admin.from("free_models")
    .select("id, label, capabilities, last_seen, healthy, enabled, is_primary, priority, last_error, updated_at")
    .order("priority", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return Response.json({ error: missing ? "Free model storage is not installed. Apply 202609300008_free_models.sql." : "Unable to load the free model catalog." }, { status: 503 });
  }

  return Response.json({ models: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid free model update." }, { status: 400 });
  }
  const parsed = updateModelSchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "Choose a model and enabled state." }, { status: 400 });

  const { data: current, error: currentError } = await context.admin.from("free_models")
    .select("id, healthy, enabled")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (currentError) return Response.json({ error: "Unable to verify the free model." }, { status: 503 });
  if (!current) return Response.json({ error: "Free model not found." }, { status: 404 });
  if ("enabled" in parsed.data && parsed.data.enabled && !current.healthy) {
    return Response.json({ error: "Unavailable models cannot be enabled." }, { status: 409 });
  }

  if ("primary" in parsed.data) {
    if (!current.healthy || !current.enabled) {
      return Response.json({ error: "Only enabled, healthy models can be primary." }, { status: 409 });
    }
    const { data, error } = await context.admin.rpc("set_primary_free_model", { p_model_id: parsed.data.id });
    if (error) return Response.json({ error: "Unable to set the primary free model. Apply 202609300012_primary_free_model.sql." }, { status: 503 });
    if (data !== true) return Response.json({ error: "This model is no longer available." }, { status: 409 });
    return Response.json({ model: { id: parsed.data.id, is_primary: true } });
  }

  const { data, error } = await context.admin.from("free_models")
    .update({
      enabled: parsed.data.enabled,
      ...(parsed.data.enabled ? {} : { is_primary: false }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("id, enabled, is_primary")
    .single();
  if (error || !data) return Response.json({ error: "Unable to update this free model." }, { status: 500 });
  return Response.json({ model: data });
}