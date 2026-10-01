"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

type ProjectItem = {
  id: string;
  name: string;
  status: string;
  workflow_status?: string | null;
  source_type: string;
  prompt: string;
  source_url?: string | null;
  created_at?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
};

function getUploadedImageUrl(prompt: string | null | undefined) {
  const section = prompt?.match(/Uploaded assets:\s*([\s\S]*?)(?=\n\n\[Ratio:|$)/i)?.[1];
  return section?.split(/\r?\n/).map((url) => url.trim()).find((url) => /^https?:\/\//i.test(url) && /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url)) ?? null;
}

function getProjectStatusMeta(status: string | null | undefined) {
  const normalized = (status ?? "pending").toLowerCase().trim();

  if (["pending", "created", "processing", "new", "in_progress", "in_review", "delivered"].includes(normalized)) {
    return {
      label: normalized === "delivered" ? "Delivered" : normalized === "created" ? "Created" : normalized === "processing" ? "Processing" : normalized === "in_progress" ? "In progress" : normalized === "in_review" ? "In review" : normalized === "new" ? "New" : "Pending",
      className: normalized === "delivered" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-700",
    };
  }

  if (normalized === "revision_requested") {
    return { label: "Revision requested", className: "border-red-200 bg-red-50 text-red-700" };
  }

  if (normalized === "completed") {
    return { label: "Finalizing", className: "border-orange-200 bg-orange-50 text-orange-700" };
  }

  if (["ready", "approved", "done", "success"].includes(normalized)) {
    return {
      label: normalized === "completed" ? "Completed" : normalized === "ready" ? "Ready" : normalized === "approved" ? "Approved" : normalized === "done" ? "Done" : "Success",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (["rejected", "failed", "cancelled", "denied"].includes(normalized)) {
    return {
      label: normalized === "rejected" ? "Rejected" : normalized === "failed" ? "Failed" : normalized === "cancelled" ? "Cancelled" : "Denied",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    className: "border-line bg-paper text-muted",
  };
}

export function LibraryView() {
  const { t } = useTranslation();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectItem | null>(null);
  const [requestingChangesProject, setRequestingChangesProject] = useState<ProjectItem | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", prompt: "" });
  const [changeDescription, setChangeDescription] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(searchRef, showSearch, () => setShowSearch(false));
  useDismissOnOutside(filterRef, showFilterMenu, () => setShowFilterMenu(false));
  useDismissOnOutside(sortRef, showSortMenu, () => setShowSortMenu(false));

  useEffect(() => {
    void loadProjects();
    const supabase = createClient();
    const channel = supabase
      .channel("customer-project-library")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => void loadProjects())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function loadProjects() {
    setLoading(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const thumbnailResponse = await fetch("/api/app/projects/thumbnails", { cache: "no-store" });
        const thumbnailResult = thumbnailResponse.ok
          ? await thumbnailResponse.json() as { thumbnails?: Record<string, string> }
          : { thumbnails: {} };
        const thumbnailMap = thumbnailResult.thumbnails ?? {};
        setProjects((data as ProjectItem[]).map((project) => ({
          ...project,
          status: project.status === "failed" ? "failed" : project.workflow_status ?? project.status,
          thumbnail_url: thumbnailMap[project.id] ?? getUploadedImageUrl(project.prompt),
        })));
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(project: ProjectItem) {
    setActionError(null);
    setEditDraft({ name: project.name ?? "", prompt: project.prompt ?? "" });
    setEditingProject(project);
  }

  async function saveProjectEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProject || actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/app/projects/${editingProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const result = await response.json() as { error?: string; name?: string; prompt?: string; workflow_status?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update this project.");
      setProjects((current) => current.map((project) => project.id === editingProject.id
        ? { ...project, name: result.name ?? editDraft.name.trim(), prompt: result.prompt ?? editDraft.prompt.trim(), status: result.workflow_status ?? "revision_requested", workflow_status: result.workflow_status ?? "revision_requested" }
        : project));
      setEditingProject(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update this project.");
    } finally {
      setActionPending(false);
    }
  }

  async function deleteProject() {
    if (!deletingProject || actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/app/projects/${deletingProject.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to delete this project.");
      setProjects((current) => current.filter((project) => project.id !== deletingProject.id));
      setDeletingProject(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete this project.");
    } finally {
      setActionPending(false);
    }
  }

  async function submitChangeRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestingChangesProject || actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/app/projects/${requestingChangesProject.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: changeDescription }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to send your change request.");
      setProjects((current) => current.map((project) => project.id === requestingChangesProject.id
        ? { ...project, status: "revision_requested", workflow_status: "revision_requested" }
        : project));
      setRequestingChangesProject(null);
      setChangeDescription("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to send your change request.");
    } finally {
      setActionPending(false);
    }
  }

  const filteredProjects = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    let next = [...projects];

    if (normalized) {
      next = next.filter((project) => {
        const text = `${project.name} ${project.prompt ?? ""} ${project.source_url ?? ""}`.toLowerCase();
        return text.includes(normalized);
      });
    }

    if (filter === "completed") {
      next = next.filter((project) => project.workflow_status === "delivered");
    } else if (filter === "pending") {
      next = next.filter((project) => project.workflow_status !== "delivered");
    }

    if (sortBy === "newest") {
      next.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    } else if (sortBy === "oldest") {
      next.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    } else {
      next.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }

    return next;
  }, [filter, projects, search, sortBy]);

  const emptyState = !loading && filteredProjects.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-[1.2] text-ink-2">{t("Your library")}</h1>
          <p className="mt-1 text-[14px] text-muted">{t("A workspace for All your Ads")}</p>
        </div>
        <CreateButton align="right" />
      </header>

      <div className="mt-6 flex justify-end">
        <div className="flex items-center gap-1 text-muted">
          <div className="relative" ref={searchRef}>
            <ToolButton label={t("Search")} active={showSearch} onClick={() => setShowSearch((value) => !value)} tooltip={t("Search projects")}>
              <path d="M7 3.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6ZM10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </ToolButton>
            {showSearch ? (
              <div className="absolute right-0 top-11 z-20 w-64 rounded-[12px] border border-line bg-surface p-2 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("Search by title or prompt")}
                  className="h-9 w-full rounded-[10px] border border-line bg-paper px-3 text-[13px] text-ink outline-none"
                  autoFocus
                />
              </div>
            ) : null}
          </div>

          <div className="relative" ref={filterRef}>
            <ToolButton label={t("Filter")} active={showFilterMenu} onClick={() => setShowFilterMenu((value) => !value)} tooltip={t("Filter by status")}>
              <path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </ToolButton>
            {showFilterMenu ? (
              <div className="absolute right-0 top-11 z-20 w-36 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                {(["all", "pending", "completed"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setFilter(option);
                      setShowFilterMenu(false);
                    }}
                    className={`block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] ${filter === option ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}
                  >
                    {option === "all" ? t("All") : option === "pending" ? t("In progress") : t("Delivered")}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={sortRef}>
            <ToolButton label={t("Sort")} active={showSortMenu} onClick={() => setShowSortMenu((value) => !value)} tooltip={t("Sort projects")}>
              <path d="M5 3.5v9M5 3.5 3.2 5.2M5 3.5 6.8 5.2M11 12.5v-9M11 12.5 9.2 10.8M11 12.5l1.8-1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </ToolButton>
            {showSortMenu ? (
              <div className="absolute right-0 top-11 z-20 w-40 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                {([
                  ["newest", t("Newest first")],
                  ["oldest", t("Oldest first")],
                  ["name", t("Name A–Z")],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSortBy(value);
                      setShowSortMenu(false);
                    }}
                    className={`block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] ${sortBy === value ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ml-1 flex overflow-hidden rounded-[10px] border border-line">
            <ViewButton label={t("Grid")} active={view === "grid"} onClick={() => setView("grid")} tooltip={t("Grid view")}>
              <path d="M3.2 3.2h3.6v3.6H3.2V3.2Zm6 0h3.6v3.6H9.2V3.2Zm-6 6h3.6v3.6H3.2V9.2Zm6 0h3.6v3.6H9.2V9.2Z" stroke="currentColor" strokeWidth="1.2" />
            </ViewButton>
            <ViewButton label={t("List")} active={view === "list"} onClick={() => setView("list")} tooltip={t("List view")}>
              <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </ViewButton>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[14px] text-muted">{t("Loading your projects…")}</div>
      ) : emptyState ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-line text-muted-2">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <rect x="3" y="5" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9 9.2 13.2 11 9 12.8V9.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="mt-5 text-[16px] font-medium text-ink-2">{filter === "completed" ? t("You haven’t created an ad yet") : t("You haven’t cut an ad yet")}</h2>
          <p className="mt-1 max-w-[360px] text-[14px] leading-[1.45] text-muted">{t("Start from a prompt, a product URL, or stills you already have.")}</p>
          <div className="mt-5"><CreateButton align="center" /></div>
        </div>
      ) : view === "list" ? (
        <div className="mt-6 space-y-3">
          {filteredProjects.map((project) => (
            <article key={project.id} className="flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3 transition hover:border-[#d5cabd]">
              <Link href={`/app/projects/${project.id}`} className="group flex min-w-0 flex-1 items-center gap-4">
                <ProjectThumbnail project={project} size="list" />
                <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-4">
                  <p className="truncate text-[15px] font-medium text-ink-2">{project.name}</p>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${getProjectStatusMeta(project.status).className}`}>
                    {t(getProjectStatusMeta(project.status).label)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted">{project.source_type}</p>
                </div>
              </Link>
              <ProjectActions
                delivered={project.workflow_status === "delivered"}
                onEdit={() => openEdit(project)}
                onDelete={() => { setActionError(null); setDeletingProject(project); }}
                onRequestChanges={() => { setActionError(null); setChangeDescription(""); setRequestingChangesProject(project); }}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <article key={project.id} className="rounded-[16px] border border-line bg-surface p-3 transition hover:border-[#d5cabd]">
              <div className="flex items-start gap-2">
                <Link href={`/app/projects/${project.id}`} aria-label={`Open ${project.name}`} className="group min-w-0 flex-1">
                  <ProjectThumbnail project={project} size="grid" />
                </Link>
                <ProjectActions
                  delivered={project.workflow_status === "delivered"}
                  onEdit={() => openEdit(project)}
                  onDelete={() => { setActionError(null); setDeletingProject(project); }}
                  onRequestChanges={() => { setActionError(null); setChangeDescription(""); setRequestingChangesProject(project); }}
                />
              </div>
              <Link href={`/app/projects/${project.id}`} className="group mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink-2">{project.name}</p>
                  <p className="text-[12px] text-muted">{project.source_type}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${getProjectStatusMeta(project.status).className}`}>
                  {t(getProjectStatusMeta(project.status).label)}
                </span>
              </Link>
            </article>
          ))}
        </div>
      )}

      {editingProject ? (
        <ProjectDialog title={t("Modify project")} onClose={() => setEditingProject(null)}>
          <form onSubmit={(event) => void saveProjectEdits(event)} className="space-y-4">
            <label className="block text-[13px] text-muted">{t("Project title")}
              <input required maxLength={120} value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-paper px-3 text-[13px] text-ink" />
            </label>
            <label className="block text-[13px] text-muted">{t("Brief and requested changes")}
              <textarea required maxLength={12000} rows={7} value={editDraft.prompt} onChange={(event) => setEditDraft((current) => ({ ...current, prompt: event.target.value }))} className="mt-1.5 w-full resize-y rounded-[8px] border border-line bg-paper px-3 py-2 text-[13px] leading-5 text-ink" />
            </label>
            {actionError ? <p role="alert" className="text-[13px] text-red-700">{actionError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingProject(null)} className="h-10 rounded-[8px] border border-line px-3 text-[13px]">{t("Cancel")}</button>
              <button type="submit" disabled={actionPending} className="h-10 rounded-[8px] bg-ink px-4 text-[13px] font-medium text-surface disabled:opacity-50">{actionPending ? t("Saving…") : t("Save and notify team")}</button>
            </div>
          </form>
        </ProjectDialog>
      ) : null}

      {requestingChangesProject ? (
        <ProjectDialog title={t("Request changes")} onClose={() => setRequestingChangesProject(null)}>
          <form onSubmit={(event) => void submitChangeRequest(event)} className="space-y-4">
            <p className="text-[13px] leading-5 text-muted">{t("Describe what you would like changed in the delivered video.")}</p>
            <textarea required maxLength={3000} rows={6} value={changeDescription} onChange={(event) => setChangeDescription(event.target.value)} placeholder={t("Tell us what to change…")} className="w-full resize-y rounded-[8px] border border-line bg-paper px-3 py-2 text-[13px] leading-5 text-ink" />
            {actionError ? <p role="alert" className="text-[13px] text-red-700">{actionError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRequestingChangesProject(null)} className="h-10 rounded-[8px] border border-line px-3 text-[13px]">{t("Cancel")}</button>
              <button type="submit" disabled={actionPending} className="h-10 rounded-[8px] bg-ink px-4 text-[13px] font-medium text-surface disabled:opacity-50">{actionPending ? t("Sending…") : t("Send request")}</button>
            </div>
          </form>
        </ProjectDialog>
      ) : null}

      {deletingProject ? (
        <ProjectDialog title={t("Delete project?")} onClose={() => setDeletingProject(null)}>
          <p className="text-[13px] leading-5 text-muted">{t("{{name}} and its uploaded video versions will be deleted. This cannot be undone.", { name: `“${deletingProject.name}”` })}</p>
          {actionError ? <p role="alert" className="mt-3 text-[13px] text-red-700">{actionError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeletingProject(null)} className="h-10 rounded-[8px] border border-line px-3 text-[13px]">{t("Cancel")}</button>
            <button type="button" onClick={() => void deleteProject()} disabled={actionPending} className="h-10 rounded-[8px] bg-red-700 px-4 text-[13px] font-medium text-white disabled:opacity-50">{actionPending ? t("Deleting…") : t("Delete project")}</button>
          </div>
        </ProjectDialog>
      ) : null}
    </div>
  );
}

function ProjectActions({ delivered, onEdit, onDelete, onRequestChanges }: { delivered: boolean; onEdit: () => void; onDelete: () => void; onRequestChanges: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(rootRef, open, () => setOpen(false));

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button type="button" aria-label={t("Project actions")} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-sidebar hover:text-ink">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><circle cx="3" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="13" cy="8" r="1.2" /></svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-48 rounded-[8px] border border-line bg-surface p-1 shadow-[0_14px_34px_rgba(23,23,23,0.12)]">
          <button type="button" disabled={delivered} onClick={() => { setOpen(false); onEdit(); }} className="block w-full rounded-[6px] px-3 py-2 text-left text-[13px] text-ink hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-45">{t("Modify project")}</button>
          <button type="button" disabled={!delivered} onClick={() => { setOpen(false); onRequestChanges(); }} className="block w-full rounded-[6px] px-3 py-2 text-left text-[13px] text-ink hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-45">{t("Request changes")}</button>
          <div className="my-1 border-t border-line" />
          <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="block w-full rounded-[6px] px-3 py-2 text-left text-[13px] text-red-700 hover:bg-red-50">{t("Delete project")}</button>
        </div>
      ) : null}
    </div>
  );
}

function ProjectDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-[12px] border border-line bg-surface p-5 shadow-[0_24px_70px_rgba(17,18,20,0.24)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-medium text-ink-2">{title}</h2>
          <button type="button" aria-label={t("Close dialog")} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[7px] text-muted hover:bg-sidebar hover:text-ink">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProjectThumbnail({ project, size }: { project: ProjectItem; size: "grid" | "list" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = project.thumbnail_url ?? getUploadedImageUrl(project.prompt);
  const frameSize = size === "list" ? "h-20 w-32" : "h-32 w-full";
  const palettes = [
    { background: "#e8dfd8", accent: "#b66b52", light: "#f8f4ee", dark: "#31312c" },
    { background: "#e1e9e4", accent: "#647e70", light: "#f5f5ed", dark: "#343a36" },
    { background: "#e1e8ed", accent: "#668293", light: "#f5f6f4", dark: "#34383b" },
    { background: "#eee5d4", accent: "#a9804f", light: "#faf5e9", dark: "#3c352d" },
  ];
  const paletteIndex = [...project.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palettes.length;
  const palette = palettes[paletteIndex];

  return (
    <div className={`relative ${frameSize} shrink-0 overflow-hidden rounded-[12px] border border-line bg-sidebar`}>
      {imageUrl && !imageFailed ? (
        <img src={imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: palette.background }}>
          <div aria-hidden className="absolute left-[8%] top-[16%] h-[68%] w-[31%] rounded-[5px]" style={{ backgroundColor: palette.accent }} />
          <div aria-hidden className="absolute right-[11%] top-[10%] h-[76%] w-[39%] -rotate-[7deg] rounded-[5px]" style={{ backgroundColor: palette.light }} />
          <div aria-hidden className="absolute bottom-[14%] left-[35%] h-[25%] w-[42%] rotate-[4deg] rounded-[4px]" style={{ backgroundColor: palette.dark }} />
          <div aria-hidden className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/80 shadow-sm">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2.5v7l5-3.5-5-3.5Z" fill={palette.dark} /></svg>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateButton({ align }: { align: "right" | "center" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(rootRef, open, () => setOpen(false));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13.5px] font-medium text-surface"
      >
        {t("+ Create new")}
        <span aria-hidden className="text-[10px] opacity-80">▾</span>
      </button>
      {open ? (
        <div className={`absolute top-11 z-10 w-52 rounded-[14px] border border-line bg-surface p-1.5 text-left shadow-[0_16px_40px_rgba(23,23,23,0.12)] ${align === "center" ? "left-1/2 -translate-x-1/2" : "right-0"}`}>
          <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            {t("Ad from a prompt")}
          </Link>
          <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            {t("Ad from a URL")}
          </Link>
          <Link href="/app/assets" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            {t("Ad from assets")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  tooltip,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] transition ${active ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          {children}
        </svg>
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] text-ink opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        {tooltip}
      </span>
    </div>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  tooltip,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center ${active ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          {children}
        </svg>
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] text-ink opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        {tooltip}
      </span>
    </div>
  );
}
