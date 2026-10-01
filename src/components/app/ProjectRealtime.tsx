"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProjectRealtime({ projectId, status }: { projectId: string; status: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestText, setRequestText] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`customer-project-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `id=eq.${projectId}` }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, router]);

  async function requestRevision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestText.trim()) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/app/projects/${projectId}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: requestText }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to request a revision.");
      setMessage("Your change request has been received.");
      setRequestOpen(false);
      setRequestText("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request a revision.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "delivered" ? (
        <button type="button" disabled={pending} onClick={() => { setMessage(null); setRequestOpen((current) => !current); }} className="inline-flex h-10 items-center rounded-full border border-line px-4 text-[13px] font-medium text-ink disabled:opacity-50">
          {t("Request changes")}
        </button>
      ) : null}
      {requestOpen ? (
        <form onSubmit={(event) => void requestRevision(event)} className="w-full space-y-2 rounded-[8px] border border-line bg-surface p-3">
          <label htmlFor="project-change-request" className="text-[12px] font-medium text-ink-2">{t("What should we change?")}</label>
          <textarea id="project-change-request" required maxLength={3000} rows={4} value={requestText} onChange={(event) => setRequestText(event.target.value)} className="w-full resize-y rounded-[7px] border border-line bg-paper px-3 py-2 text-[13px] text-ink" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRequestOpen(false)} className="h-9 rounded-[7px] border border-line px-3 text-[12px]">{t("Cancel")}</button>
            <button type="submit" disabled={pending} className="h-9 rounded-[7px] bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-50">{pending ? t("Sending…") : t("Send request")}</button>
          </div>
        </form>
      ) : null}
      {message ? <span role="status" className="text-[12px] text-muted">{message}</span> : null}
    </div>
  );
}
