"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { languageOptions, LOCAL_LANGUAGE_KEY, setAppLanguage } from "@/lib/app-i18n";

const sections = [
  { id: "general", label: "General", detail: "Profile, workspace, and appearance" },
  { id: "brand", label: "Brand", detail: "Brand kits and voice" },
  { id: "generation", label: "Generation", detail: "Video defaults and presets" },
  { id: "team", label: "Team", detail: "Members and approvals" },
  { id: "integrations", label: "Integrations", detail: "Connected products" },
  { id: "billing", label: "Billing & usage", detail: "Plan, credits, and invoices" },
  { id: "notifications", label: "Notifications", detail: "Email, in-app, and Slack" },
  { id: "security", label: "Security", detail: "Sessions and privacy" },
  { id: "developers", label: "Developers", detail: "API keys and webhooks" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type Theme = "light" | "dark";
type ProfileSettings = { name: string; email: string; phone: string; avatarUrl: string | null };
type UserSettings = { timezone: string; language: string; theme: Theme; defaultLandingPage: "home" | "compose" };
type WorkspaceSettings = { name: string; slug: string; logoUrl: string | null };
type SettingsSnapshot = { profile: ProfileSettings; userSettings: UserSettings; workspace: WorkspaceSettings };

const defaults: SettingsSnapshot = {
  profile: { name: "", email: "", phone: "", avatarUrl: null },
  userSettings: { timezone: "UTC", language: "en", theme: "light", defaultLandingPage: "home" },
  workspace: { name: "Cueable studio", slug: "", logoUrl: null },
};

const searchableSettings: { label: string; section: SectionId; target?: string }[] = [
  { label: "Full name", section: "general", target: "profile-name" },
  { label: "Phone number", section: "general", target: "profile-phone" },
  { label: "Timezone", section: "general", target: "profile-timezone" },
  { label: "Interface language", section: "general", target: "profile-language" },
  { label: "Theme", section: "general", target: "profile-theme" },
  { label: "Default landing page", section: "general", target: "profile-landing" },
  { label: "Workspace name", section: "general", target: "workspace-name" },
  { label: "Workspace URL slug", section: "general", target: "workspace-slug" },
  { label: "Brand kit and logo placement", section: "brand" },
  { label: "Aspect ratio and duration", section: "generation" },
  { label: "AI model and creativity", section: "generation" },
  { label: "Invite team members", section: "team" },
  { label: "Connected integrations", section: "integrations" },
  { label: "Plan and credits", section: "billing" },
  { label: "Notification preferences", section: "notifications" },
  { label: "Sessions and privacy", section: "security" },
  { label: "API keys and webhooks", section: "developers" },
];

function cloneSettings(settings: SettingsSnapshot): SettingsSnapshot {
  return structuredClone(settings);
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div>
        <h2 className="text-[20px] font-medium text-ink-2">{title}</h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SettingField({ id, label, description, children }: { id: string; label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-2">{label}</label>
      {children}
      <p className="mt-1.5 text-[12px] leading-[1.45] text-muted">{description}</p>
    </div>
  );
}

export function SettingsWorkspace() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<SettingsSnapshot>(defaults);
  const [draft, setDraft] = useState<SettingsSnapshot>(defaults);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "logo" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isDirty = JSON.stringify(saved) !== JSON.stringify(draft);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/app/settings", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as Partial<SettingsSnapshot> & { error?: string; hasUserSettings?: boolean };
        if (!response.ok) throw new Error(result.error ?? "Unable to load settings.");
        if (cancelled) return;
        const next: SettingsSnapshot = {
          profile: { ...defaults.profile, ...result.profile },
          userSettings: { ...defaults.userSettings, ...result.userSettings },
          workspace: { ...defaults.workspace, ...result.workspace },
        };
        if (!result.hasUserSettings) {
          next.userSettings.language = languageOptions.find((language) => language.value === window.localStorage.getItem(LOCAL_LANGUAGE_KEY))?.value ?? "en";
        } else if (!languageOptions.some((language) => language.value === next.userSettings.language)) {
          next.userSettings.language = "en";
        }
        if (next.userSettings.theme !== "dark") next.userSettings.theme = "light";
        setAppLanguage(next.userSettings.language);
        setSaved(next);
        setDraft(cloneSettings(next));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const localLanguage = languageOptions.find((language) => language.value === window.localStorage.getItem(LOCAL_LANGUAGE_KEY))?.value ?? "en";
          const localSettings = cloneSettings(defaults);
          localSettings.userSettings.language = localLanguage;
          setSaved(localSettings);
          setDraft(localSettings);
          setAppLanguage(localLanguage);
          setLoadError(error instanceof Error ? error.message : "Unable to load settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = draft.userSettings.theme;
  }, [draft.userSettings.theme]);

  function updateProfile(patch: Partial<ProfileSettings>) {
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
    setSaveError(null);
    setSavedMessage(null);
  }

  function updateUserSettings(patch: Partial<UserSettings>) {
    setDraft((current) => ({ ...current, userSettings: { ...current.userSettings, ...patch } }));
    if (patch.language) {
      setAppLanguage(patch.language);
      if (loadError) {
        setSaved((current) => ({ ...current, userSettings: { ...current.userSettings, language: patch.language! } }));
      }
    }
    setSaveError(null);
    setSavedMessage(null);
  }

  function updateWorkspace(patch: Partial<WorkspaceSettings>) {
    setDraft((current) => ({ ...current, workspace: { ...current.workspace, ...patch } }));
    setSaveError(null);
    setSavedMessage(null);
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, target: "avatar" | "logo") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setSaveError("Choose a JPG, PNG, or WebP image up to 5 MB.");
      return;
    }

    setUploading(target);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again before uploading an image.");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${user.id}/settings/${target}-${crypto.randomUUID()}.${extension}`;
      const { data, error } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(t("Image upload failed: {{error}}", { error: error.message }));
      const url = supabase.storage.from("assets").getPublicUrl(data.path).data.publicUrl;
      if (target === "avatar") {
        const response = await fetch("/api/app/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarUrl: url }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to save your avatar.");
        setDraft((current) => ({ ...current, profile: { ...current.profile, avatarUrl: url } }));
        setSaved((current) => ({ ...current, profile: { ...current.profile, avatarUrl: url } }));
        setSavedMessage(t("Avatar saved."));
      } else {
        updateWorkspace({ logoUrl: url });
        setSavedMessage(t("Workspace logo uploaded. Save changes to apply it."));
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to upload image.");
    } finally {
      setUploading(null);
    }
  }

  async function changeLanguage(language: string) {
    const previousLanguage = saved.userSettings.language;
    updateUserSettings({ language });
    setSavingLanguage(true);
    try {
      const response = await fetch("/api/app/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save your interface language.");
      setSaved((current) => ({ ...current, userSettings: { ...current.userSettings, language } }));
      setSavedMessage(t("Language preference saved."));
    } catch (error) {
      setAppLanguage(previousLanguage);
      setDraft((current) => ({ ...current, userSettings: { ...current.userSettings, language: previousLanguage } }));
      setSaveError(error instanceof Error ? error.message : "Unable to save your interface language.");
    } finally {
      setSavingLanguage(false);
    }
  }

  async function saveSettings() {
    if (!isDirty || saving || loading || loadError) return;
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const response = await fetch("/api/app/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save settings.");
      const next = cloneSettings(draft);
      setSaved(next);
      setDraft(next);
      setSavedMessage("General settings saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function resetGeneral() {
    setDraft((current) => ({
      ...current,
      userSettings: cloneSettings(defaults).userSettings,
      workspace: cloneSettings(defaults).workspace,
    }));
    setSaveError(null);
    setSavedMessage(null);
  }

  function discardChanges() {
    setDraft(cloneSettings(saved));
    setAppLanguage(saved.userSettings.language);
    setSaveError(null);
    setSavedMessage(null);
  }

  function jumpToSetting(item: (typeof searchableSettings)[number]) {
    setActiveSection(item.section);
    setSearchOpen(false);
    setSearch("");
    if (item.target) window.setTimeout(() => document.getElementById(item.target!)?.focus(), 0);
  }

  const filteredSearchItems = searchableSettings.filter((item) => t(item.label).toLowerCase().includes(search.trim().toLowerCase()));
  const activeLabel = t(sections.find((section) => section.id === activeSection)?.label ?? "General");

  return (
    <div className="mx-auto max-w-[1160px] pb-2">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("Workspace")}</p>
          <h1 className="mt-2 font-serif text-[34px] leading-[1.1] text-ink-2">{t("Settings")}</h1>
          <p className="mt-2 max-w-[520px] text-[14px] leading-[1.5] text-muted">{t("Set up Cueable around your account and the way your team makes video ads.")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isDirty ? (
            <button type="button" disabled className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface opacity-55" title={loadError ?? t("No unsaved changes")}>
              {t("Save changes")}
            </button>
          ) : null}
          <button type="button" onClick={() => setSearchOpen(true)} className="inline-flex h-10 items-center gap-3 rounded-full border border-line bg-paper px-3.5 text-[13px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            {t("Search settings")} <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-muted">⌘ K</kbd>
          </button>
        </div>
      </header>

      <section aria-label="Plan and usage" className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-paper/70 px-4 py-4 sm:px-5">
        <div className="min-w-[180px]">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{t("Plan & usage")}</p>
          <p className="mt-1 text-[14px] font-medium text-ink-2">{t("Credit tracking not connected")}</p>
          <p className="mt-1 text-[12px] text-muted">{t("Plan and usage data will appear here when billing is configured.")}</p>
        </div>
        <Link href="/pricing" className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{t("View plans")}</Link>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:h-fit lg:flex-col lg:overflow-visible lg:pb-0">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setActiveSection(section.id)}
              className={`shrink-0 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:w-full ${activeSection === section.id ? "bg-sidebar-active font-medium text-ink-2" : "text-muted hover:bg-sidebar-hover hover:text-ink"}`}
            >
              <span className="block whitespace-nowrap">{t(section.label)}</span>
              <span className={`mt-0.5 hidden text-[11px] lg:block ${activeSection === section.id ? "text-muted" : "text-muted-2"}`}>{t(section.detail)}</span>
            </button>
          ))}
        </nav>

        <main className="min-w-0">
          {activeSection === "general" ? (
            <section className="rounded-[14px] border border-line bg-surface p-4 sm:p-6">
              <SectionHeading
                title={t("General")}
                description={t("Your personal details, workspace identity, and everyday preferences.")}
                action={<button type="button" onClick={resetGeneral} className="text-[12px] font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink">{t("Reset to defaults")}</button>}
              />

              {loadError ? <p role="alert" className="mt-5 rounded-[10px] bg-red-50 px-3 py-2 text-[13px] text-red-700">{loadError}</p> : null}
              {saveError ? <p role="alert" className="mt-5 rounded-[10px] bg-red-50 px-3 py-2 text-[13px] text-red-700">{saveError}</p> : null}
              {savedMessage ? <p role="status" className="mt-5 rounded-[10px] bg-[#edf4e8] px-3 py-2 text-[13px] text-olive">{savedMessage}</p> : null}

              <div className="divide-y divide-line">
                <section className="grid gap-5 py-6 sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,1.35fr)]">
                  <div>
                    <h3 className="text-[14px] font-medium text-ink-2">{t("Your profile")}</h3>
                    <p className="mt-1 text-[12px] leading-[1.45] text-muted">{t("Personal details shown in your workspace.")}</p>
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sidebar text-[18px] font-medium text-ink-2">
                        {draft.profile.avatarUrl ? <img src={draft.profile.avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" /> : (draft.profile.name || draft.profile.email || "?").trim().charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void uploadImage(event, "avatar")} />
                        <button type="button" disabled={Boolean(uploading) || loading} onClick={() => avatarInputRef.current?.click()} className="rounded-full border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-paper disabled:opacity-50">{uploading === "avatar" ? t("Uploading…") : t("Upload avatar")}</button>
                        <p className="mt-1.5 text-[11px] text-muted">JPG, PNG, or WebP; up to 5 MB.</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SettingField id="profile-name" label={t("Full name")} description={t("Used in reviews and team activity.")}>
                        <input id="profile-name" value={draft.profile.name} onChange={(event) => updateProfile({ name: event.target.value })} placeholder="Your name" disabled={loading} className={inputClass} />
                      </SettingField>
                      <SettingField id="profile-phone" label={t("Phone number (optional)")} description={t("Only used for account and security notices.")}>
                        <input id="profile-phone" type="tel" value={draft.profile.phone} onChange={(event) => updateProfile({ phone: event.target.value })} placeholder="Add a phone number" disabled={loading} className={inputClass} />
                      </SettingField>
                      <SettingField id="profile-email" label={t("Email address")} description={t("Managed by your sign-in provider.")}>
                        <input id="profile-email" type="email" value={draft.profile.email} readOnly className={`${inputClass} bg-paper text-muted`} />
                      </SettingField>
                      <SettingField id="profile-timezone" label={t("Timezone")} description={t("Used for activity times and scheduled notifications.")}>
                        <input id="profile-timezone" value={draft.userSettings.timezone} onChange={(event) => updateUserSettings({ timezone: event.target.value })} placeholder="America/Los_Angeles" disabled={loading} className={inputClass} />
                      </SettingField>
                      <SettingField id="profile-language" label={t("Interface language")} description={t("Language preference for workspace controls.")}>
                        <select id="profile-language" value={draft.userSettings.language} onChange={(event) => void changeLanguage(event.target.value)} disabled={loading || savingLanguage} className={inputClass}>
                          {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                        </select>
                      </SettingField>
                    </div>
                  </div>
                </section>

                <section className="grid gap-5 py-6 sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,1.35fr)]">
                  <div>
                    <h3 className="text-[14px] font-medium text-ink-2">{t("Workspace")}</h3>
                    <p className="mt-1 text-[12px] leading-[1.45] text-muted">{t("Name and identity for your shared Cueable space.")}</p>
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-paper text-[13px] font-medium text-muted">
                        {draft.workspace.logoUrl ? <img src={draft.workspace.logoUrl} alt={t("Workspace logo")} className="h-full w-full object-contain" /> : t("Logo")}
                      </div>
                      <div>
                        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void uploadImage(event, "logo")} />
                        <button type="button" disabled={Boolean(uploading) || loading} onClick={() => logoInputRef.current?.click()} className="rounded-full border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-paper disabled:opacity-50">{uploading === "logo" ? t("Uploading…") : t("Upload workspace logo")}</button>
                        <p className="mt-1.5 text-[11px] text-muted">JPG, PNG, or WebP; up to 5 MB.</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SettingField id="workspace-name" label={t("Workspace name")} description={t("Shown to members and on shared review pages.")}>
                        <input id="workspace-name" value={draft.workspace.name} onChange={(event) => updateWorkspace({ name: event.target.value })} placeholder="Cueable studio" disabled={loading} className={inputClass} />
                      </SettingField>
                      <SettingField id="workspace-slug" label={t("Workspace URL slug")} description={t("Reserved for shareable workspace links.")}>
                        <input id="workspace-slug" value={draft.workspace.slug} onChange={(event) => updateWorkspace({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-") })} placeholder="your-studio" disabled={loading} className={inputClass} />
                      </SettingField>
                    </div>
                  </div>
                </section>

                <section className="grid gap-5 py-6 sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,1.35fr)]">
                  <div>
                    <h3 className="text-[14px] font-medium text-ink-2">{t("Preferences")}</h3>
                    <p className="mt-1 text-[12px] leading-[1.45] text-muted">{t("Choose how the workspace looks and where it opens.")}</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <p id="profile-theme-label" className="text-[13px] font-medium text-ink-2">{t("Theme")}</p>
                      <div role="group" aria-labelledby="profile-theme-label" className="mt-2 inline-flex rounded-full border border-line bg-paper p-1">
                        {(["light", "dark"] as const).map((theme) => (
                          <button key={theme} type="button" aria-pressed={draft.userSettings.theme === theme} disabled={loading} onClick={() => updateUserSettings({ theme })} className={`h-8 rounded-full px-3 text-[12px] font-medium capitalize transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${draft.userSettings.theme === theme ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}>
                            {t(theme[0].toUpperCase() + theme.slice(1))}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[12px] leading-[1.45] text-muted">{t("Choose the light or dark appearance for your workspace.")}</p>
                    </div>
                    <SettingField id="profile-landing" label={t("Default landing page")} description={t("Your preferred starting point in the workspace.")}>
                      <select id="profile-landing" value={draft.userSettings.defaultLandingPage} onChange={(event) => updateUserSettings({ defaultLandingPage: event.target.value as UserSettings["defaultLandingPage"] })} disabled={loading} className={inputClass}>
                        <option value="home">{t("Home")}</option><option value="compose">{t("Compose")}</option>
                      </select>
                    </SettingField>
                  </div>
                </section>
              </div>
            </section>
          ) : (
            <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
              <SectionHeading title={activeLabel} description={sections.find((section) => section.id === activeSection)?.detail ?? "Workspace settings"} />
              <div className="mt-6 rounded-[12px] border border-dashed border-line bg-paper/50 px-5 py-7">
                <p className="text-[14px] font-medium text-ink-2">{t("Coming soon")}</p>
                <p className="mt-1 max-w-[440px] text-[13px] leading-[1.5] text-muted">This settings area will be connected in a later phase. Nothing here is saved or active yet.</p>
              </div>
            </section>
          )}
        </main>
      </div>

      {isDirty ? (
        <div className="sticky bottom-0 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-1 py-3 backdrop-blur-md">
          <p className="text-[13px] font-medium text-ink-2">{t("Unsaved changes")}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={discardChanges} disabled={saving} className="h-10 rounded-full border border-line px-4 text-[13px] font-medium text-ink-2 hover:bg-paper disabled:opacity-50">{t("Discard")}</button>
            <button type="button" onClick={() => void saveSettings()} disabled={saving || loading || Boolean(loadError) || Boolean(uploading)} className="h-10 rounded-full bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-50">{saving ? t("Saving…") : t("Save changes")}</button>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/35 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="settings-search-title" className="w-full max-w-[520px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
            <h2 id="settings-search-title" className="sr-only">Search settings</h2>
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search settings…" className="h-14 w-full border-b border-line bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-muted-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink" />
            <div className="max-h-[55vh] overflow-y-auto p-2" role="listbox" aria-label="Settings search results">
              {filteredSearchItems.length ? filteredSearchItems.map((item) => (
                <button key={`${item.section}-${item.label}`} type="button" role="option" aria-selected="false" onClick={() => jumpToSetting(item)} className="flex w-full items-center justify-between gap-4 rounded-[9px] px-3 py-2.5 text-left text-[13px] text-ink-2 hover:bg-sidebar-active focus-visible:bg-sidebar-active focus-visible:outline-none">
                  <span>{item.label}</span><span className="text-[11px] text-muted">{sections.find((section) => section.id === item.section)?.label}</span>
                </button>
              )) : <p className="px-3 py-5 text-center text-[13px] text-muted">No settings found.</p>}
            </div>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Press Esc to close</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const inputClass = "mt-2 h-11 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition placeholder:text-muted-2 focus:border-ink focus-visible:ring-2 focus-visible:ring-ink/15 disabled:bg-paper disabled:text-muted";