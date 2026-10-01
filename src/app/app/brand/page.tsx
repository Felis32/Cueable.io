"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";

type BrandKit = {
  id?: string;
  user_id?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  neutral_color?: string;
  tint_color?: string;
  overlay_color?: string;
  end_card?: string;
  updated_at?: string;
};

const STORAGE_KEY = "primecut-brand-kit";

const colorSections = [
  {
    key: "primary_color",
    label: "Primary Color",
    description: "Core brand anchor",
    options: ["#111111", "#1f1a17", "#2d2a28", "#3b2e2a", "#5b3f36", "#7a5348"],
  },
  {
    key: "secondary_color",
    label: "Secondary Color",
    description: "Supporting neutral or warm contrast",
    options: ["#d9c7b5", "#e9dccb", "#f1e6dc", "#c9b29d", "#b79a82", "#9c7d62"],
  },
  {
    key: "accent_color",
    label: "Accent",
    description: "Highlight / CTA color",
    options: ["#b86a4d", "#d98c5d", "#cf6f5f", "#6a8f82", "#7b9e78", "#c7a96b"],
  },
  {
    key: "neutral_color",
    label: "Neutrals / Grays",
    description: "Backgrounds and supporting surfaces",
    options: ["#f4f1ee", "#e6e1db", "#d3cfc9", "#8d8a85", "#5a5a59", "#202020"],
  },
  {
    key: "tint_color",
    label: "Tints and Shades",
    description: "Soft layers and depth",
    options: ["#f1e6dd", "#ead4c0", "#d7b7a3", "#9a7c67", "#6d5347", "#3b2d2a"],
  },
  {
    key: "overlay_color",
    label: "Overlay / Scrim Colors",
    description: "Contrast overlay and text support",
    options: ["#000000", "#171717", "#2b2b2b", "#3a3a3a", "#4d4d4d", "#7c7c7c"],
  },
  {
    key: "other_color",
    label: "Other",
    description: "Optional brand accent",
    options: ["#f7efe5", "#f3d7b7", "#a75d4d", "#caa0a0", "#7f9d8d", "#7a8ca1"],
  },
] as const;

export default function BrandPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [brand, setBrand] = useState<BrandKit & { other_color?: string }>({
    primary_color: "#111111",
    secondary_color: "#d9c7b5",
    accent_color: "#b86a4d",
    neutral_color: "#f4f1ee",
    tint_color: "#f1e6dd",
    overlay_color: "#000000",
    other_color: "#f7efe5",
    end_card: "Made with Cueable",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedColorKey, setSelectedColorKey] = useState<(typeof colorSections)[number]["key"]>("primary_color");
  const activeColorSection = colorSections.find((section) => section.key === selectedColorKey) ?? colorSections[0];
  const activeSelectedColor = (brand[activeColorSection.key as keyof BrandKit] as string | undefined) ?? activeColorSection.options[0];

  useEffect(() => {
    void loadBrandKit();
  }, []);

  async function loadBrandKit() {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setBrand(readLocalBrandKit());
        return;
      }

      const { data, error } = await supabase.from("brand_kits").select("*").eq("user_id", user.id).maybeSingle();
      if (!error && data) {
        setBrand(data as BrandKit);
        saveLocalBrandKit(data as BrandKit);
      } else {
        setBrand(readLocalBrandKit());
      }
    } catch {
      setBrand(readLocalBrandKit());
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const filePath = `${user.id}/brand/logo-${Date.now()}-${file.name}`;
        const bucketCandidates = ["brand-assets", "brand-kits"];
        let uploadData: { path: string } | null = null;
        let uploadError: { message: string } | null = null;

        for (const bucketName of bucketCandidates) {
          const result = await supabase.storage.from(bucketName).upload(filePath, file, { upsert: true });
          if (!result.error && result.data) {
            uploadData = result.data;
            uploadError = null;
            const url = supabase.storage.from(bucketName).getPublicUrl(uploadData.path).data.publicUrl;
            setBrand((current) => ({ ...current, logo_url: url }));
            if (fileRef.current) fileRef.current.value = "";
            return;
          }
          uploadError = result.error;
        }

        if (uploadError) {
          throw uploadError;
        }
      }

      const localUrl = URL.createObjectURL(file);
      setBrand((current) => ({ ...current, logo_url: localUrl }));
    } catch {
      const localUrl = URL.createObjectURL(file);
      setBrand((current) => ({ ...current, logo_url: localUrl }));
    }

    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setStatusMessage(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        user_id: user?.id,
        logo_url: brand.logo_url ?? null,
        primary_color: brand.primary_color ?? "#111111",
        secondary_color: brand.secondary_color ?? "#d9c7b5",
        accent_color: brand.accent_color ?? "#b86a4d",
        neutral_color: brand.neutral_color ?? "#f4f1ee",
        tint_color: brand.tint_color ?? "#f1e6dd",
        overlay_color: brand.overlay_color ?? "#000000",
        other_color: (brand as Record<string, string | undefined>).other_color ?? "#f7efe5",
        end_card: brand.end_card ?? "Made with Cueable",
      };

      if (user) {
        const { error } = await supabase.from("brand_kits").upsert({ ...payload, user_id: user.id }, { onConflict: "user_id" });
        if (!error) {
          saveLocalBrandKit(payload as BrandKit);
          setSaved(true);
          setStatusMessage("Brand kit saved successfully.");
          setSaving(false);
          return;
        }
      }

      saveLocalBrandKit(payload as BrandKit);
      setSaved(true);
      setStatusMessage("Brand kit saved locally. Create the Supabase brand_kits table and brand-assets bucket to sync it online.");
    } catch {
      saveLocalBrandKit(brand);
      setSaved(true);
      setStatusMessage("Brand kit saved locally. Create the Supabase brand_kits table and brand-assets bucket to sync it online.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-[32px] text-ink-2">{t("Brand kit")}</h1>
      <p className="mt-2 max-w-[460px] text-[14px] leading-[1.45] text-muted">{t("Logo, colors, and the line you want on the end card.")}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[16px] border border-dashed border-line bg-paper p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-2">{t("Logo")}</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-surface">
              {t("+ Add logo")}
            </button>
          </div>
          <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-surface">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="Brand logo" className="h-full w-full object-cover" />
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] text-muted">{t("Upload logo")}</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>

        <div className="rounded-[16px] border border-dashed border-line bg-paper p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-2">Colors</p>
            <select
              value={selectedColorKey}
              onChange={(event) => setSelectedColorKey(event.target.value as (typeof colorSections)[number]["key"])}
              className="min-w-[170px] rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink outline-none"
              aria-label="Select color section"
            >
              {colorSections.map((section) => (
                <option key={section.key} value={section.key}>
                  {t(section.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 rounded-[12px] border border-line bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-medium text-ink-2">{t(activeColorSection.label)}</p>
                <p className="text-[10px] text-muted">{t(activeColorSection.description)}</p>
              </div>
              <input
                type="color"
                value={activeSelectedColor}
                onChange={(event) => {
                  const value = event.target.value;
                  setBrand((current) => ({ ...current, [activeColorSection.key]: value }));
                }}
                className="h-8 w-8 cursor-pointer rounded-[8px] border border-line bg-transparent p-0"
                aria-label={t(activeColorSection.label)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {activeColorSection.options.map((color) => (
                <button
                  key={`${activeColorSection.key}-${color}`}
                  type="button"
                  onClick={() => setBrand((current) => ({ ...current, [activeColorSection.key]: color }))}
                  className={`h-7 w-7 rounded-full border transition ${activeSelectedColor.toLowerCase() === color.toLowerCase() ? "scale-105 border-ink ring-2 ring-offset-1 ring-ink/20" : "border-line hover:scale-105"}`}
                  style={{ backgroundColor: color }}
                  aria-label={`${t("Select")} ${t(activeColorSection.label)} ${color}`}
                  title={`${t(activeColorSection.label)}: ${color}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[16px] border border-dashed border-line bg-paper p-4">
          <p className="text-[13px] font-medium text-ink-2">{t("End card")}</p>
          <textarea
            value={brand.end_card ?? "Made with Cueable"}
            onChange={(event) => setBrand((current) => ({ ...current, end_card: event.target.value }))}
            className="mt-3 h-28 w-full resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving} className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-surface disabled:opacity-60">
          {saving ? t("Saving…") : t("Save brand kit")}
        </button>
        {saved ? <span className="text-[13px] text-olive">{t("Saved")}</span> : null}
      </div>
      {statusMessage ? <p className="mt-3 text-[13px] text-muted">{t(statusMessage)}</p> : null}
    </div>
  );
}

function readLocalBrandKit(): BrandKit {
  const fallback: BrandKit & { other_color?: string } = {
    primary_color: "#111111",
    secondary_color: "#d9c7b5",
    accent_color: "#b86a4d",
    neutral_color: "#f4f1ee",
    tint_color: "#f1e6dd",
    overlay_color: "#000000",
    other_color: "#f7efe5",
    end_card: "Made with Cueable",
  };

  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const savedBrand = JSON.parse(raw) as BrandKit;
    return {
      ...fallback,
      ...savedBrand,
      end_card: savedBrand.end_card === "Made with Primecut" ? "Made with Cueable" : savedBrand.end_card ?? fallback.end_card,
    };
  } catch {
    return fallback;
  }
}

function saveLocalBrandKit(next: BrandKit) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
