import { z } from "zod";
import { requireAdminContext } from "@/lib/admin-requests";

const overrideSchema = z.object({
  userId: z.string().uuid(),
  dailyCap: z.number().int().min(0).max(10000).nullable(),
  modelId: z.string().trim().min(1).max(200).nullable(),
}).strict();

function readPlan(value: unknown): "free" | "pro" | "business" {
  if (typeof value !== "string") return "free";
  const plan = value.trim().toLowerCase();
  return plan === "pro" || plan === "business" ? plan : "free";
}

export async function GET() {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await context.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ error: "Unable to load users." }, { status: 503 });
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const [overridesResult, modelsResult] = await Promise.all([
    context.admin.from("free_model_user_overrides").select("user_id, daily_cap, model_id"),
    context.admin.from("free_models").select("id, label").eq("enabled", true).eq("healthy", true).order("priority", { ascending: true }),
  ]);
  if (overridesResult.error) {
    return Response.json({ error: "Per-user AI settings are unavailable. Apply migration 202609300014_free_model_user_overrides.sql." }, { status: 503 });
  }
  if (modelsResult.error) return Response.json({ error: "The free-model catalog is unavailable." }, { status: 503 });

  const overrides = new Map((overridesResult.data ?? []).map((item) => [item.user_id, item]));
  return Response.json({
    users: users.map((user) => {
      const override = overrides.get(user.id);
      const metadata = user.user_metadata ?? {};
      return {
        id: user.id,
        email: user.email ?? "",
        name: String(metadata.full_name ?? metadata.name ?? ""),
        plan: readPlan(user.app_metadata?.plan ?? user.app_metadata?.subscription_tier),
        createdAt: user.created_at ?? null,
        dailyCap: override?.daily_cap ?? null,
        modelId: override?.model_id ?? null,
      };
    }),
    models: modelsResult.data ?? [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid per-user AI settings." }, { status: 400 });
  }
  const parsed = overrideSchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "Set a daily cap from 0 to 10,000 and choose a valid model." }, { status: 400 });

  const { userId, dailyCap, modelId } = parsed.data;
  const { data: targetResult, error: targetError } = await context.admin.auth.admin.getUserById(userId);
  if (targetError || !targetResult.user) return Response.json({ error: "User not found." }, { status: 404 });

  if (modelId) {
    const { data: model, error } = await context.admin.from("free_models")
      .select("id, enabled, healthy")
      .eq("id", modelId)
      .maybeSingle();
    if (error) return Response.json({ error: "Unable to verify the selected model." }, { status: 503 });
    if (!model) return Response.json({ error: "Free model not found." }, { status: 404 });
    if (!model.enabled || !model.healthy) return Response.json({ error: "Choose an enabled, healthy free model." }, { status: 409 });
  }

  if (dailyCap === null && modelId === null) {
    const { error } = await context.admin.from("free_model_user_overrides").delete().eq("user_id", userId);
    if (error) return Response.json({ error: "Unable to reset per-user AI settings." }, { status: 500 });
    return Response.json({ userId, dailyCap: null, modelId: null });
  }

  const { error } = await context.admin.from("free_model_user_overrides").upsert({
    user_id: userId,
    daily_cap: dailyCap,
    model_id: modelId,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return Response.json({ error: "Unable to save per-user AI settings." }, { status: 500 });
  return Response.json({ userId, dailyCap, modelId });
}