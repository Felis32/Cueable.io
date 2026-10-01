"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

const freeModelRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  capabilities: z.object({
    contextWindow: z.number().int().nonnegative(),
    supportsTools: z.boolean(),
    supportsJson: z.boolean(),
    tasks: z.array(z.string()),
  }).passthrough(),
  last_seen: z.string().nullable(),
  healthy: z.boolean(),
  enabled: z.boolean(),
  is_primary: z.boolean().optional().default(false),
  priority: z.number().int(),
  last_error: z.string().nullable(),
}).passthrough();

type FreeModelRow = z.infer<typeof freeModelRowSchema>;

function dateLabel(value: string | null) {
  if (!value) return "Never seen";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export function FreeModelCatalog() {
  const [models, setModels] = useState<FreeModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [primarySaving, setPrimarySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadModels() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/free-models", { cache: "no-store" });
      const result = await response.json() as { models?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load free models.");
      const parsed = z.array(freeModelRowSchema).safeParse(result.models);
      if (!parsed.success) throw new Error("Free model catalog returned invalid data.");
      setModels(parsed.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load free models.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadModels();
  }, []);

  async function syncCatalog() {
    setSyncing(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/cron/free-models/sync", { method: "POST" });
      const result = await response.json() as { error?: string; synced?: number; unavailable?: number };
      if (!response.ok) throw new Error(result.error ?? "Unable to sync OpenRouter models.");
      setStatus(`Sync complete. ${result.synced ?? 0} healthy models, ${result.unavailable ?? 0} unavailable.`);
      await loadModels();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync OpenRouter models.");
    } finally {
      setSyncing(false);
    }
  }

  async function setEnabled(model: FreeModelRow, enabled: boolean) {
    setBusyModel(model.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/free-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update model availability.");
      setModels((current) => current.map((item) => item.id === model.id ? { ...item, enabled, is_primary: enabled ? item.is_primary : false } : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update model availability.");
    } finally {
      setBusyModel(null);
    }
  }

  async function setPrimary(model: FreeModelRow) {
    if (!model.enabled || !model.healthy || primarySaving) return;
    setPrimarySaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/free-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, primary: true }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to choose the primary model.");
      setModels((current) => current.map((item) => ({ ...item, is_primary: item.id === model.id })));
      setStatus(`${model.label} is now the primary free model. Other enabled models remain as fallbacks.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to choose the primary model.");
    } finally {
      setPrimarySaving(false);
    }
  }

  const enabledHealthyCount = models.filter((model) => model.enabled && model.healthy).length;

  return (
    <section className="mt-5 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-ink-2">Free model catalog</h2>
          <p className="mt-1 text-[13px] text-muted">{enabledHealthyCount} enabled and healthy · primary runs first</p>
        </div>
        <button type="button" onClick={() => void syncCatalog()} disabled={syncing} className="h-9 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink-2 disabled:opacity-50">
          {syncing ? "Syncing…" : "Sync OpenRouter"}
        </button>
      </header>

      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink-2">{status}</p> : null}

      {loading ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">Loading free models…</div>
      ) : models.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead className="border-b border-line bg-paper text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 font-medium">Context</th>
                <th className="px-3 py-2.5 font-medium">Capabilities</th>
                <th className="px-3 py-2.5 font-medium">Health</th>
                <th className="px-3 py-2.5 font-medium">Last seen</th>
                <th className="px-3 py-2.5 font-medium">Primary</th>
                <th className="px-3 py-2.5 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {models.map((model) => (
                <tr key={model.id}>
                  <td className="max-w-[320px] px-3 py-3">
                    <p className="font-medium text-ink-2">{model.label}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{model.id}</p>
                    {model.last_error ? <p className="mt-1 max-w-[300px] text-[11px] text-red-700">{model.last_error}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-2">{model.capabilities.contextWindow.toLocaleString()} tokens</td>
                  <td className="px-3 py-3 text-muted">
                    {model.capabilities.supportsTools ? "Tools" : "No tools"} · {model.capabilities.supportsJson ? "JSON" : "No JSON"}
                    <p className="mt-0.5">{model.capabilities.tasks.join(", ") || "No tasks"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${model.healthy ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-paper text-muted"}`}>
                      {model.healthy ? "Healthy" : "Unavailable"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{dateLabel(model.last_seen)}</td>
                  <td className="px-3 py-3">
                    <input
                      type="radio"
                      name="primary-free-model"
                      checked={model.is_primary}
                      disabled={!model.healthy || !model.enabled || primarySaving}
                      onChange={() => void setPrimary(model)}
                      aria-label={`Use ${model.label} as the primary free model`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={model.enabled}
                      disabled={!model.healthy || busyModel === model.id}
                      onChange={(event) => void setEnabled(model, event.target.checked)}
                      aria-label={`${model.enabled ? "Disable" : "Enable"} ${model.label}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">No free models have been synced yet.</div>
      )}
    </section>
  );
}