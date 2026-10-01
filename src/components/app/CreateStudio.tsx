"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { requestGeneration } from "@/services/generation";
import { VideoProgress } from "@/components/app/VideoProgress";

const modes = [
  { id: "prompt", label: "Prompt" },
  { id: "url", label: "URL" },
  { id: "assets", label: "Assets" },
] as const;

const presetRatios = ["9:16", "1:1", "16:9"];
const presetDurations = ["10s", "15s", "20s", "30s"];

function normalizeRatio(width: number, height: number) {
  let left = width;
  let right = height;
  while (right) [left, right] = [right, left % right];
  return `${width / left}:${height / left}`;
}

export function CreateStudio() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("prompt");
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [ratioChoice, setRatioChoice] = useState("9:16");
  const [ratioWidth, setRatioWidth] = useState("4");
  const [ratioHeight, setRatioHeight] = useState("3");
  const [durationChoice, setDurationChoice] = useState("20s");
  const [customDuration, setCustomDuration] = useState("45");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<File[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("primecut-settings");
      if (!stored) return;
      const preferences = JSON.parse(stored) as { defaultRatio?: string; defaultDuration?: string };
      if (preferences.defaultRatio) {
        if (presetRatios.includes(preferences.defaultRatio)) {
          setRatioChoice(preferences.defaultRatio);
        } else {
          const match = preferences.defaultRatio.match(/^(\d+):(\d+)$/);
          if (match) {
            setRatioChoice("Custom");
            setRatioWidth(match[1]);
            setRatioHeight(match[2]);
          }
        }
      }
      if (preferences.defaultDuration) {
        if (presetDurations.includes(preferences.defaultDuration)) {
          setDurationChoice(preferences.defaultDuration);
        } else {
          const seconds = Number.parseFloat(preferences.defaultDuration.replace(/[^\d.]/g, ""));
          if (Number.isFinite(seconds) && seconds > 0) {
            setDurationChoice("Custom");
            setCustomDuration(String(seconds));
          }
        }
      }
    } catch {
    }
  }, []);

  async function onGenerate() {
    if (running) return;

    if (mode === "prompt" && !prompt.trim()) {
      setError("Describe the video you want to create first.");
      return;
    }

    const customWidth = Number(ratioWidth);
    const customHeight = Number(ratioHeight);
    const customSeconds = Number(customDuration);
    if (ratioChoice === "Custom" && (!Number.isInteger(customWidth) || !Number.isInteger(customHeight) || customWidth < 1 || customWidth > 1000 || customHeight < 1 || customHeight > 1000)) {
      setError("Enter a width and height between 1 and 1,000.");
      return;
    }
    if (durationChoice === "Custom" && (!Number.isInteger(customSeconds) || customSeconds < 1 || customSeconds > 600)) {
      setError("Enter a custom duration between 1 and 600 seconds.");
      return;
    }

    const ratio = ratioChoice === "Custom" ? normalizeRatio(customWidth, customHeight) : ratioChoice;
    const duration = durationChoice === "Custom" ? `${customSeconds}s` : durationChoice;

    setRunning(true);
    setError(null);

    try {
      let assetUrls: string[] = [];
      if (mode === "assets") {
        if (!assets.length) throw new Error("Add at least one image or video asset first.");
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("You must be logged in to upload assets.");

        assetUrls = await Promise.all(assets.map(async (file) => {
          const filePath = `${userData.user.id}/${Date.now()}-${file.name}`;
          const { data, error: uploadError } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
          if (uploadError || !data) throw new Error(uploadError?.message ?? "Unable to upload asset.");
          const publicUrl = supabase.storage.from("assets").getPublicUrl(data.path).data.publicUrl;
          const { error: insertError } = await supabase.from("assets").insert({
            user_id: userData.user.id,
            name: file.name,
            url: publicUrl,
            type: file.type,
            created_at: new Date().toISOString(),
          });
          if (insertError) throw new Error(insertError.message);
          return publicUrl;
        }));
      }

      const result = await requestGeneration({ mode, prompt, url, ratio, duration, assetUrls });
      router.push(`/app/projects/${result.projectId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while creating your project.";
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="font-serif text-[32px] leading-[1.15] text-ink-2">{t("What do you want to create?")}</h1>
      <p className="mt-2 text-[14px] text-muted">{t("Submit a brief for Cueable to turn into a finished ad.")}</p>
      <div className="mt-6 flex gap-1 rounded-[var(--radius-pill)] bg-sidebar p-1">
        {modes.map((item) => (
          <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`flex-1 cursor-pointer rounded-[var(--radius-pill)] py-2 text-[13.5px] font-medium ${mode === item.id ? "bg-surface text-ink" : "text-muted"}`}>
            {t(item.label)}
          </button>
        ))}
      </div>
      {mode === "prompt" ? (
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("Type a prompt for the video you want to create…")} className="mt-4 h-36 w-full resize-none rounded-[16px] border border-line px-4 py-3 text-[15px] leading-[1.45] outline-none placeholder:text-muted-2" />
      ) : null}
      {mode === "url" ? (
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t("Paste a product URL")} className="mt-4 h-12 w-full rounded-[14px] border border-line px-4 text-[14px] outline-none" />
      ) : null}
      {mode === "assets" ? (
        <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[16px] border border-dashed border-line px-4 text-center text-[14px] text-muted hover:bg-sidebar">
          <span>{t("Choose a logo, stills, or a reference clip")}</span>
          <span className="mt-1 text-[12px] text-muted-2">{assets.length ? t("{{count}} files selected", { count: assets.length }) : t("Images and videos")}</span>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => setAssets(Array.from(event.target.files ?? []))} />
        </label>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select label={t("Aspect ratio")} value={ratioChoice} onChange={setRatioChoice} options={[...presetRatios, "Custom"]} />
        <Select label={t("Duration")} value={durationChoice} onChange={setDurationChoice} options={[...presetDurations, "Custom"]} />
      </div>
      {ratioChoice === "Custom" ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label={t("Width")} value={ratioWidth} onChange={setRatioWidth} min={1} max={1000} />
          <NumberField label={t("Height")} value={ratioHeight} onChange={setRatioHeight} min={1} max={1000} />
        </div>
      ) : null}
      {durationChoice === "Custom" ? (
        <div className="mt-3 sm:max-w-[calc(50%-6px)]">
          <NumberField label={t("Duration (seconds)")} value={customDuration} onChange={setCustomDuration} min={1} max={600} />
        </div>
      ) : null}
      {running ? (
        <div className="mt-6">
          <VideoProgress status="pending" />
        </div>
      ) : (
        <button type="button" onClick={onGenerate} className="mt-6 h-11 cursor-pointer rounded-[var(--radius-pill)] bg-ink px-5 text-[14px] font-medium text-surface">
          {t("Generate video")}
        </button>
      )}
      {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  const { t } = useTranslation();
  return (
    <label className="text-[13px] font-medium text-ink-2">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]">
        {options.map((option) => (
          <option key={option}>{t(option)}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (value: string) => void; min: number; max: number }) {
  return (
    <label className="text-[13px] font-medium text-ink-2">
      {label}
      <input type="number" inputMode="numeric" min={min} max={max} step={1} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]" />
    </label>
  );
}
