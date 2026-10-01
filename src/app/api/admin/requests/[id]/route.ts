import {
  isRequestStatus,
  listAdminUsers,
  requireAdminContext,
  writeRequestActivity,
} from "@/lib/admin-requests";

function referenceUrls(prompt: string | null) {
  const section = prompt?.match(/Uploaded assets:\s*([\s\S]*?)(?=\n\n\[Ratio:|$)/i)?.[1];
  return (section ?? "")
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { id } = await params;
  const { data: project, error } = await context.admin
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!project) return Response.json({ error: "Request not found." }, { status: 404 });

  const [profileResult, userResult, countResult, versionsResult, notesResult, activityResult, assetsResult] = await Promise.all([
    context.admin.from("profiles").select("*").eq("id", project.user_id).maybeSingle(),
    context.admin.auth.admin.getUserById(project.user_id),
    context.admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", project.user_id),
    context.admin.from("request_versions").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    context.admin.from("internal_notes").select("id, author, note, created_at").eq("request_id", id).order("created_at", { ascending: true }),
    context.admin.from("request_activity").select("id, actor, action, from_status, to_status, details, created_at").eq("request_id", id).order("created_at", { ascending: false }).limit(100),
    context.admin.from("assets").select("name, url, type, created_at").eq("user_id", project.user_id),
  ]);

  const user = userResult.data.user;
  const profile = profileResult.data as Record<string, unknown> | null;
  const urls = referenceUrls(project.prompt);
  const customerAssets = (assetsResult.data ?? []).filter((asset) => urls.includes(asset.url));
  const versions = await Promise.all((versionsResult.data ?? []).map(async (version) => {
    const [{ data: video }, { data: thumbnail }] = await Promise.all([
      context.admin.storage.from("videos").createSignedUrl(version.storage_path, 3600),
      version.thumbnail_path
        ? context.admin.storage.from("videos").createSignedUrl(version.thumbnail_path, 3600)
        : Promise.resolve({ data: null }),
    ]);
    return { ...version, video_url: video?.signedUrl ?? null, thumbnail_url: thumbnail?.signedUrl ?? null };
  }));

  const authorIds = [...new Set([
    ...(notesResult.data ?? []).map((note) => note.author).filter(Boolean),
    ...(activityResult.data ?? []).map((entry) => entry.actor).filter(Boolean),
  ])];
  const authorsResult = authorIds.length
    ? await context.admin.from("profiles").select("id, full_name, email").in("id", authorIds)
    : { data: [] };
  const authorNames = new Map((authorsResult.data ?? []).map((author) => [author.id, author.full_name || author.email || "Admin"]));

  return Response.json({
    request: {
      ...project,
      customer: {
        id: project.user_id,
        name: profile?.full_name ?? user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "Customer",
        email: user?.email ?? profile?.email ?? null,
        plan: profile?.plan ?? profile?.subscription_tier ?? user?.app_metadata?.plan ?? user?.user_metadata?.plan ?? "—",
        request_count: countResult.count ?? 0,
      },
      attached_assets: customerAssets.length ? customerAssets : urls.map((url) => ({ url, name: url.split("/").pop() ?? "Reference asset", type: "" })),
    },
    versions,
    notes: (notesResult.data ?? []).map((note) => ({ ...note, author_name: authorNames.get(note.author) ?? "Admin" })),
    activity: (activityResult.data ?? []).map((entry) => ({ ...entry, actor_name: authorNames.get(entry.actor) ?? "Admin" })),
    team: await listAdminUsers(context.admin),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { id } = await params;
  let body: { action?: unknown; status?: unknown; assignedTo?: unknown; note?: unknown; versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request update." }, { status: 400 });
  }

  const { data: project, error: projectError } = await context.admin
    .from("projects")
    .select("id, workflow_status")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Request not found." }, { status: 404 });

  const currentStatus = isRequestStatus(project.workflow_status) ? project.workflow_status : "new";

  if (body.action === "status") {
    if (!isRequestStatus(body.status) || body.status === "delivered") {
      return Response.json({ error: "Use Deliver to customer to publish a version." }, { status: 400 });
    }
    const { error } = await context.admin.from("projects").update({ workflow_status: body.status }).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const activity = await writeRequestActivity(context.admin, id, context.user, "status_changed", {}, currentStatus, body.status);
    if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "assign") {
    const assignedTo = body.assignedTo === null ? null : typeof body.assignedTo === "string" ? body.assignedTo : undefined;
    if (assignedTo === undefined) return Response.json({ error: "Choose a valid admin assignee." }, { status: 400 });
    if (assignedTo && !(await listAdminUsers(context.admin)).some((member) => member.id === assignedTo)) {
      return Response.json({ error: "Assignee must be an admin." }, { status: 400 });
    }
    const { error } = await context.admin.from("projects").update({ assigned_to: assignedTo }).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const activity = await writeRequestActivity(context.admin, id, context.user, "assigned", { assigned_to: assignedTo });
    if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "note") {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note || note.length > 3000) return Response.json({ error: "Notes must be between 1 and 3000 characters." }, { status: 400 });
    const { error } = await context.admin.from("internal_notes").insert({ request_id: id, author: context.user.id, note });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const activity = await writeRequestActivity(context.admin, id, context.user, "note_added");
    if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "deliver") {
    if (typeof body.versionId !== "string") return Response.json({ error: "Choose a version to deliver." }, { status: 400 });
    const { data: version, error: versionError } = await context.admin
      .from("request_versions")
      .select("id, title")
      .eq("id", body.versionId)
      .eq("request_id", id)
      .maybeSingle();
    if (versionError) return Response.json({ error: versionError.message }, { status: 500 });
    if (!version) return Response.json({ error: "Version not found for this request." }, { status: 404 });

    const deliveredAt = new Date().toISOString();
    const { error: clearError } = await context.admin
      .from("request_versions")
      .update({ is_delivered: false, delivered_at: null })
      .eq("request_id", id);
    if (clearError) return Response.json({ error: clearError.message }, { status: 500 });

    const { error: versionUpdateError } = await context.admin
      .from("request_versions")
      .update({ is_delivered: true, delivered_at: deliveredAt })
      .eq("id", version.id);
    if (versionUpdateError) return Response.json({ error: versionUpdateError.message }, { status: 500 });

    const { error: statusError } = await context.admin
      .from("projects")
      .update({ workflow_status: "delivered" })
      .eq("id", id);
    if (statusError) return Response.json({ error: statusError.message }, { status: 500 });

    const activity = await writeRequestActivity(context.admin, id, context.user, "version_delivered", { version_id: version.id, title: version.title }, currentStatus, "delivered");
    if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unsupported request action." }, { status: 400 });
}
