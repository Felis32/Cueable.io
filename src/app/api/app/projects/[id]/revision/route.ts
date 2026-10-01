import { writeRequestActivity } from "@/lib/admin-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to request a revision." }, { status: 401 });

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Describe what you want changed." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 3000) {
    return Response.json({ error: "Describe the requested changes (up to 3,000 characters)." }, { status: 400 });
  }

  const { id } = await params;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, workflow_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Request not found." }, { status: 404 });
  if (project.workflow_status !== "delivered") {
    return Response.json({ error: "You can request changes after the project is delivered." }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: deliveredVersion, error: versionError } = await admin
    .from("request_versions")
    .select("id")
    .eq("request_id", id)
    .eq("is_delivered", true)
    .not("delivered_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (versionError) return Response.json({ error: versionError.message }, { status: 500 });
  if (!deliveredVersion) return Response.json({ error: "There is no delivered version to request changes for." }, { status: 409 });

  const { error: updateError } = await admin
    .from("projects")
    .update({ workflow_status: "revision_requested" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const activity = await writeRequestActivity(
    admin,
    id,
    user,
    "revision_requested",
    { message },
    typeof project.workflow_status === "string" ? project.workflow_status as Parameters<typeof writeRequestActivity>[5] : "new",
    "revision_requested",
  );
  if (activity.error) return Response.json({ error: activity.error.message }, { status: 500 });

  return Response.json({ ok: true });
}
