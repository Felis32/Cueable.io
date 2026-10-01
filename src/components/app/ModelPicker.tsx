"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const modelCatalogSchema = z.object({
  plan: z.enum(["free", "pro", "business"]),
  freeModels: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
  proModels: z.array(z.object({ key: z.enum(["claude", "openai", "grok"]), label: z.string() }).strict()),
}).strict();

type ModelCatalog = z.infer<typeof modelCatalogSchema>;

type ModelPickerProps = {
  surface: "compose" | "ada";
  value: string;
  onChange: (value: string) => void;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  compact?: boolean;
  consentPlacement?: "picker" | "external";
};

export function ModelPicker({ surface, value, onChange, consent, onConsentChange, compact = false, consentPlacement = "picker" }: ModelPickerProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/ai/models?surface=${surface}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as unknown;
        if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "AI models couldn’t be loaded.");
        const parsed = modelCatalogSchema.safeParse(body);
        if (!parsed.success) throw new Error("The AI model catalog returned invalid data.");
        setCatalog(parsed.data);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "AI models couldn’t be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey, surface]);

  return (
    <div className={`text-left ${compact ? "w-auto" : "w-full"}`}>
      <div className={`flex ${compact ? "items-center gap-2" : "flex-col"}`}>
      <label className="block text-[12px] font-medium text-ink-2">
        {!compact ? t("Model") : null}
        <select
          aria-label={t("Model")}
          value={value}
          disabled={loading || !catalog}
          onChange={(event) => onChange(event.target.value)}
          className={`${compact ? "h-7 w-[148px] max-w-[min(148px,40vw)]" : "mt-1.5 h-10 w-full"} rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[12px] disabled:opacity-60`}
        >
          <option value="auto">{t("Auto (free)")}</option>
          {value.startsWith("free:") && !catalog?.freeModels.some((model) => `free:${model.id}` === value)
            ? <option value={value} disabled>{t("Selected free model unavailable")}</option>
            : null}
          <optgroup label={t("Free")}>
            {(catalog?.freeModels ?? []).map((model) => <option key={model.id} value={`free:${model.id}`}>{model.label}</option>)}
          </optgroup>
          <optgroup label={t("Pro")}>
            {(catalog?.proModels ?? []).map((model) => (
              <option key={model.key} value={`pro:${model.key}`} disabled={catalog?.plan === "free"}>
                {catalog?.plan === "free" ? `${model.label} (${t("Locked")})` : model.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="group relative">
        <button type="button" aria-label={t("Free model privacy details")} aria-haspopup="dialog" className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium text-muted hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          i
        </button>
        <div role="dialog" aria-label={t("Free model privacy details")} className={`invisible absolute bottom-full left-0 z-30 w-[min(288px,calc(100vw-32px))] rounded-[10px] border border-line bg-surface p-3 text-[12px] leading-[1.45] text-ink-2 opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.14)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${compact ? "" : "left-auto right-0"}`}>
          {t("Free models may process prompts through third parties. Don’t send private brand assets, uploaded files, or personal data unless you opt in.")}
        </div>
      </div>
      </div>
      {loading ? <p role="status" className="mt-1.5 text-[11px] text-muted">{t("Loading models…")}</p> : null}
      {error ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-red-700">
          <p role="alert">{t(error)}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="shrink-0 underline">{t("Retry")}</button>
        </div>
      ) : null}
      {!compact && catalog?.plan === "free" ? <p className="mt-1 text-[11px] text-muted">{t("Pro models are locked on your plan.")} <Link href="/pricing" className="underline">{t("Upgrade")}</Link></p> : null}
      {consentPlacement === "picker" ? (
        <label className="mt-2 flex items-start gap-2 text-[11px] leading-[1.4] text-ink-2">
          <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} className="mt-0.5 accent-ink" />
          <span>{t("I opt in to sending prompts, brand context, and selected assets to third-party free model providers.")}</span>
        </label>
      ) : null}
    </div>
  );
}