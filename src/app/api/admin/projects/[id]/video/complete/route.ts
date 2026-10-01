import { isAdminEmail } from "@/lib/admin";
import { isRequestStatus, writeRequestActivity } from "@/lib/admin-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Sign in to upload a video." }, { status: 401 });
  if (!isAdminEmail(user.email)) return Response.json({ error: "Admin access required." }, { status: 403 });

  const { id: projectId } = await params;
  let body: { storagePath?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid upload completion request." }, { status: 400 });
  }

  if (typeof body.storagePath !== "string" || !body.storagePath.startsWith(`${projectId}/`)) {
    return Response.json({ error: "Invalid uploaded video path." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, workflow_status")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return Response.json({ error: "Project request no longer exists." }, { status: 404 });

    const { data: versions, error: versionsError } = await admin
      .from("request_versions")
      .select("version_number")
      .eq("request_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);
    if (versionsError) throw versionsError;

    const versionNumber = (versions?.[0]?.version_number ?? 0) + 1;
    const { data: version, error: insertError } = await admin.from("request_versions").insert({
      request_id: projectId,
      version_number: versionNumber,
      title: typeof body.title === "string" ? body.title.slice(0, 255) : `Version ${versionNumber}`,
      storage_path: body.storagePath,
      uploaded_by: user.id,
      is_delivered: false,
    }).select("id, version_number").single();

    if (insertError) {
      throw insertError;
    }

    const previousStatus = isRequestStatus(project.workflow_status) ? project.workflow_status : "new";
    const { error: updateError } = await admin
      .from("projects")
      .update({ workflow_status: "in_review" })
      .eq("id", projectId);

    if (updateError) {
      await admin.from("request_versions").delete().eq("id", version.id);
      throw updateError;
    }

    const activity = await writeRequestActivity(admin, projectId, user, "version_uploaded", { version_id: version.id, version_number: version.version_number }, previousStatus, "in_review");
    if (activity.error) throw activity.error;

    return Response.json({ ok: true, versionNumber: version.version_number });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to attach uploaded video.";
    return Response.json({ error: message }, { status: 500 });
  }
}