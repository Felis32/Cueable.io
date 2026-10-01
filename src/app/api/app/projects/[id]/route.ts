import { isRequestStatus, writeRequestActivity } from "@/lib/admin-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to edit this project." }, { status: 401 });

  let body: { name?: unknown; prompt?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid project update." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!name || name.length > 120 || !prompt || prompt.length > 12000) {
    return Response.json({ error: "Add a project title and brief (up to 12,000 characters)." }, { status: 400 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, workflow_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (project.workflow_status === "delivered") {
    return Response.json({ error: "This project has been delivered. Use Request changes instead." }, { status: 409 });
  }

  const nextStatus = "revision_requested";
  const { error: updateError } = await admin
    .from("projects")
    .update({ name, prompt, workflow_status: nextStatus })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const fromStatus = isRequestStatus(project.workflow_status) ? project.workflow_status : "new";
  const activity = await writeRequestActivity(admin, id, user, "customer_brief_updated", { name }, fromStatus, nextStatus);
  if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });

  return Response.json({ ok: true, name, prompt, workflow_status: nextStatus });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to delete this project." }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const [videosResult, versionsResult] = await Promise.all([
    admin.from("videos").select("storage_path").eq("project_id", id).eq("user_id", user.id),
    admin.from("request_versions").select("storage_path, thumbnail_path").eq("request_id", id),
  ]);
  if (videosResult.error) return Response.json({ error: videosResult.error.message }, { status: 500 });
  if (versionsResult.error) return Response.json({ error: versionsResult.error.message }, { status: 500 });

  const { error: deleteError } = await admin.from("projects").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 409 });

  const paths = [...new Set([
    ...(videosResult.data ?? []).map((video) => video.storage_path),
    ...(versionsResult.data ?? []).flatMap((version) => [version.storage_path, version.thumbnail_path]),
  ].filter((path): path is string => typeof path === "string" && path.length > 0))];
  if (paths.length) {
    const { error: storageError } = await admin.storage.from("videos").remove(paths);
    if (storageError) console.error("Unable to remove deleted project files:", storageError.message);
  }

  return Response.json({ ok: true });
}