import {
  isRequestStatus,
  listAdminUsers,
  requireAdminContext,
  writeRequestActivity,
} from "@/lib/admin-requests";

export async function GET() {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { data: projects, error } = await context.admin
    .from("projects")
    .select("id, user_id, name, prompt, source_type, source_url, status, workflow_status, assigned_to, workflow_status_changed_at, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const projectRows = projects ?? [];
  const projectIds = projectRows.map((project) => project.id);
  const userIds = [...new Set(projectRows.map((project) => project.user_id).filter(Boolean))];

  const [profilesResult, versionsResult, team] = await Promise.all([
    userIds.length
      ? context.admin.from("profiles").select("*").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? context.admin
          .from("request_versions")
          .select("request_id, version_number, title, storage_path, thumbnail_path, is_delivered, delivered_at, created_at")
          .in("request_id", projectIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    listAdminUsers(context.admin),
  ]);

  if (versionsResult.error) return Response.json({ error: versionsResult.error.message }, { status: 500 });

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const latestVersion = new Map<string, (typeof versionsResult.data)[number]>();
  for (const version of versionsResult.data ?? []) {
    if (!latestVersion.has(version.request_id)) latestVersion.set(version.request_id, version);
  }

  const requestCounts = new Map<string, number>();
  for (const project of projectRows) {
    requestCounts.set(project.user_id, (requestCounts.get(project.user_id) ?? 0) + 1);
  }

  const requests = await Promise.all(projectRows.map(async (project) => {
    const profile = profiles.get(project.user_id) as Record<string, unknown> | undefined;
    const version = latestVersion.get(project.id);
    const [videoResult, thumbnailResult] = version
      ? await Promise.all([
          context.admin.storage.from("videos").createSignedUrl(version.storage_path, 3600),
          version.thumbnail_path
            ? context.admin.storage.from("videos").createSignedUrl(version.thumbnail_path, 3600)
            : Promise.resolve({ data: null }),
        ])
      : [{ data: null }, { data: null }];
    const versionUrls = {
      video_url: videoResult.data?.signedUrl ?? null,
      thumbnail_url: thumbnailResult.data?.signedUrl ?? null,
    };

    return {
      ...project,
      display_status: project.workflow_status,
      customer: {
        id: project.user_id,
        name: profile?.full_name ?? profile?.name ?? "Customer",
        email: profile?.email ?? null,
        plan: profile?.plan ?? profile?.subscription_tier ?? "—",
        request_count: requestCounts.get(project.user_id) ?? 0,
      },
      latest_version: version ? { ...version, ...versionUrls } : null,
    };
  }));

  return Response.json({ requests, team, currentAdminId: context.user.id });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let body: { ids?: unknown; action?: unknown; status?: unknown; assignedTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid bulk action." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string"))].slice(0, 100)
    : [];
  if (!ids.length) return Response.json({ error: "Select at least one request." }, { status: 400 });

  const { data: projects, error: projectsError } = await context.admin
    .from("projects")
    .select("id, workflow_status")
    .in("id", ids);
  if (projectsError) return Response.json({ error: projectsError.message }, { status: 500 });
  if (!projects?.length) return Response.json({ error: "No matching requests found." }, { status: 404 });

  let update: { workflow_status?: string; assigned_to?: string | null };
  let activity: PromiseLike<{ error: { message: string } | null }>[];

  if (body.action === "status") {
    if (!isRequestStatus(body.status) || body.status === "delivered") {
      return Response.json({ error: "Use the request detail page to deliver a version." }, { status: 400 });
    }
    update = { workflow_status: body.status };
    activity = projects.map((project) =>
      writeRequestActivity(context.admin, project.id, context.user, "status_changed", {}, project.workflow_status, body.status as Parameters<typeof writeRequestActivity>[5]),
    );
  } else if (body.action === "assign") {
    const assignedTo = body.assignedTo === null ? null : typeof body.assignedTo === "string" ? body.assignedTo : undefined;
    if (assignedTo === undefined) return Response.json({ error: "Choose a valid admin assignee." }, { status: 400 });
    if (assignedTo && !(await listAdminUsers(context.admin)).some((member) => member.id === assignedTo)) {
      return Response.json({ error: "Assignee must be an admin." }, { status: 400 });
    }
    update = { assigned_to: assignedTo };
    activity = projects.map((project) =>
      writeRequestActivity(context.admin, project.id, context.user, "assigned", { assigned_to: assignedTo }),
    );
  } else {
    return Response.json({ error: "Unsupported bulk action." }, { status: 400 });
  }

  const { error: updateError } = await context.admin.from("projects").update(update).in("id", projects.map((project) => project.id));
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const activityResults = await Promise.all(activity);
  const activityError = activityResults.find((result) => result.error)?.error;
  if (activityError) return Response.json({ error: activityError.message }, { status: 500 });

  return Response.json({ updated: projects.length });
}
