import { requireAdminContext } from "@/lib/admin-requests";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  const { id } = await params;
  let body: { fileName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string"
    ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "final-video.mp4"
    : "final-video.mp4";

  const { data: project, error: projectError } = await context.admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Request not found." }, { status: 404 });

  const uploadId = crypto.randomUUID();
  const storagePath = `${id}/${uploadId}-${fileName}`;
  const thumbnailPath = `${id}/thumbnails/${uploadId}.jpg`;
  const [videoUpload, thumbnailUpload] = await Promise.all([
    context.admin.storage.from("videos").createSignedUploadUrl(storagePath),
    context.admin.storage.from("videos").createSignedUploadUrl(thumbnailPath),
  ]);

  if (videoUpload.error || thumbnailUpload.error) {
    return Response.json({ error: videoUpload.error?.message ?? thumbnailUpload.error?.message ?? "Unable to prepare uploads." }, { status: 500 });
  }

  return Response.json({
    storagePath,
    storageToken: videoUpload.data.token,
    thumbnailPath,
    thumbnailToken: thumbnailUpload.data.token,
  });
}
