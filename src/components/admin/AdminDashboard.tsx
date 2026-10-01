"use client";

import { useEffect, useState } from "react";
import { templateCategories } from "@/data/templates";
import { HOME_CARD_HOVER_ANIMATIONS, type HomeCardHoverAnimation } from "@/data/home-content";
import { createClient } from "@/lib/supabase/client";
import { AdminRequestWorkspace } from "@/components/admin/AdminRequestWorkspace";
import { FreeModelCatalog } from "@/components/admin/FreeModelCatalog";
import { FreeModelUserControls } from "@/components/admin/FreeModelUserControls";
import { LogoMark } from "@/components/marketing/LogoMark";

type ProjectItem = {
  id: string;
  name: string;
  user_id: string;
  status: string | null;
  workflow_status?: string | null;
  prompt: string | null;
  source_type: string | null;
  source_url: string | null;
  video_url: string | null;
  created_at: string | null;
};

type VideoItem = {
  project_id: string;
  user_id: string;
  title: string | null;
  storage_path: string;
  status: string | null;
  duration: number | null;
  created_at: string | null;
};

type HomeCardMediaType = "text" | "image" | "audio" | "video";
type HomeContentSection = "features" | "examples" | "client_work";

type HomeCardItem = {
  id: string;
  section: HomeContentSection;
  title: string;
  body?: string;
  meta?: string;
  tint?: string;
  kind?: string;
  media_type?: HomeCardMediaType;
  media_url?: string;
  text_content?: string;
  hover_animation?: HomeCardHoverAnimation;
  created_at?: string;
};

type HomeCardDraft = {
  title: string;
  body: string;
  media_type: HomeCardMediaType;
  media_url: string;
  text_content: string;
  tint: string;
  kind: string;
  hover_animation: HomeCardHoverAnimation;
};

type TemplateItem = {
  id: string;
  title: string;
  category: string;
  duration: string;
  ratio: string;
  tint: "rose" | "sage" | "peach" | "sky";
  source?: "seed" | "custom" | "admin";
  created_at?: string;
};

const HOME_CONTENT_KEY = "primecut-home-content";
const TEMPLATE_STORAGE_KEY = "primecut-custom-templates";

function readLocalHomeContent() {
  if (typeof window === "undefined") return { features: [] as HomeCardItem[], examples: [] as HomeCardItem[], clientWork: [] as HomeCardItem[] };
  try {
    const raw = window.localStorage.getItem(HOME_CONTENT_KEY);
    if (!raw) return { features: [], examples: [], clientWork: [] };
    const parsed = JSON.parse(raw) as { features?: HomeCardItem[]; examples?: HomeCardItem[]; clientWork?: HomeCardItem[] };
    return {
      features: Array.isArray(parsed.features) ? parsed.features : [],
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      clientWork: Array.isArray(parsed.clientWork) ? parsed.clientWork : [],
    };
  } catch {
    return { features: [], examples: [], clientWork: [] };
  }
}

function saveLocalHomeContent(next: { features: HomeCardItem[]; examples: HomeCardItem[]; clientWork: HomeCardItem[] }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_CONTENT_KEY, JSON.stringify(next));
}

function readLocalTemplates() {
  if (typeof window === "undefined") return [] as TemplateItem[];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [] as TemplateItem[];
    const parsed = JSON.parse(raw) as TemplateItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as TemplateItem[];
  }
}

function saveLocalTemplates(items: TemplateItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(items));
}

export function AdminDashboard() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [contentFeedback, setContentFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [contentSaving, setContentSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"overview" | "requests" | "content" | "models" | "users">("overview");
  const [activeContent, setActiveContent] = useState<"features" | "templates" | "examples" | "client_work">("features");
  const [features, setFeatures] = useState<HomeCardItem[]>([]);
  const [examples, setExamples] = useState<HomeCardItem[]>([]);
  const [clientWork, setClientWork] = useState<HomeCardItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [featureDraft, setFeatureDraft] = useState<HomeCardDraft>({
    title: "",
    body: "",
    media_type: "text",
    media_url: "",
    text_content: "",
    tint: "bg-tint-rose",
    kind: "play",
    hover_animation: "none",
  });
  const [exampleDraft, setExampleDraft] = useState<HomeCardDraft & { meta: string }>({
    title: "",
    body: "",
    meta: "Example · 0:15",
    media_type: "text",
    media_url: "",
    text_content: "",
    tint: "bg-night",
    kind: "play",
    hover_animation: "none",
  });
  const [templateDraft, setTemplateDraft] = useState({
    title: "",
    category: "Product",
    duration: "0:15",
    ratio: "9:16",
    tint: "peach" as TemplateItem["tint"],
  });

  useEffect(() => {
    void loadProjects();
    void loadHomeContent();
    void loadTemplates();
    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => void loadProjects())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function loadProjects() {
    const supabase = createClient();
    setLoading(true);
    setProjectsError(null);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("project_id, user_id, title, storage_path, status, duration, created_at")
        .order("created_at", { ascending: false });
      if (videosError) throw new Error(videosError.message);

      const latestVideoByProject = new Map<string, VideoItem>();
      for (const video of (videos ?? []) as VideoItem[]) {
        if (!latestVideoByProject.has(video.project_id)) latestVideoByProject.set(video.project_id, video);
      }

      setProjects((data ?? []).map((project) => {
        const video = latestVideoByProject.get(project.id);
        return {
          ...(project as Omit<ProjectItem, "video_url">),
          video_url: video ? supabase.storage.from("videos").getPublicUrl(video.storage_path).data.publicUrl : null,
        };
      }));
    } catch (error) {
      setProjects([]);
      setProjectsError(error instanceof Error ? error.message : "Unable to load project requests.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHomeContent() {
    const local = readLocalHomeContent();
    setFeatures(local.features);
    setExamples(local.examples);
    setClientWork(local.clientWork);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.from("home_content").select("*").order("created_at", { ascending: true });
      if (!error && data) {
        const next = {
          features: (data as HomeCardItem[]).filter((item) => item.section === "features"),
          examples: (data as HomeCardItem[]).filter((item) => item.section === "examples"),
          clientWork: (data as HomeCardItem[]).filter((item) => item.section === "client_work"),
        };
        setFeatures(next.features);
        setExamples(next.examples);
        setClientWork(next.clientWork);
        saveLocalHomeContent(next);
      }
    } catch {
      setFeatures(local.features);
      setExamples(local.examples);
      setClientWork(local.clientWork);
    }
  }

  async function persistHomeContent(section: HomeContentSection, item: HomeCardItem) {
    setContentFeedback(null);
    setContentSaving(true);
    try {
      const response = await fetch("/api/admin/home-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, id: item.id, section }),
      });
      const result = await response.json() as { error?: string; item?: HomeCardItem };
      if (!response.ok || !result.item) throw new Error(result.error ?? "Unable to save site content.");

      const saved = { features: [...features], examples: [...examples], clientWork: [...clientWork] };
      const target = section === "features" ? saved.features : section === "examples" ? saved.examples : saved.clientWork;
      target.push(result.item);
      setFeatures(saved.features);
      setExamples(saved.examples);
      setClientWork(saved.clientWork);
      saveLocalHomeContent(saved);
      setContentFeedback({ message: "Content saved.", error: false });
      return true;
    } catch (error) {
      setContentFeedback({ message: error instanceof Error ? error.message : "Unable to save site content.", error: true });
      return false;
    } finally {
      setContentSaving(false);
    }
  }

  async function loadTemplates() {
    const local = readLocalTemplates();
    setTemplates(local);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        const merged = [...data, ...local].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id));
        setTemplates(merged as TemplateItem[]);
        saveLocalTemplates(merged as TemplateItem[]);
      }
    } catch {
      setTemplates(local);
    }
  }

  async function persistTemplateItem(item: TemplateItem) {
    const next = [...templates, item];
    setTemplates(next);
    saveLocalTemplates(next);

    const supabase = createClient();
    try {
      await supabase.from("templates").upsert({
        id: item.id,
        title: item.title,
        category: item.category,
        duration: item.duration,
        ratio: item.ratio,
        tint: item.tint,
        source: item.source ?? "admin",
        created_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch {
      // keep local storage as the source of truth if the table is unavailable
    }
  }

  function handleTemplateSubmit() {
    const trimmedTitle = templateDraft.title.trim();
    if (!trimmedTitle) return;

    const item: TemplateItem = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      category: templateDraft.category,
      duration: templateDraft.duration,
      ratio: templateDraft.ratio,
      tint: templateDraft.tint,
      source: "admin",
      created_at: new Date().toISOString(),
    };

    void persistTemplateItem(item);
    setTemplateDraft({ title: "", category: "Product", duration: "0:15", ratio: "9:16", tint: "peach" });
  }

  async function removeHomeContent(section: HomeContentSection, id: string) {
    setContentFeedback(null);
    try {
      const response = await fetch("/api/admin/home-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, section }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to remove site content.");

      const next = {
        features: section === "features" ? features.filter((item) => item.id !== id) : features,
        examples: section === "examples" ? examples.filter((item) => item.id !== id) : examples,
        clientWork: section === "client_work" ? clientWork.filter((item) => item.id !== id) : clientWork,
      };
      setFeatures(next.features);
      setExamples(next.examples);
      setClientWork(next.clientWork);
      saveLocalHomeContent(next);
      setContentFeedback({ message: "Content removed.", error: false });
    } catch (error) {
      setContentFeedback({ message: error instanceof Error ? error.message : "Unable to remove site content.", error: true });
    }
  }

  async function updateHomeAnimation(section: HomeContentSection, id: string, hover_animation: HomeCardHoverAnimation) {
    if (contentSaving) return;
    setContentSaving(true);
    setContentFeedback(null);
    try {
      const response = await fetch("/api/admin/home-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, section, hover_animation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update the hover animation.");

      const next = {
        features: section === "features" ? features.map((item) => item.id === id ? { ...item, hover_animation } : item) : features,
        examples: section === "examples" ? examples.map((item) => item.id === id ? { ...item, hover_animation } : item) : examples,
        clientWork: section === "client_work" ? clientWork.map((item) => item.id === id ? { ...item, hover_animation } : item) : clientWork,
      };
      setFeatures(next.features);
      setExamples(next.examples);
      setClientWork(next.clientWork);
      saveLocalHomeContent(next);
      setContentFeedback({ message: "Hover animation saved.", error: false });
    } catch (error) {
      setContentFeedback({ message: error instanceof Error ? error.message : "Unable to update the hover animation.", error: true });
    } finally {
      setContentSaving(false);
    }
  }

  async function handleVideoUpload(projectId: string, file: File) {
    const supabase = createClient();
    setBusyId(projectId);
    setUploadError(null);

    try {
      const uploadUrlResponse = await fetch(`/api/admin/projects/${projectId}/video/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      const uploadUrlResult = await uploadUrlResponse.json() as { error?: string; path?: string; token?: string };
      if (!uploadUrlResponse.ok || !uploadUrlResult.path || !uploadUrlResult.token) {
        throw new Error(uploadUrlResult.error ?? "Unable to prepare video upload.");
      }

      const { error: uploadError } = await supabase.storage.from("videos").uploadToSignedUrl(
        uploadUrlResult.path,
        uploadUrlResult.token,
        file,
        { contentType: file.type },
      );
      if (uploadError) throw new Error(uploadError.message);

      const completeResponse = await fetch(`/api/admin/projects/${projectId}/video/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: uploadUrlResult.path, title: file.name }),
      });
      const completeResult = await completeResponse.json() as { error?: string };
      if (!completeResponse.ok) throw new Error(completeResult.error ?? "Unable to attach uploaded video.");

      const publicUrl = supabase.storage.from("videos").getPublicUrl(uploadUrlResult.path).data.publicUrl;

      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? { ...project, video_url: publicUrl, status: "completed" }
            : project
        )
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload video");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFeatureSubmit() {
    const trimmedTitle = featureDraft.title.trim();
    if (!trimmedTitle) {
      setContentFeedback({ message: "Add a title before saving this feature.", error: true });
      return;
    }
    const item: HomeCardItem = {
      id: crypto.randomUUID(),
      section: "features",
      title: trimmedTitle,
      body: featureDraft.body.trim() || "",
      media_type: featureDraft.media_type,
      media_url: featureDraft.media_url.trim(),
      text_content: featureDraft.text_content.trim(),
      tint: featureDraft.tint,
      kind: featureDraft.kind,
      hover_animation: featureDraft.hover_animation,
      created_at: new Date().toISOString(),
    };
    const saved = await persistHomeContent("features", item);
    if (!saved) return;
    setFeatureDraft({ title: "", body: "", media_type: "text", media_url: "", text_content: "", tint: "bg-tint-rose", kind: "play", hover_animation: "none" });
  }

  async function handleExampleSubmit(section: "examples" | "client_work" = "examples") {
    const trimmedTitle = exampleDraft.title.trim();
    if (!trimmedTitle) {
      setContentFeedback({ message: section === "client_work" ? "Add a title before saving this client-work card." : "Add a title before saving this example.", error: true });
      return;
    }
    const item: HomeCardItem = {
      id: crypto.randomUUID(),
      section,
      title: trimmedTitle,
      body: exampleDraft.body.trim() || "",
      meta: exampleDraft.meta.trim() || (section === "client_work" ? undefined : "Example · 0:15"),
      media_type: exampleDraft.media_type,
      media_url: exampleDraft.media_url.trim(),
      text_content: exampleDraft.text_content.trim(),
      tint: exampleDraft.tint,
      kind: exampleDraft.kind,
      hover_animation: exampleDraft.hover_animation,
      created_at: new Date().toISOString(),
    };
    const saved = await persistHomeContent(section, item);
    if (!saved) return;
    setExampleDraft({ title: "", body: "", meta: section === "client_work" ? "" : "Example · 0:15", media_type: "text", media_url: "", text_content: "", tint: "bg-night", kind: "play", hover_animation: "none" });
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <LogoMark />
            <h1 className="text-[26px] font-serif text-ink-2">Admin</h1>
          </div>

          <p className="text-[13px] text-muted">Operations workspace</p>
        </header>

        <nav aria-label="Admin sections" className="mt-5 flex gap-6 border-b border-line">
          {(["overview", "requests", "content", "models", "users"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={activeView === view}
              onClick={() => setActiveView(view)}
              className={`border-b-2 px-1 pb-3 text-[14px] font-medium capitalize ${activeView === view ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {view === "overview" ? "Overview" : view === "requests" ? `Requests (${projects.filter((project) => !["delivered", "completed"].includes(project.workflow_status ?? "")).length})` : view === "content" ? "Site content" : view === "models" ? "Free models" : "AI users"}
            </button>
          ))}
        </nav>

        {activeView === "overview" ? (
          <AdminRequestWorkspace view="overview" />
        ) : activeView === "requests" ? (
          <AdminRequestWorkspace view="requests" />
        ) : activeView === "content" ? (
          <section className="mt-5 space-y-5">
            <nav aria-label="Site content types" className="flex flex-wrap gap-2">
              {([
                ["features", "Featured cards"],
                ["templates", "Templates"],
                ["examples", "Example ads"],
                ["client_work", "Client work"],
              ] as const).map(([content, label]) => (
                <button
                  key={content}
                  type="button"
                  aria-pressed={activeContent === content}
                  onClick={() => setActiveContent(content)}
                  className={`rounded-lg border px-3 py-2 text-[13px] font-medium ${activeContent === content ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {contentFeedback ? (
              <p role={contentFeedback.error ? "alert" : "status"} className={`max-w-3xl text-[13px] ${contentFeedback.error ? "text-red-700" : "text-olive"}`}>
                {contentFeedback.message}
              </p>
            ) : null}

          <aside className="max-w-3xl space-y-4">
            {activeContent === "features" ? <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[15px] font-medium text-ink-2">Featured cards</h3>
              <div className="mt-4 space-y-3">
                <input value={featureDraft.title} onChange={(event) => setFeatureDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" />
                <textarea value={featureDraft.body} onChange={(event) => setFeatureDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Body" className="h-24 w-full resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={featureDraft.media_type} onChange={(event) => {
                    const value = event.target.value as HomeCardMediaType;
                    setFeatureDraft((current) => ({ ...current, media_type: value }));
                  }} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="audio">Audio</option>
                    <option value="video">Video</option>
                  </select>
                  <select value={featureDraft.tint} onChange={(event) => setFeatureDraft((current) => ({ ...current, tint: event.target.value }))} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    <option value="bg-tint-rose">Rose</option>
                    <option value="bg-tint-sage">Sage</option>
                    <option value="bg-tint-peach">Peach</option>
                    <option value="bg-tint-sky">Sky</option>
                    <option value="bg-night">Dark</option>
                    <option value="bg-olive">Olive</option>
                  </select>
                </div>
                <label className="block text-[13px] font-medium text-ink-2">Hover animation
                  <select value={featureDraft.hover_animation} onChange={(event) => setFeatureDraft((current) => ({ ...current, hover_animation: event.target.value as HomeCardHoverAnimation }))} className="mt-1.5 h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px]">
                    {HOME_CARD_HOVER_ANIMATIONS.map((animation) => <option key={animation.value} value={animation.value}>{animation.label}</option>)}
                  </select>
                </label>
                <MediaUploadField mediaType={featureDraft.media_type} value={featureDraft.media_url} onChange={(media_url) => setFeatureDraft((current) => ({ ...current, media_url }))} />
                <textarea value={featureDraft.text_content} onChange={(event) => setFeatureDraft((current) => ({ ...current, text_content: event.target.value }))} placeholder="Custom text content (optional)" className="h-20 w-full resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none" />
                <button type="button" disabled={contentSaving} onClick={() => void handleFeatureSubmit()} className="inline-flex h-11 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface disabled:opacity-50">{contentSaving ? "Saving…" : "Add feature"}</button>
              </div>
              <div className="mt-4 space-y-2">
                {features.length === 0 ? <p className="text-[12px] text-muted">No feature cards yet.</p> : null}
                {features.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface px-3 py-2">
                    <div className="min-w-[130px] flex-1">
                      <p className="text-[13px] font-medium text-ink-2">{item.title}</p>
                      <p className="text-[11px] text-muted">{item.media_type || "text"}</p>
                    </div>
                    <select aria-label={`Hover animation for ${item.title}`} disabled={contentSaving} value={item.hover_animation ?? "none"} onChange={(event) => void updateHomeAnimation("features", item.id, event.target.value as HomeCardHoverAnimation)} className="h-9 max-w-[190px] rounded-[7px] border border-line bg-surface px-2 text-[12px]">
                      {HOME_CARD_HOVER_ANIMATIONS.map((animation) => <option key={animation.value} value={animation.value}>{animation.label}</option>)}
                    </select>
                    <button type="button" onClick={() => void removeHomeContent("features", item.id)} className="text-[12px] text-muted">Remove</button>
                  </div>
                ))}
              </div>
            </div> : null}

            {activeContent === "templates" ? <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[15px] font-medium text-ink-2">Template library</h3>
              <div className="mt-4 space-y-3 rounded-xl border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(229,239,235,0.42)_55%,rgba(255,235,222,0.52))] p-4 shadow-[0_12px_32px_rgba(24,32,28,0.09),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
                <input value={templateDraft.title} onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Template title" className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={templateDraft.category} onChange={(event) => setTemplateDraft((current) => ({ ...current, category: event.target.value }))} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    {templateCategories.filter((item) => item !== "All").map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <select value={templateDraft.tint} onChange={(event) => setTemplateDraft((current) => ({ ...current, tint: event.target.value as TemplateItem["tint"] }))} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    <option value="rose">Rose</option>
                    <option value="sage">Sage</option>
                    <option value="peach">Peach</option>
                    <option value="sky">Sky</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={templateDraft.duration} onChange={(event) => setTemplateDraft((current) => ({ ...current, duration: event.target.value }))} placeholder="0:15" className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" />
                  <input value={templateDraft.ratio} onChange={(event) => setTemplateDraft((current) => ({ ...current, ratio: event.target.value }))} placeholder="9:16" className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" />
                </div>
                <button type="button" onClick={handleTemplateSubmit} className="inline-flex h-11 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface">Add template</button>
              </div>
              <div className="mt-4 space-y-2">
                {templates.length === 0 ? <p className="text-[12px] text-muted">No templates yet.</p> : null}
                {templates.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[10px] border border-line bg-surface px-3 py-2">
                    <div>
                      <p className="text-[13px] font-medium text-ink-2">{item.title}</p>
                      <p className="text-[11px] text-muted">{item.category} · {item.ratio}</p>
                    </div>
                    <button type="button" onClick={() => setTemplates((current) => { const next = current.filter((template) => template.id !== item.id); saveLocalTemplates(next); return next; })} className="text-[12px] text-muted">Remove</button>
                  </div>
                ))}
              </div>
            </div> : null}

            {activeContent === "examples" || activeContent === "client_work" ? <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[15px] font-medium text-ink-2">{activeContent === "client_work" ? "Client work" : "Example ads"}</h3>
              <div className="mt-4 space-y-3">
                <input value={exampleDraft.title} onChange={(event) => setExampleDraft((current) => ({ ...current, title: event.target.value }))} placeholder={activeContent === "client_work" ? "Client or project title" : "Ad title"} className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" />
                <textarea value={exampleDraft.body} onChange={(event) => setExampleDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Description" className="h-20 w-full resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none" />
                {activeContent === "examples" ? <input value={exampleDraft.meta} onChange={(event) => setExampleDraft((current) => ({ ...current, meta: event.target.value }))} placeholder="Example · 0:18" className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none" /> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={exampleDraft.media_type} onChange={(event) => {
                    const value = event.target.value as HomeCardMediaType;
                    setExampleDraft((current) => ({ ...current, media_type: value }));
                  }} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    {activeContent === "client_work" ? <option value="text">No media</option> : null}
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    {activeContent === "examples" ? <><option value="text">Text</option><option value="audio">Audio</option></> : null}
                  </select>
                  <select value={exampleDraft.tint} onChange={(event) => setExampleDraft((current) => ({ ...current, tint: event.target.value }))} className="h-11 rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink outline-none">
                    <option value="bg-night">Dark</option>
                    <option value="bg-olive">Olive</option>
                    <option value="bg-night-2">Night 2</option>
                    <option value="bg-[#3d4a38]">Green</option>
                  </select>
                </div>
                <label className="block text-[13px] font-medium text-ink-2">Hover animation
                  <select value={exampleDraft.hover_animation} onChange={(event) => setExampleDraft((current) => ({ ...current, hover_animation: event.target.value as HomeCardHoverAnimation }))} className="mt-1.5 h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px]">
                    {HOME_CARD_HOVER_ANIMATIONS.map((animation) => <option key={animation.value} value={animation.value}>{animation.label}</option>)}
                  </select>
                </label>
                <MediaUploadField mediaType={exampleDraft.media_type} value={exampleDraft.media_url} onChange={(media_url) => setExampleDraft((current) => ({ ...current, media_url }))} />
                <textarea value={exampleDraft.text_content} onChange={(event) => setExampleDraft((current) => ({ ...current, text_content: event.target.value }))} placeholder="Custom text content (optional)" className="h-20 w-full resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none" />
                <button type="button" disabled={contentSaving} onClick={() => void handleExampleSubmit(activeContent === "client_work" ? "client_work" : "examples")} className="inline-flex h-11 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface disabled:opacity-50">{contentSaving ? "Saving…" : activeContent === "client_work" ? "Add client work" : "Add example"}</button>
              </div>
              <div className="mt-4 space-y-2">
                {(activeContent === "client_work" ? clientWork : examples).length === 0 ? <p className="text-[12px] text-muted">{activeContent === "client_work" ? "No client work added yet." : "No example ads yet."}</p> : null}
                {(activeContent === "client_work" ? clientWork : examples).map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface px-3 py-2">
                    <div className="min-w-[130px] flex-1">
                      <p className="text-[13px] font-medium text-ink-2">{item.title}</p>
                      <p className="text-[11px] text-muted">{item.media_type || "text"}</p>
                    </div>
                    <select aria-label={`Hover animation for ${item.title}`} disabled={contentSaving} value={item.hover_animation ?? "none"} onChange={(event) => void updateHomeAnimation(activeContent === "client_work" ? "client_work" : "examples", item.id, event.target.value as HomeCardHoverAnimation)} className="h-9 max-w-[190px] rounded-[7px] border border-line bg-surface px-2 text-[12px]">
                      {HOME_CARD_HOVER_ANIMATIONS.map((animation) => <option key={animation.value} value={animation.value}>{animation.label}</option>)}
                    </select>
                    <button type="button" onClick={() => void removeHomeContent(activeContent === "client_work" ? "client_work" : "examples", item.id)} className="text-[12px] text-muted">Remove</button>
                  </div>
                ))}
              </div>
            </div> : null}
          </aside>
          </section>
        ) : activeView === "models" ? <FreeModelCatalog /> : <FreeModelUserControls />}
      </div>
    </div>
  );
}

function MediaUploadField({ mediaType, value, onChange }: { mediaType: HomeCardMediaType; value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || mediaType === "text") return;

    if (!file.type.startsWith(`${mediaType}/`)) {
      setError(`Choose a valid ${mediaType} file.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sign in again before uploading media.");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || `media.${mediaType}`;
      const path = `${user.id}/site-content/${crypto.randomUUID()}-${safeName}`;
      const { data, error: uploadError } = await supabase.storage.from("assets").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError || !data) throw new Error(uploadError?.message ?? "Unable to upload this file.");

      const publicUrl = supabase.storage.from("assets").getPublicUrl(data.path).data.publicUrl;
      onChange(publicUrl);
    } catch (uploadFailure) {
      setError(uploadFailure instanceof Error ? uploadFailure.message : "Unable to upload this file.");
    } finally {
      setUploading(false);
    }
  }

  if (mediaType === "text") return null;

  return (
    <div className="space-y-2">
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-line bg-paper px-3 text-[13px] font-medium text-ink hover:bg-sidebar">
        <input type="file" accept={`${mediaType}/*`} disabled={uploading} onChange={(event) => void uploadMedia(event)} className="sr-only" />
        {uploading ? "Uploading…" : `Upload ${mediaType}`}
      </label>
      <input value={value} onChange={(event) => { setError(null); onChange(event.target.value); }} placeholder="Or paste a media URL" className="h-10 w-full rounded-[8px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
      {error ? <p role="alert" className="text-[12px] text-red-700">{error}</p> : null}
      {value ? (
        <div className="overflow-hidden rounded-[8px] border border-line bg-paper p-2">
          {mediaType === "image" ? <img src={value} alt="Media preview" className="max-h-44 w-full rounded-[5px] object-contain" /> : null}
          {mediaType === "video" ? <video controls src={value} className="max-h-48 w-full rounded-[5px]" /> : null}
          {mediaType === "audio" ? <audio controls src={value} className="w-full" /> : null}
          <button type="button" onClick={() => { onChange(""); setError(null); }} className="mt-2 text-[12px] text-muted underline">Remove media</button>
        </div>
      ) : null}
    </div>
  );
}
