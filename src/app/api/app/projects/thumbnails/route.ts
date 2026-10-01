import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to view project thumbnails." }, { status: 401 });

  const admin = createAdminClient();
  const { data: projects, error: projectsError } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", user.id);
  if (projectsError) return Response.json({ error: projectsError.message }, { status: 500 });

  const projectIds = (projects ?? []).map((project) => project.id);
  if (!projectIds.length) return Response.json({ thumbnails: {} });

  const { data: versions, error: versionsError } = await admin
    .from("request_versions")
    .select("request_id, thumbnail_path, delivered_at, created_at")
    .in("request_id", projectIds)
    .eq("is_delivered", true)
    .not("delivered_at", "is", null)
    .not("thumbnail_path", "is", null)
    .order("delivered_at", { ascending: false });
  if (versionsError) return Response.json({ error: versionsError.message }, { status: 500 });

  const latestByProject = new Map<string, (typeof versions)[number]>();
  for (const version of versions ?? []) {
    if (!latestByProject.has(version.request_id) && version.thumbnail_path) {
      latestByProject.set(version.request_id, version);
    }
  }

  const thumbnailEntries = await Promise.all([...latestByProject].map(async ([projectId, version]) => {
    const { data } = await admin.storage.from("videos").createSignedUrl(version.thumbnail_path, 900);
    return data?.signedUrl ? [projectId, data.signedUrl] as const : null;
  }));
  const thumbnails = Object.fromEntries(thumbnailEntries.filter((entry): entry is readonly [string, string] => entry !== null));

  return Response.json({ thumbnails }, { headers: { "Cache-Control": "private, no-store" } });
}