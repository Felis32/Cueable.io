import { isAdminEmail } from "@/lib/admin";
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
  let body: { fileName?: unknown; contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (typeof body.contentType !== "string" || !body.contentType.startsWith("video/")) {
    return Response.json({ error: "Choose a valid video file." }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string"
    ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "final-video"
    : "final-video";

  try {
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return Response.json({ error: "Project request no longer exists." }, { status: 404 });

    const path = `${projectId}/${crypto.randomUUID()}-${fileName}`;
    const { data, error } = await admin.storage.from("videos").createSignedUploadUrl(path);
    if (error) throw error;

    return Response.json({ path, token: data.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare video upload.";
    return Response.json({ error: message }, { status: 500 });
  }
}