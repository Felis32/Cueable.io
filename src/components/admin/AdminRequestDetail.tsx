"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const statuses = ["new", "in_progress", "in_review", "delivered", "revision_requested", "completed"] as const;
type RequestStatus = (typeof statuses)[number];
type TeamMember = { id: string; email: string; name: string };
type RequestVersion = {
  id: string;
  version_number: number;
  title: string;
  created_at: string;
  delivered_at: string | null;
  is_delivered: boolean;
  video_url: string | null;
  thumbnail_url: string | null;
};
type RequestRecord = {
  id: string;
  name: string;
  prompt: string | null;
  source_type: string | null;
  source_url: string | null;
  workflow_status: RequestStatus;
  workflow_status_changed_at: string;
  assigned_to: string | null;
  created_at: string;
  customer: { name: string; email: string | null; plan: string; request_count: number };
  attached_assets: { url: string; name: string; type?: string }[];
};
type DetailData = {
  request: RequestRecord;
  versions: RequestVersion[];
  notes: { id: string; author_name: string; note: string; created_at: string }[];
  activity: { id: string; actor_name: string; action: string; from_status: string | null; to_status: string | null; details: Record<string, unknown>; created_at: string }[];
  team: TeamMember[];
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function extractFirstFrame(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };
    const capture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) {
        cleanup();
        reject(new Error("This video could not be previewed in the browser."));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error("Unable to create a video thumbnail."));
      }, "image/jpeg", 0.82);
    };

    video.addEventListener("loadeddata", capture, { once: true });
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("This video format could not be previewed in the browser."));
    }, { once: true });
  });
}

function uploadWithProgress(path: string, token: string, file: Blob, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || !apiKey) {
      reject(new Error("Supabase upload configuration is missing."));
      return;
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `${baseUrl}/storage/v1/object/upload/sign/videos/${encodedPath}?token=${encodeURIComponent(token)}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    void createClient().auth.getSession().then(({ data }) => {
      if (data.session?.access_token) xhr.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(xhr.responseText || `Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading."));
      xhr.onabort = () => reject(new Error("Upload was cancelled."));
      const formData = new FormData();
      formData.append("cacheControl", "3600");
      formData.append("", file, file instanceof File ? file.name : "thumbnail.jpg");
      xhr.send(formData);
    }).catch(() => reject(new Error("Unable to authorize the upload.")));
  });
}

export function AdminRequestDetail({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  async function loadDetail() {
    try {
      const response = await fetch(`/api/admin/requests/${requestId}`, { cache: "no-store" });
      const result = await response.json() as DetailData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load request.");
      setDetail(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load request.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-request-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `id=eq.${requestId}` }, () => void loadDetail())
      .subscribe();
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [requestId]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update request.");
      await loadDetail();
      setMessage("Request updated.");
      return true;
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Unable to update request.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith("video/")) {
      setMessage("Choose a video file.");
      return;
    }

    setBusy(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const thumbnail = await extractFirstFrame(file);
      const urlResponse = await fetch(`/api/admin/requests/${requestId}/versions/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      });
      const upload = await urlResponse.json() as { error?: string; storagePath?: string; storageToken?: string; thumbnailPath?: string; thumbnailToken?: string };
      if (!urlResponse.ok || !upload.storagePath || !upload.storageToken || !upload.thumbnailPath || !upload.thumbnailToken) {
        throw new Error(upload.error ?? "Unable to prepare video upload.");
      }

      await uploadWithProgress(upload.storagePath, upload.storageToken, file, setUploadProgress);
      setUploadProgress(97);
      await uploadWithProgress(upload.thumbnailPath, upload.thumbnailToken, thumbnail, () => setUploadProgress(99));

      const completeResponse = await fetch(`/api/admin/requests/${requestId}/versions/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: upload.storagePath, thumbnailPath: upload.thumbnailPath, title: file.name }),
      });
      const result = await completeResponse.json() as { error?: string; versionNumber?: number };
      if (!completeResponse.ok) throw new Error(result.error ?? "Unable to save video version.");
      setUploadProgress(100);
      await loadDetail();
      setMessage(`Version ${result.versionNumber ?? ""} uploaded for internal review.`);
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "Video upload failed.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setUploadProgress(0), 900);
    }
  }

  if (loading) return <div className="mx-auto max-w-5xl p-8 text-[14px] text-muted">Loading request…</div>;
  if (error || !detail) return <div className="mx-auto max-w-5xl p-8 text-[14px] text-red-700">{error ?? "Request not found."}</div>;

  const request = detail.request;
  const statusAgeHours = Math.max(0, Math.floor((now - new Date(request.workflow_status_changed_at).getTime()) / 3_600_000));
  const isOverdue = !["delivered", "completed"].includes(request.workflow_status) && statusAgeHours >= 24;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <Link href="/admin" className="text-[12px] text-muted hover:text-ink">← Admin queue</Link>
          <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">{request.source_type || "Request"} · {new Date(request.created_at).toLocaleString()}</p>
          <h1 className="mt-2 font-serif text-[30px] leading-tight text-ink-2">{request.name || "Untitled request"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[12px] ${request.workflow_status === "revision_requested" ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-surface text-ink"}`}>
            {request.workflow_status === "revision_requested" ? "Revision requested" : titleCase(request.workflow_status)}
          </span>
          <span className={`text-[12px] ${isOverdue ? "font-medium text-red-700" : "text-muted"}`}>{statusAgeHours}h in status{isOverdue ? " · overdue" : ""}</span>
        </div>
      </header>

      {message ? <p role="status" className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-muted">{message}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-medium text-ink-2">Request brief</h2>
                <p className="mt-1 text-[11px] text-muted">Full customer prompt and reference material</p>
              </div>
              {request.source_url ? <a href={request.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-ink underline">Open source URL</a> : null}
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words text-[14px] leading-[1.65] text-ink-2">{request.prompt || "No prompt provided."}</p>
            {request.attached_assets.length ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[12px] font-medium text-ink-2">Reference assets</h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {request.attached_assets.map((asset) => (
                    <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="flex max-w-full items-center gap-2 rounded-[6px] border border-line px-3 py-2 text-[12px] text-muted hover:text-ink">
                      {asset.type?.startsWith("image/") ? <img src={asset.url} alt="" className="h-10 w-10 rounded-[4px] object-cover" /> : null}
                      <span className="max-w-[220px] truncate">{asset.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-medium text-ink-2">Video versions</h2>
                <p className="mt-1 text-[11px] text-muted">Uploads stay internal until you deliver a version.</p>
              </div>
              <label
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files[0];
                  if (file) void handleUpload(file);
                }}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-[7px] border border-dashed px-4 text-[12px] font-medium text-ink ${dragging ? "border-olive bg-olive/10" : "border-line hover:bg-paper"}`}
              >
                Drop or choose video
                <input type="file" accept="video/*" className="sr-only" disabled={busy} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(file);
                  event.target.value = "";
                }} />
              </label>
            </div>
            {busy && uploadProgress > 0 ? (
              <div className="mt-4" aria-live="polite">
                <div className="flex justify-between text-[11px] text-muted"><span>Uploading and processing thumbnail</span><span>{uploadProgress}%</span></div>
                <progress className="mt-2 h-2 w-full accent-olive" max={100} value={uploadProgress}>{uploadProgress}%</progress>
              </div>
            ) : null}
            <div className="mt-5 space-y-5">
              {detail.versions.map((version) => (
                <article key={version.id} className="border-t border-line pt-5 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[13px] font-medium text-ink-2">Version {version.version_number} · {version.title}</h3>
                      <p className="mt-1 text-[11px] text-muted">Uploaded {new Date(version.created_at).toLocaleString()}</p>
                    </div>
                    {version.is_delivered ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">Delivered</span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void mutate({ action: "deliver", versionId: version.id })} className="h-9 rounded-[7px] bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-50">
                        Deliver to customer
                      </button>
                    )}
                  </div>
                  {version.video_url ? <video controls preload="metadata" src={version.video_url} poster={version.thumbnail_url ?? undefined} className="mt-3 max-h-[420px] w-full rounded-[6px] bg-ink" /> : <p className="mt-3 text-[12px] text-red-700">Video preview is unavailable. Refresh to generate a new signed URL.</p>}
                </article>
              ))}
              {!detail.versions.length ? <p className="border-t border-line pt-4 text-[13px] text-muted">No video versions uploaded yet.</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium text-ink-2">Internal notes</h2>
            <p className="mt-1 text-[11px] text-muted">Visible to admins only. Never shown to the customer.</p>
            <form className="mt-4" onSubmit={(event) => {
              event.preventDefault();
              const note = noteDraft.trim();
              if (!note) return;
              void mutate({ action: "note", note }).then((saved) => { if (saved) setNoteDraft(""); });
            }}>
              <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={3000} placeholder="Add a note for the team" className="min-h-20 w-full resize-y rounded-[7px] border border-line bg-paper px-3 py-2 text-[13px] outline-none focus:border-[#b7aa9c]" />
              <button type="submit" disabled={busy || !noteDraft.trim()} className="mt-2 h-9 rounded-[7px] bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-50">Add note</button>
            </form>
            <div className="mt-4 divide-y divide-line">
              {detail.notes.map((note) => (
                <article key={note.id} className="py-3 first:pt-0">
                  <div className="flex justify-between gap-3 text-[11px] text-muted"><span className="font-medium text-ink-2">{note.author_name}</span><time>{new Date(note.created_at).toLocaleString()}</time></div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-ink-2">{note.note}</p>
                </article>
              ))}
              {!detail.notes.length ? <p className="py-3 text-[12px] text-muted">No internal notes yet.</p> : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium text-ink-2">Workflow</h2>
            <label className="mt-4 block text-[11px] text-muted">Status
              <select value={request.workflow_status} disabled={busy} onChange={(event) => void mutate({ action: "status", status: event.target.value })} className="mt-1.5 h-10 w-full rounded-[7px] border border-line bg-paper px-3 text-[13px] text-ink">
                {statuses.filter((status) => status !== "delivered").map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                {request.workflow_status === "delivered" ? <option value="delivered">Delivered · explicit action</option> : null}
              </select>
            </label>
            {detail.team.length > 1 ? (
              <label className="mt-4 block text-[11px] text-muted">Assigned to
                <select value={request.assigned_to ?? ""} disabled={busy} onChange={(event) => void mutate({ action: "assign", assignedTo: event.target.value || null })} className="mt-1.5 h-10 w-full rounded-[7px] border border-line bg-paper px-3 text-[13px] text-ink">
                  <option value="">Unassigned</option>
                  {detail.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12px]">
              <div><p className="text-muted">Current status age</p><p className={`mt-1 font-medium ${isOverdue ? "text-red-700" : "text-ink-2"}`}>{statusAgeHours} hours</p></div>
              <div><p className="text-muted">Request age</p><p className="mt-1 font-medium text-ink-2">{Math.max(0, Math.floor((now - new Date(request.created_at).getTime()) / 86_400_000))} days</p></div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium text-ink-2">Customer</h2>
            <dl className="mt-4 space-y-3 text-[12px]">
              <div><dt className="text-muted">Name</dt><dd className="mt-0.5 font-medium text-ink-2">{request.customer.name}</dd></div>
              <div><dt className="text-muted">Email</dt><dd className="mt-0.5 break-all font-medium text-ink-2">{request.customer.email ?? "Unavailable"}</dd></div>
              <div><dt className="text-muted">Plan</dt><dd className="mt-0.5 font-medium text-ink-2">{String(request.customer.plan)}</dd></div>
              <div><dt className="text-muted">Past requests</dt><dd className="mt-0.5 font-medium text-ink-2">{request.customer.request_count}</dd></div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium text-ink-2">Activity</h2>
            <div className="mt-3 divide-y divide-line">
              {detail.activity.map((entry) => (
                <div key={entry.id} className="py-3 first:pt-0">
                  <p className="text-[12px] text-ink-2"><span className="font-medium">{entry.actor_name}</span> {entry.action.replaceAll("_", " ")}</p>
                  {entry.from_status || entry.to_status ? <p className="mt-1 text-[11px] text-muted">{entry.from_status ? titleCase(entry.from_status) : "—"} → {entry.to_status ? titleCase(entry.to_status) : "—"}</p> : null}
                  <time className="mt-1 block text-[10px] text-muted">{new Date(entry.created_at).toLocaleString()}</time>
                </div>
              ))}
              {!detail.activity.length ? <p className="py-3 text-[12px] text-muted">No activity yet.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
