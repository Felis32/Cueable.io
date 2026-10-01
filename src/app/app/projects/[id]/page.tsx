import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectRealtime } from "@/components/app/ProjectRealtime";
import { VideoProgress } from "@/components/app/VideoProgress";
import { LocalizedText } from "@/lib/app-i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function getProjectStatusMeta(status: string | null | undefined) {
  const normalized = (status ?? "pending").toLowerCase().trim();

  if (["pending", "created", "processing", "new", "in_progress", "in_review", "delivered"].includes(normalized)) {
    return {
      label: normalized === "delivered" ? "Delivered" : normalized === "created" ? "Created" : normalized === "processing" ? "Processing" : normalized === "in_progress" ? "In progress" : normalized === "in_review" ? "In review" : normalized === "new" ? "New" : "Pending",
      className: normalized === "delivered" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-700",
      description: normalized === "delivered" ? "Your ad is ready to view" : normalized === "in_review" ? "Your final video is being prepared" : "Your ad is in progress",
    };
  }

  if (normalized === "revision_requested") {
    return { label: "Changes requested", className: "border-red-200 bg-red-50 text-red-700", description: "Your requested changes are being prepared" };
  }

  if (["completed", "ready", "approved", "done", "success"].includes(normalized)) {
    return {
      label: normalized === "completed" ? "Finalizing" : normalized === "ready" ? "Ready" : normalized === "approved" ? "Approved" : normalized === "done" ? "Done" : "Success",
      className: "border-orange-200 bg-orange-50 text-orange-700",
      description: "Your video is being finalized",
    };
  }

  if (["rejected", "failed", "cancelled", "denied"].includes(normalized)) {
    return {
      label: normalized === "rejected" ? "Rejected" : normalized === "failed" ? "Failed" : normalized === "cancelled" ? "Cancelled" : "Denied",
      className: "border-red-200 bg-red-50 text-red-700",
      description: "This project could not be completed",
    };
  }

  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    className: "border-line bg-paper text-muted",
    description: "Project in progress",
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !project) {
    redirect("/app/projects");
  }

  const { data: deliveredVersion } = await supabase
    .from("request_versions")
    .select("storage_path, title, delivered_at")
    .eq("request_id", id)
    .eq("is_delivered", true)
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = project.status === "failed" ? "failed" : project.workflow_status ?? project.status ?? "pending";
  const statusMeta = getProjectStatusMeta(status);
  let videoUrl: string | null = null;
  let videoTitle: string | null = null;
  if (status === "delivered" && typeof deliveredVersion?.storage_path === "string") {
    const admin = createAdminClient();
    const { data: signedVideo } = await admin.storage.from("videos").createSignedUrl(deliveredVersion.storage_path, 3600);
    videoUrl = signedVideo?.signedUrl ?? null;
    videoTitle = deliveredVersion.title;
  }
  const prompt = project.prompt || project.source_url;
  const ratio = prompt.match(/\[Ratio:\s*([^\]]+)\]/i)?.[1] ?? "9:16";
  const duration = prompt.match(/\[Duration:\s*([^\]]+)\]/i)?.[1] ?? "20s";

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted"><LocalizedText message={statusMeta.description} /></p>
        <span className={`rounded-full border px-3 py-1 text-[12px] ${statusMeta.className}`}><LocalizedText message={statusMeta.label} /></span>
      </div>

      <h1 className="mt-2 font-serif text-[32px] leading-[1.15] text-ink-2">{project.name}</h1>

      <div className="mt-6 rounded-[18px] border border-line bg-surface p-4">
        <p className="text-[13px] font-medium text-ink-2"><LocalizedText message="Brief" /></p>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted">{prompt ?? <LocalizedText message="No brief provided." />}</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        {[
          ["Source", project.source_type || "prompt"],
          ["Ratio", ratio],
          ["Duration", duration],
          ["Created", project.created_at ? new Date(project.created_at).toLocaleDateString() : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[12px] border border-line bg-surface px-3 py-2">
            <dt className="text-muted"><LocalizedText message={label} /></dt>
            <dd className="mt-1 font-medium text-ink-2">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        {videoUrl && status === "delivered" ? (
          <a href={`/api/app/projects/${id}/download`} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface">
            <LocalizedText message={videoTitle ? "Download {{title}}" : "Download final ad"} values={videoTitle ? { title: videoTitle } : undefined} />
          </a>
        ) : (
          <VideoProgress status={status} compact />
        )}
        <Link href="/app/create" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-[13px] font-medium text-ink">
          <LocalizedText message="New brief" />
        </Link>
        <ProjectRealtime projectId={id} status={status} />
      </div>

      {videoUrl && status === "delivered" ? (
        <div className="mt-8 overflow-hidden rounded-[18px] border border-line bg-surface">
          <video controls src={videoUrl} className="max-h-[500px] w-full object-cover" />
        </div>
      ) : (
        <div className="mt-8">
          <VideoProgress status={status} />
        </div>
      )}
    </div>
  );
}
