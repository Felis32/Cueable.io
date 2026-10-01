import { isRequestStatus, requireAdminContext, writeRequestActivity } from "@/lib/admin-requests";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { id } = await params;
  let body: { storagePath?: unknown; storageToken?: unknown; thumbnailPath?: unknown; thumbnailToken?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid upload completion request." }, { status: 400 });
  }

  if (
    typeof body.storagePath !== "string" ||
    !body.storagePath.startsWith(`${id}/`) ||
    typeof body.thumbnailPath !== "string" ||
    !body.thumbnailPath.startsWith(`${id}/thumbnails/`)
  ) {
    return Response.json({ error: "Invalid uploaded file path." }, { status: 400 });
  }

  const { data: project, error: projectError } = await context.admin
    .from("projects")
    .select("id, user_id, workflow_status")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Request not found." }, { status: 404 });

  const { data: versions, error: versionsError } = await context.admin
    .from("request_versions")
    .select("version_number")
    .eq("request_id", id)
    .order("version_number", { ascending: false })
    .limit(1);
  if (versionsError) return Response.json({ error: versionsError.message }, { status: 500 });

  const versionNumber = (versions?.[0]?.version_number ?? 0) + 1;
  const { data: version, error: insertError } = await context.admin
    .from("request_versions")
    .insert({
      request_id: id,
      version_number: versionNumber,
      title: typeof body.title === "string" ? body.title.slice(0, 255) : `Version ${versionNumber}`,
      storage_path: body.storagePath,
      thumbnail_path: body.thumbnailPath,
      uploaded_by: context.user.id,
      is_delivered: false,
    })
    .select("id, version_number")
    .single();
  if (insertError) {
    await context.admin.storage.from("videos").remove([body.storagePath, body.thumbnailPath]);
    return Response.json({ error: insertError.message }, { status: 409 });
  }

  const previousStatus = isRequestStatus(project.workflow_status) ? project.workflow_status : "new";
  const nextStatus = "in_review";
  const { error: statusError } = await context.admin
    .from("projects")
    .update({ workflow_status: nextStatus })
    .eq("id", id);
  if (statusError) {
    await context.admin.from("request_versions").delete().eq("id", version.id);
    await context.admin.storage.from("videos").remove([body.storagePath, body.thumbnailPath]);
    return Response.json({ error: statusError.message }, { status: 500 });
  }

  const activity = await writeRequestActivity(
    context.admin,
    id,
    context.user,
    "version_uploaded",
    { version_id: version.id, version_number: version.version_number },
    previousStatus,
    nextStatus,
  );
  if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });

  return Response.json({ ok: true, versionId: version.id, versionNumber: version.version_number });
}
