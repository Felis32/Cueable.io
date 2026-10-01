"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";

type AssetItem = {
  id: string;
  name: string;
  url: string;
  type: string;
  created_at: string;
};

const STORAGE_KEY = "primecut-assets";

export default function AssetsPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadAssets();
  }, []);

  async function loadAssets() {
    setLoading(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAssets(readLocalAssets());
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAssets(data as AssetItem[]);
        saveLocalAssets(data as AssetItem[]);
      } else {
        const localAssets = readLocalAssets();
        setAssets(localAssets);
      }
    } catch {
      setAssets(readLocalAssets());
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setUploading(true);
    setStatusMessage(null);
    const supabase = createClient();
    const newAssets: AssetItem[] = [];
    let savedToSupabase = false;

    for (const file of files) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let uploadedUrl = "";

        if (user) {
          const filePath = `${user.id}/${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("assets")
            .upload(filePath, file, { upsert: true });

          if (!uploadError && uploadData) {
            uploadedUrl = supabase.storage.from("assets").getPublicUrl(uploadData.path).data.publicUrl;
            const { error: insertError } = await supabase.from("assets").insert({
              user_id: user.id,
              name: file.name,
              url: uploadedUrl,
              type: file.type,
              created_at: new Date().toISOString(),
            });

            if (insertError) {
              throw insertError;
            }

            savedToSupabase = true;
          }
        }

        if (!uploadedUrl) {
          uploadedUrl = URL.createObjectURL(file);
        }

        const saved: AssetItem = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          url: uploadedUrl,
          type: file.type,
          created_at: new Date().toISOString(),
        };

        newAssets.push(saved);
      } catch {
        const fallbackUrl = URL.createObjectURL(file);
        newAssets.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          url: fallbackUrl,
          type: file.type,
          created_at: new Date().toISOString(),
        });
      }
    }

    const nextAssets = [...newAssets, ...assets];
    setAssets(nextAssets);
    saveLocalAssets(nextAssets);
    setUploading(false);
    setStatusMessage(
      savedToSupabase
        ? "Asset saved successfully."
        : "Asset saved locally. Create the Supabase assets table and bucket to sync it online."
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <h1 className="font-serif text-[32px] text-ink-2">{t("Assets")}</h1>
      <p className="mt-2 text-[14px] text-muted">{t("Upload product stills, logos, and reference clips for future ad builds.")}</p>

      <div className="mt-8 rounded-[18px] border border-dashed border-line bg-paper p-6">
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleUpload} />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium text-ink-2">{t("Files")}</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface shadow-sm transition hover:bg-ink-2"
          >
            + {t("Add asset")}
          </button>
        </div>

        {loading ? (
          <p className="text-[14px] text-muted">{t("Loading assets…")}</p>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface text-[32px] text-ink shadow-sm transition hover:bg-sidebar"
              aria-label={t("Add asset")}
            >
              +
            </button>
            <p className="text-[14px] text-muted">{t("No assets yet. Click to add assets.")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-medium text-ink-2">{t("Uploaded assets")}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[12px] border border-line bg-surface">
                  {asset.type.startsWith("image/") ? (
                    <img src={asset.url} alt={asset.name} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center bg-sidebar text-[12px] font-medium text-ink">{t("Video")}</div>
                  )}
                  <div className="px-3 py-2 text-[12px] text-muted">{asset.name}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {uploading ? <p className="mt-4 text-[13px] text-muted">{t("Uploading asset…")}</p> : null}
        {statusMessage ? <p className="mt-4 text-[13px] text-muted">{t(statusMessage)}</p> : null}
      </div>
    </div>
  );
}

function readLocalAssets(): AssetItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AssetItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocalAssets(nextAssets: AssetItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAssets));
}
