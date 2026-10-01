"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Thumb } from "@/components/marketing/Thumb";
import type { Template, TemplateScene, TemplateVariable } from "@/data/templates";
import { templateCategories, templates as seededTemplates } from "@/data/templates";
import { createClient } from "@/lib/supabase/client";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const TEMPLATE_STORAGE_KEY = "primecut-custom-templates";
const DELETED_TEMPLATE_STORAGE_KEY = "primecut-deleted-templates";
const LEGACY_SEEDED_TEMPLATE_IDS = [
  "linen-pour",
  "desk-object",
  "app-open",
  "shelf-pan",
  "founder-note",
  "feature-stack",
  "night-still",
  "story-cut",
] as const;
const TEMPLATE_TINTS = ["rose", "sage", "peach", "sky"] as const;
const TEMPLATE_USE_CASES = ["product launch", "testimonial", "app install", "promo"] as const;
const TEMPLATE_SCENE_TYPES = ["hook/text overlay", "product shot", "feature callout", "testimonial", "logo/CTA end card"] as const;
const TEMPLATE_LAYOUTS = ["full-bleed", "split", "centered"] as const;
const TEMPLATE_PLATFORMS = ["9:16", "1:1", "16:9"] as const;

type TemplateTint = Template["tint"];

type TemplateDraft = {
  title: string;
  category: string;
  useCase: string;
  platforms: string[];
  duration: string;
  ratio: string;
  tint: TemplateTint;
  basePrompt: string;
  sourceMapping: string;
  brandKit: string;
  transition: string;
  musicStyle: string;
  scenes: TemplateScene[];
  variables: TemplateVariable[];
};

function buildDefaultScene(): TemplateScene {
  return {
    id: `scene-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: "hook/text overlay",
    duration: "3",
    layout: "full-bleed",
    textVars: "{{headline}}, {{cta_text}}",
    mediaVars: "{{hero_image}}",
  };
}

function buildDefaultVariable(): TemplateVariable {
  return {
    id: `var-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "{{headline}}",
    kind: "text",
    expectedType: "headline copy",
    count: "1",
    aspectRatio: "9:16",
  };
}

function readLocalTemplates() {
  if (typeof window === "undefined") return [] as Template[];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [] as Template[];
    const parsed = JSON.parse(raw) as Template[];
    const sanitized = Array.isArray(parsed)
      ? parsed.filter((item) => !LEGACY_SEEDED_TEMPLATE_IDS.includes(item.id as (typeof LEGACY_SEEDED_TEMPLATE_IDS)[number]))
      : [];

    if (sanitized.length !== parsed.length) {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return [] as Template[];
  }
}

function saveLocalTemplates(items: Template[]) {
  if (typeof window === "undefined") return;
  const sanitized = items.filter((item) => !LEGACY_SEEDED_TEMPLATE_IDS.includes(item.id as (typeof LEGACY_SEEDED_TEMPLATE_IDS)[number]));
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(sanitized));
}

function readDeletedTemplateIds() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(DELETED_TEMPLATE_STORAGE_KEY);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}

function saveDeletedTemplateIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DELETED_TEMPLATE_STORAGE_KEY, JSON.stringify(ids));
}

function isTemplateItem(value: unknown): value is Template {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Template>;
  return !!item.id && !!item.title && !!item.category && !!item.duration && !!item.ratio && !!item.tint;
}

export function TemplateBrowser() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof templateCategories)[number]>("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "duration" | "newest">("name");
  const [showCreate, setShowCreate] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [deletedTemplateIds, setDeletedTemplateIds] = useState<string[]>([]);
  const [openTemplateMenuId, setOpenTemplateMenuId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>({
    title: "",
    category: "Product",
    useCase: "product launch",
    platforms: ["9:16", "1:1"],
    duration: "0:15",
    ratio: "9:16",
    tint: "peach",
    basePrompt: "Create a {{duration}}s ad for {{brand}} highlighting {{key_benefit}}.",
    sourceMapping: "{{hero_image}} -> product image\n{{cta_text}} -> primary button label",
    brandKit: "Primary brand kit",
    transition: "cut",
    musicStyle: "uplifting product beat",
    scenes: [buildDefaultScene()],
    variables: [
      { id: `var-${Date.now()}`, name: "{{headline}}", kind: "text", expectedType: "headline copy", count: "1", aspectRatio: "9:16" },
      { id: `var-${Date.now()}-2`, name: "{{hero_image}}", kind: "media", expectedType: "product shot", count: "1", aspectRatio: "9:16" },
    ],
  });

  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const templateMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useDismissOnOutside(searchRef, showSearch, () => setShowSearch(false));
  useDismissOnOutside(filterRef, showFilterMenu, () => setShowFilterMenu(false));
  useDismissOnOutside(sortRef, showSortMenu, () => setShowSortMenu(false));
  useDismissOnOutside(createRef, showCreate, () => setShowCreate(false));

  useEffect(() => {
    if (!openTemplateMenuId) return;

    const handleWindowClick = (event: MouseEvent) => {
      const menuEl = templateMenuRefs.current[openTemplateMenuId];
      if (!menuEl) return;
      if (!menuEl.contains(event.target as Node)) {
        setOpenTemplateMenuId(null);
      }
    };

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [openTemplateMenuId]);

  useEffect(() => {
    const localTemplates = readLocalTemplates();
    const hiddenIds = readDeletedTemplateIds();
    setCustomTemplates(localTemplates);
    setDeletedTemplateIds(hiddenIds);

    void (async () => {
      const supabase = createClient();
      try {
        const { data, error } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) {
          const remote = data.filter(isTemplateItem).map((item) => ({ ...item, source: item.source ?? "admin" }));
          const merged = [...remote, ...localTemplates].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id));
          setCustomTemplates(merged);
          saveLocalTemplates(merged);
        }
      } catch {
        // Supabase templates table is optional; keep local state as the source of truth.
      }
    })();
  }, []);

  const allTemplates = useMemo(() => {
    const visible = [...seededTemplates, ...customTemplates].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id));
    return visible.filter((item) => !deletedTemplateIds.includes(item.id));
  }, [customTemplates, deletedTemplateIds]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let next = [...allTemplates];

    if (category !== "All") {
      next = next.filter((item) => item.category === category);
    }

    if (normalized) {
      next = next.filter((item) => {
        const haystack = `${item.title} ${item.category}`.toLowerCase();
        return haystack.includes(normalized);
      });
    }

    if (sortBy === "newest") {
      next.sort((a, b) => (a.id > b.id ? -1 : 1));
    } else if (sortBy === "duration") {
      next.sort((a, b) => Number.parseFloat(b.duration.replace(":", ".")) - Number.parseFloat(a.duration.replace(":", ".")));
    } else {
      next.sort((a, b) => a.title.localeCompare(b.title));
    }

    return next;
  }, [allTemplates, category, query, sortBy]);

  async function persistTemplate(item: Template) {
    const next = [...customTemplates, item];
    setCustomTemplates(next);
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
        source: item.source ?? "custom",
        created_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch {
      // ignore missing/unsupported table; local storage remains authoritative
    }
  }

  function handleCreateTemplate() {
    const title = draft.title.trim();
    if (!title) return;

    const totalDuration = draft.scenes.reduce((sum, scene) => {
      const value = Number.parseFloat(scene.duration || "0");
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    const item: Template = {
      id: crypto.randomUUID(),
      title,
      category: draft.category,
      duration: totalDuration > 0 ? `${totalDuration.toFixed(0)}s` : draft.duration,
      ratio: draft.platforms.includes("9:16") ? "9:16" : draft.platforms[0] ?? "9:16",
      tint: draft.tint,
      source: "custom",
      spec: {
        useCase: draft.useCase,
        platforms: draft.platforms,
        scenes: draft.scenes,
        variables: draft.variables,
        basePrompt: draft.basePrompt,
        sourceMapping: draft.sourceMapping,
        brandKit: draft.brandKit,
        transition: draft.transition,
        musicStyle: draft.musicStyle,
      },
    };

    void persistTemplate(item);
    setDraft({
      title: "",
      category: "Product",
      useCase: "product launch",
      platforms: ["9:16", "1:1"],
      duration: "0:15",
      ratio: "9:16",
      tint: "peach",
      basePrompt: "Create a {{duration}}s ad for {{brand}} highlighting {{key_benefit}}.",
      sourceMapping: "{{hero_image}} -> product image\n{{cta_text}} -> primary button label",
      brandKit: "Primary brand kit",
      transition: "cut",
      musicStyle: "uplifting product beat",
      scenes: [buildDefaultScene()],
      variables: [
        { id: `var-${Date.now()}-reset`, name: "{{headline}}", kind: "text", expectedType: "headline copy", count: "1", aspectRatio: "9:16" },
        { id: `var-${Date.now()}-reset-2`, name: "{{hero_image}}", kind: "media", expectedType: "product shot", count: "1", aspectRatio: "9:16" },
      ],
    });
    setShowCreate(false);
    setCategory("All");
  }

  function deleteTemplate(templateId: string) {
    const nextHiddenIds = Array.from(new Set([...deletedTemplateIds, templateId]));
    setDeletedTemplateIds(nextHiddenIds);
    saveDeletedTemplateIds(nextHiddenIds);

    setCustomTemplates((current) => {
      const next = current.filter((item) => item.id !== templateId);
      saveLocalTemplates(next);
      return next;
    });

    const localNext = readLocalTemplates().filter((item) => item.id !== templateId);
    saveLocalTemplates(localNext);
    setOpenTemplateMenuId(null);

    try {
      const supabase = createClient();
      void supabase.from("templates").delete().eq("id", templateId);
    } catch {
      // optional table / client is not available in this environment
    }
  }

  function beginEdit(template: Template) {
    setEditingTemplateId(template.id);
    setDraft({
      title: template.title,
      category: template.category,
      useCase: template.spec?.useCase ?? "product launch",
      platforms: template.spec?.platforms ?? [template.ratio],
      duration: template.duration,
      ratio: template.ratio,
      tint: template.tint,
      basePrompt: template.spec?.basePrompt ?? "Create a {{duration}}s ad for {{brand}} highlighting {{key_benefit}}.",
      sourceMapping: template.spec?.sourceMapping ?? "{{hero_image}} -> product image\n{{cta_text}} -> primary button label",
      brandKit: template.spec?.brandKit ?? "Primary brand kit",
      transition: template.spec?.transition ?? "cut",
      musicStyle: template.spec?.musicStyle ?? "uplifting product beat",
      scenes: template.spec?.scenes?.length ? template.spec.scenes : [buildDefaultScene()],
      variables: template.spec?.variables?.length ? template.spec.variables : [
        { id: `var-${Date.now()}`, name: "{{headline}}", kind: "text", expectedType: "headline copy", count: "1", aspectRatio: "9:16" },
      ],
    });
    setOpenTemplateMenuId(null);
    setShowCreate(true);
  }

  function saveEditedTemplate() {
    const title = draft.title.trim();
    if (!title || !editingTemplateId) return;

    const totalDuration = draft.scenes.reduce((sum, scene) => {
      const value = Number.parseFloat(scene.duration || "0");
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    const baseTemplate = allTemplates.find((item) => item.id === editingTemplateId) ?? customTemplates.find((item) => item.id === editingTemplateId);
    const isCustom = !!baseTemplate && baseTemplate.source === "custom";
    const nextItem: Template = {
      id: isCustom ? editingTemplateId : crypto.randomUUID(),
      title,
      category: draft.category,
      duration: totalDuration > 0 ? `${totalDuration.toFixed(0)}s` : draft.duration,
      ratio: draft.platforms.includes("9:16") ? "9:16" : draft.platforms[0] ?? draft.ratio,
      tint: draft.tint,
      source: "custom",
      spec: {
        useCase: draft.useCase,
        platforms: draft.platforms,
        scenes: draft.scenes,
        variables: draft.variables,
        basePrompt: draft.basePrompt,
        sourceMapping: draft.sourceMapping,
        brandKit: draft.brandKit,
        transition: draft.transition,
        musicStyle: draft.musicStyle,
      },
    };

    const next = isCustom
      ? customTemplates.map((item) => item.id === editingTemplateId ? nextItem : item)
      : [...customTemplates, nextItem];

    setCustomTemplates(next);
    saveLocalTemplates(next);

    const supabase = createClient();
    void supabase.from("templates").upsert({
      id: nextItem.id,
      title,
      category: draft.category,
      duration: totalDuration > 0 ? `${totalDuration.toFixed(0)}s` : draft.duration,
      ratio: draft.platforms.includes("9:16") ? "9:16" : draft.platforms[0] ?? draft.ratio,
      tint: draft.tint,
      source: "custom",
      created_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (!isCustom) {
      const nextDeleted = deletedTemplateIds.filter((id) => id !== editingTemplateId);
      setDeletedTemplateIds(nextDeleted);
      saveDeletedTemplateIds(nextDeleted);
    }

    setEditingTemplateId(null);
    setDraft({
      title: "",
      category: "Product",
      useCase: "product launch",
      platforms: ["9:16", "1:1"],
      duration: "0:15",
      ratio: "9:16",
      tint: "peach",
      basePrompt: "Create a {{duration}}s ad for {{brand}} highlighting {{key_benefit}}.",
      sourceMapping: "{{hero_image}} -> product image\n{{cta_text}} -> primary button label",
      brandKit: "Primary brand kit",
      transition: "cut",
      musicStyle: "uplifting product beat",
      scenes: [buildDefaultScene()],
      variables: [
        { id: `var-${Date.now()}-edit`, name: "{{headline}}", kind: "text", expectedType: "headline copy", count: "1", aspectRatio: "9:16" },
      ],
    });
    setShowCreate(false);
  }

  function handleSaveTemplate() {
    if (editingTemplateId) {
      saveEditedTemplate();
      return;
    }
    handleCreateTemplate();
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1 xl:max-w-[520px]">
          <div className="relative" ref={searchRef}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search templates")}
              className="h-11 w-full rounded-[var(--radius-pill)] border border-line bg-surface px-4 text-[14px] text-ink outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 text-muted">
          <div className="relative" ref={createRef}>
            <button
              type="button"
              onClick={() => setShowCreate((value) => !value)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13.5px] font-medium text-surface"
            >
              + {t("Create")}
            </button>
            {showCreate ? (
              <div className="absolute right-0 top-12 z-20 max-h-[75vh] w-[420px] overflow-hidden rounded-[18px] border border-line bg-surface p-4 shadow-[0_18px_40px_rgba(23,23,23,0.12)]">
                <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-medium text-ink-2">{editingTemplateId ? t("Edit template") : t("Create template")}</h3>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted">{t("Template spec")}</span>
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Basic info + use case")}</p>
                    <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t("Template title")} className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-[13px] text-ink outline-none">
                        {templateCategories.filter((item) => item !== "All").map((item) => (
                          <option key={item} value={item}>{t(item)}</option>
                        ))}
                      </select>
                      <select value={draft.useCase} onChange={(event) => setDraft((current) => ({ ...current, useCase: event.target.value }))} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-[13px] text-ink outline-none">
                        {TEMPLATE_USE_CASES.map((value) => (
                          <option key={value} value={value}>{t(value)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={draft.tint} onChange={(event) => setDraft((current) => ({ ...current, tint: event.target.value as TemplateTint }))} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-[13px] text-ink outline-none">
                        {TEMPLATE_TINTS.map((value) => (
                          <option key={value} value={value}>{t(value)}</option>
                        ))}
                      </select>
                      <input value={draft.duration} onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value }))} placeholder="0:15" className="h-10 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Platform export")}</p>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_PLATFORMS.map((platform) => {
                        const checked = draft.platforms.includes(platform);
                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => setDraft((current) => ({
                              ...current,
                              platforms: checked ? current.platforms.filter((value) => value !== platform) : [...current.platforms, platform],
                            }))}
                            className={`rounded-full border px-2.5 py-1.5 text-[12px] ${checked ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink"}`}
                          >
                            {platform}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Scene / shot structure")}</p>
                      <button type="button" onClick={() => setDraft((current) => ({ ...current, scenes: [...current.scenes, buildDefaultScene()] }))} className="text-[12px] text-muted">+ {t("Add scene")}</button>
                    </div>
                    <div className="space-y-3">
                      {draft.scenes.map((scene, index) => (
                        <div key={scene.id} className="rounded-[10px] border border-line bg-surface p-2">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-[0.12em] text-muted">{t("Scene {{number}}", { number: index + 1 })}</span>
                            {draft.scenes.length > 1 ? (
                              <button type="button" onClick={() => setDraft((current) => ({ ...current, scenes: current.scenes.filter((item) => item.id !== scene.id) }))} className="text-[11px] text-muted">{t("Remove")}</button>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select value={scene.type} onChange={(event) => setDraft((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === scene.id ? { ...item, type: event.target.value } : item) }))} className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none">
                              {TEMPLATE_SCENE_TYPES.map((type) => (
                                <option key={type} value={type}>{t(type)}</option>
                              ))}
                            </select>
                            <input value={scene.duration} onChange={(event) => setDraft((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === scene.id ? { ...item, duration: event.target.value } : item) }))} placeholder="3s" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <select value={scene.layout} onChange={(event) => setDraft((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === scene.id ? { ...item, layout: event.target.value } : item) }))} className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none">
                              {TEMPLATE_LAYOUTS.map((layout) => (
                                <option key={layout} value={layout}>{t(layout)}</option>
                              ))}
                            </select>
                            <input value={scene.textVars} onChange={(event) => setDraft((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === scene.id ? { ...item, textVars: event.target.value } : item) }))} placeholder="{{headline}}, {{cta_text}}" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                          </div>
                          <input value={scene.mediaVars} onChange={(event) => setDraft((current) => ({ ...current, scenes: current.scenes.map((item) => item.id === scene.id ? { ...item, mediaVars: event.target.value } : item) }))} placeholder="{{hero_image}}, {{logo}}" className="mt-2 h-9 w-full rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Content variables")}</p>
                        <button type="button" onClick={() => setDraft((current) => ({ ...current, variables: [...current.variables, buildDefaultVariable()] }))} className="text-[12px] text-muted">+ {t("Add variable")}</button>
                    </div>
                    <div className="space-y-2">
                      {draft.variables.map((variable, index) => (
                        <div key={variable.id} className="grid gap-2 rounded-[10px] border border-line bg-surface p-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={variable.name} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item) => item.id === variable.id ? { ...item, name: event.target.value } : item) }))} placeholder="{{headline}}" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                            <select value={variable.kind} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item) => item.id === variable.id ? { ...item, kind: event.target.value as TemplateVariable["kind"] } : item) }))} className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none">
                              <option value="text">{t("Text")}</option>
                              <option value="media">{t("Media")}</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input value={variable.expectedType} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item) => item.id === variable.id ? { ...item, expectedType: event.target.value } : item) }))} placeholder="headline copy" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                            <input value={variable.count} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item) => item.id === variable.id ? { ...item, count: event.target.value } : item) }))} placeholder="1" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                            <input value={variable.aspectRatio} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item) => item.id === variable.id ? { ...item, aspectRatio: event.target.value } : item) }))} placeholder="9:16" className="h-9 rounded-[8px] border border-line bg-paper px-2 text-[12px] text-ink outline-none" />
                          </div>
                          {draft.variables.length > 1 ? (
                            <button type="button" onClick={() => setDraft((current) => ({ ...current, variables: current.variables.filter((item) => item.id !== variable.id) }))} className="w-fit text-[11px] text-muted">{t("Remove")}</button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Source / generation config")}</p>
                    <textarea value={draft.basePrompt} onChange={(event) => setDraft((current) => ({ ...current, basePrompt: event.target.value }))} placeholder="Create a {{duration}}s ad for {{brand}} highlighting {{key_benefit}}" className="h-20 w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-ink outline-none" />
                    <textarea value={draft.sourceMapping} onChange={(event) => setDraft((current) => ({ ...current, sourceMapping: event.target.value }))} placeholder="{{hero_image}} -> product image\n{{cta_text}} -> button label" className="h-20 w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-ink outline-none" />
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-line bg-paper p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Style + brand binding")}</p>
                    <input value={draft.brandKit} onChange={(event) => setDraft((current) => ({ ...current, brandKit: event.target.value }))} placeholder="Brand Kit entry" className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={draft.transition} onChange={(event) => setDraft((current) => ({ ...current, transition: event.target.value }))} placeholder="cut / fade / slide" className="h-10 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
                      <input value={draft.musicStyle} onChange={(event) => setDraft((current) => ({ ...current, musicStyle: event.target.value }))} placeholder="music / voice style" className="h-10 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none" />
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-line bg-paper p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-muted">{t("Preview thumbnail")}</p>
                    <div className="mt-3 rounded-[12px] bg-sidebar p-3">
                      <div className="rounded-[10px] border border-white/60 bg-white/40 p-3">
                        <div className="flex items-center justify-between text-[11px] text-ink">
                          <span>{draft.useCase}</span>
                          <span>{draft.platforms.join(" · ") || "9:16"}</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {draft.scenes.slice(0, 3).map((scene, index) => (
                            <div key={scene.id} className="h-16 flex-1 rounded-[8px] border border-white/70 bg-white/40" style={{ opacity: 1 - index * 0.2 }} />
                          ))}
                        </div>
                        <div className="mt-3 text-[12px] font-medium text-ink">{draft.title || t("Template preview")}</div>
                      </div>
                    </div>
                  </div>

                  <button type="button" onClick={handleSaveTemplate} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-[12.5px] font-medium text-surface">{editingTemplateId ? t("Update template") : t("Save template")}</button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={filterRef}>
            <button type="button" aria-label={t("Filter templates")} onClick={() => setShowFilterMenu((value) => !value)} className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${showFilterMenu ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            {showFilterMenu ? (
              <div className="absolute right-0 top-11 z-20 w-40 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                {templateCategories.map((item) => (
                  <button key={item} type="button" onClick={() => { setCategory(item); setShowFilterMenu(false); }} className={`block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] ${category === item ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
                    {t(item)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={sortRef}>
            <button type="button" aria-label={t("Sort templates")} onClick={() => setShowSortMenu((value) => !value)} className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${showSortMenu ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M5 3.5v9M5 3.5 3.2 5.2M5 3.5 6.8 5.2M11 12.5v-9M11 12.5 9.2 10.8M11 12.5l1.8-1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showSortMenu ? (
              <div className="absolute right-0 top-11 z-20 w-40 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                {([
                  ["name", t("Name A–Z")],
                  ["duration", t("Duration")],
                  ["newest", t("Newest")],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => { setSortBy(value); setShowSortMenu(false); }} className={`block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] ${sortBy === value ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ml-1 flex overflow-hidden rounded-[10px] border border-line">
            <button type="button" aria-label={t("Grid view")} aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`flex h-8 w-8 items-center justify-center ${view === "grid" ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3.2 3.2h3.6v3.6H3.2V3.2Zm6 0h3.6v3.6H9.2V3.2Zm-6 6h3.6v3.6H3.2V9.2Zm6 0h3.6v3.6H9.2V9.2Z" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button type="button" aria-label={t("List view")} aria-pressed={view === "list"} onClick={() => setView("list")} className={`flex h-8 w-8 items-center justify-center ${view === "list" ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {templateCategories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`cursor-pointer rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] font-medium ${category === item ? "bg-ink text-surface" : "border border-line bg-surface text-ink"}`}
          >
            {t(item)}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <div className="mt-8 space-y-3">
          {visible.map((item) => (
            <div key={item.id} className="relative flex items-center gap-4 rounded-[16px] border border-line bg-surface p-3 transition hover:border-[#d5cabd]">
              <Link href="/app/create" className="flex flex-1 items-center gap-4">
                <div className="h-20 w-32 shrink-0 rounded-[12px] bg-sidebar p-2">
                  <Thumb tint={item.tint} label={item.duration} ratio="16/9" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink-2">{item.title}</p>
                  <p className="mt-1 text-[12px] text-muted">{item.category} · {item.ratio}</p>
                </div>
              </Link>

              <div className="relative" ref={(node) => { templateMenuRefs.current[item.id] = node; }}>
                <button
                  type="button"
                  aria-label={t("Actions for {{name}}", { name: item.title })}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenTemplateMenuId((current) => current === item.id ? null : item.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sidebar"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <circle cx="4" cy="8" r="1.2" />
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="12" cy="8" r="1.2" />
                  </svg>
                </button>

                {openTemplateMenuId === item.id ? (
                  <div className="absolute right-0 top-10 z-20 w-32 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        beginEdit(item);
                      }}
                      className="block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] text-muted hover:bg-sidebar"
                    >
                      {t("Modify")}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteTemplate(item.id);
                      }}
                      className="block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visible.map((item) => (
            <div key={item.id} className="relative rounded-[16px] border border-line bg-surface p-2 pb-3 transition hover:border-[#d5cabd]">
              <Link href="/app/create" className="block">
                <Thumb tint={item.tint} label={item.duration} ratio="16/9" />
                <h2 className="mt-3 px-1 text-[14px] font-medium text-ink-2">{item.title}</h2>
                <p className="px-1 text-[12.5px] text-muted">{item.category} · {item.ratio}</p>
              </Link>

              <div className="absolute right-3 top-3 z-10" ref={(node) => { templateMenuRefs.current[item.id] = node; }}>
                <button
                  type="button"
                  aria-label={t("Actions for {{name}}", { name: item.title })}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenTemplateMenuId((current) => current === item.id ? null : item.id);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm hover:bg-sidebar"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <circle cx="4" cy="8" r="1.2" />
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="12" cy="8" r="1.2" />
                  </svg>
                </button>

                {openTemplateMenuId === item.id ? (
                  <div className="absolute right-0 top-9 z-20 w-32 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_14px_34px_rgba(23,23,23,0.08)]">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        beginEdit(item);
                      }}
                      className="block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] text-muted hover:bg-sidebar"
                    >
                      {t("Modify")}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteTemplate(item.id);
                      }}
                      className="block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {visible.length === 0 ? <p className="mt-8 text-[14px] text-muted">{t("Nothing matches that search.")}</p> : null}
    </div>
  );
}
