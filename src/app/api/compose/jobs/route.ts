import { z } from "zod";
import { adBriefSchema } from "@/lib/ai/brief";
import { planVariantSchema } from "@/lib/ai/scene-plan";
import { notifyAdminsOfNewProject } from "@/lib/admin-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 15;

const startJobSchema = z.object({
  brief: adBriefSchema,
  variant: planVariantSchema,
  assetIds: z.array(z.string().uuid()).max(12).default([]),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to generate an ad." }, { status: 401 });
  if (process.env.GENERATION_WORKER_ENABLED !== "true") {
    return Response.json({ error: "Background video generation is not enabled yet." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid generation request." }, { status: 400 });
  }
  const parsed = startJobSchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "Review the approved brief and shot list." }, { status: 400 });

  const { brief, variant, assetIds } = parsed.data;
  const totalSeconds = variant.scenes.reduce((total, scene) => total + scene.seconds, 0);
  if (totalSeconds !== brief.duration) {
    return Response.json({ error: `Scene duration must total exactly ${brief.duration} seconds.` }, { status: 400 });
  }

  const uniqueAssetIds = [...new Set(assetIds)];
  const admin = createAdminClient();
  let assets: { id: string; name: string; type: string; url: string }[] = [];
  if (uniqueAssetIds.length) {
    const { data, error } = await admin
      .from("assets")
      .select("id, name, type, url")
      .eq("user_id", user.id)
      .in("id", uniqueAssetIds);
    if (error) return Response.json({ error: "Unable to verify the selected assets." }, { status: 503 });
    if ((data ?? []).length !== uniqueAssetIds.length) {
      return Response.json({ error: "One or more selected assets are unavailable." }, { status: 404 });
    }
    assets = data ?? [];
  }

  const prompt = JSON.stringify({ brief, script: variant.script, hook: variant.hook, scenes: variant.scenes });
  const projectName = (brief.product || "Untitled ad").trim().slice(0, 80) || "Untitled ad";
  const { data: project, error: projectError } = await admin.from("projects").insert({
    user_id: user.id,
    name: projectName,
    source_type: "prompt",
    source_url: null,
    prompt: `${prompt}\n\n[Ratio: ${variant.aspectRatio}] [Duration: ${brief.duration}s]`,
    status: "processing",
    workflow_status: "in_progress",
    workflow_status_changed_at: new Date().toISOString(),
  }).select("id").single();
  if (projectError || !project) {
    return Response.json({ error: projectError?.message ?? "Unable to create your project." }, { status: 500 });
  }

  const input = { brief, variant, assets };
  const { data: job, error: jobError } = await admin.from("generation_jobs").insert({
    project_id: project.id,
    user_id: user.id,
    status: "queued",
    progress: 0,
    cost: 0,
    model: "mock-video-v1",
    input,
    max_attempts: 3,
    credits_reserved: 0,
  }).select("id, project_id, status, progress, cost, model, error, attempt_count, max_attempts").single();
  if (jobError || !job) {
    await admin.from("projects").delete().eq("id", project.id).eq("user_id", user.id);
    return Response.json({ error: jobError?.message ?? "Unable to queue your generation." }, { status: 500 });
  }

  const { error: scenesError } = await admin.from("generation_scenes").insert(variant.scenes.map((scene) => ({
    job_id: job.id,
    project_id: project.id,
    user_id: user.id,
    scene_number: scene.sceneNumber,
    status: "queued",
    progress: 0,
    seconds: scene.seconds,
    visual_description: scene.visualDescription,
    on_screen_text: scene.onScreenText,
    voiceover_line: scene.voiceoverLine,
  })));
  if (scenesError) {
    await admin.from("generation_jobs").delete().eq("id", job.id);
    await admin.from("projects").delete().eq("id", project.id).eq("user_id", user.id);
    return Response.json({ error: "Unable to queue the approved scenes." }, { status: 500 });
  }

  const { error: workerError } = await admin.functions.invoke("run-generation", { body: { jobId: job.id } });
  if (workerError) {
    const message = "The background worker could not be started. Check that the run-generation Edge Function is deployed.";
    await admin.from("generation_scenes").update({ status: "failed", error: message }).eq("job_id", job.id);
    await admin.from("generation_jobs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", job.id);
    await admin.from("projects").update({ status: "failed" }).eq("id", project.id).eq("user_id", user.id);
    await admin.rpc("refund_generation_job_credits", { p_job_id: job.id });
    return Response.json({ error: message, jobId: job.id, projectId: project.id }, { status: 503 });
  }

  await notifyAdminsOfNewProject({
    projectId: project.id,
    projectName,
    sourceType: "prompt",
    brief: `${variant.hook}\n\n${variant.script}`.slice(0, 12000),
  });

  return Response.json({ job: { ...job, project_name: projectName } }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}