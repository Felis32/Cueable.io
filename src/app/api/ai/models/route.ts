import { z } from "zod";
import { getFreeModelCandidates } from "@/lib/ai/route-free";
import { createClient } from "@/lib/supabase/server";

const surfaceSchema = z.enum(["compose", "ada"]);

const proModels = [
  { key: "claude", label: "Claude" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok" },
] as const;

function getPlan(value: unknown) {
  if (typeof value !== "string") return "free";
  const normalized = value.trim().toLowerCase();
  return normalized === "pro" || normalized === "business" ? normalized : "free";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to load AI models." }, { status: 401 });

  const surface = surfaceSchema.safeParse(new URL(request.url).searchParams.get("surface"));
  if (!surface.success) return Response.json({ error: "Choose a valid AI workspace." }, { status: 400 });

  try {
    const models = surface.data === "ada"
      ? await getFreeModelCandidates("chat", { tools: true }, user.id)
      : (await getFreeModelCandidates("brief", { tools: true, json: true }, user.id)).filter((model) => model.tasks.includes("plan"));
    return Response.json({
      plan: getPlan(user.app_metadata?.plan ?? user.app_metadata?.subscription_tier),
      freeModels: models.map(({ id, label }) => ({ id, label })),
      proModels,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "AI models couldn’t be loaded. Try again." }, { status: 503 });
  }
}