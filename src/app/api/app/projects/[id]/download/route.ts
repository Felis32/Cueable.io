import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to download this video." }, { status: 401 });

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
  if (project.workflow_status !== "delivered") {
    return Response.json({ error: "The admin must mark this project as delivered before download." }, { status: 403 });
  }

  const { data: version, error: versionError } = await admin
    .from("request_versions")
    .select("storage_path")
    .eq("request_id", id)
    .eq("is_delivered", true)
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) return Response.json({ error: versionError.message }, { status: 500 });
  if (!version) return Response.json({ error: "No delivered video is available." }, { status: 404 });

  const { data, error } = await admin.storage.from("videos").createSignedUrl(version.storage_path, 60, { download: true });
  if (error || !data?.signedUrl) return Response.json({ error: error?.message ?? "Unable to prepare the download." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}