"use client";

import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/app/icons";

type AdaThread = { threadId: string; messages: UIMessage[] };
type AdaThreadSummary = { id: string; title: string; updated_at: string };
type AdaToolPart = {
  type: string;
  state?: string;
  toolCallId?: string;
  input?: { brief?: string; settings?: { aspectRatio?: string; duration?: number; voiceover?: boolean } };
  output?: unknown;
  approval?: { id: string; isAutomatic?: boolean; requestReason?: string };
};

function readGenerationDefaults() {
  try {
    const stored = window.localStorage.getItem("primecut-settings");
    if (!stored) return undefined;
    const preferences = JSON.parse(stored) as {
      defaultRatio?: unknown;
      defaultDuration?: unknown;
      voiceover?: unknown;
    };
    return {
      aspectRatio: typeof preferences.defaultRatio === "string" ? preferences.defaultRatio : undefined,
      duration: typeof preferences.defaultDuration === "string" ? preferences.defaultDuration : undefined,
      voiceover: typeof preferences.voiceover === "boolean" ? preferences.voiceover : undefined,
    };
  } catch {
    return undefined;
  }
}

function hasFreeModelConsent() {
  try {
    return window.localStorage.getItem("primecut-free-model-consent") === "true";
  } catch {
    return false;
  }
}

function renderMessageText(text: string, messageId: string, partIndex: number) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((segment, index) => /^https?:\/\//i.test(segment)
    ? <a key={`${messageId}-${partIndex}-${index}`} href={segment} target="_blank" rel="noreferrer" className="underline underline-offset-2">{segment}</a>
    : <span key={`${messageId}-${partIndex}-${index}`}>{segment}</span>);
}

export function AdaChatPanel({ open, onToggle, pageContext }: { open: boolean; onToggle: () => void; pageContext: string }) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<AdaThread | null>(null);
  const [threads, setThreads] = useState<AdaThreadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loaded = useRef(false);

  async function refreshThreads() {
    const response = await fetch("/api/ada/threads", { cache: "no-store" });
    const result = await response.json() as { threads?: AdaThreadSummary[]; error?: string };
    if (!response.ok || !Array.isArray(result.threads)) throw new Error(result.error ?? "Unable to load Ada conversations.");
    setThreads(result.threads);
  }

  useEffect(() => {
    if (!open || loaded.current) return;
    let active = true;
    loaded.current = true;
    setLoading(true);
    setLoadError(false);
    void fetch("/api/ada", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as AdaThread & { error?: string };
        if (!response.ok || !result.threadId || !Array.isArray(result.messages)) throw new Error(result.error ?? "Unable to load Ada.");
        if (active) setThread(result);
        void refreshThreads().catch(() => {});
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, reloadKey]);

  function retryLoad() {
    loaded.current = false;
    setLoadError(false);
    setReloadKey((current) => current + 1);
  }

  async function selectThread(threadId: string) {
    setLoading(true);
    setLoadError(false);
    setHistoryOpen(false);
    try {
      const response = await fetch(`/api/ada?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
      const result = await response.json() as AdaThread & { error?: string };
      if (!response.ok || !result.threadId || !Array.isArray(result.messages)) throw new Error(result.error ?? "Unable to load Ada conversation.");
      setThread(result);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function startNewThread() {
    setLoading(true);
    setLoadError(false);
    setHistoryOpen(false);
    try {
      const response = await fetch("/api/ada/threads", { method: "POST" });
      const result = await response.json() as AdaThread & { error?: string };
      if (!response.ok || !result.threadId || !Array.isArray(result.messages)) throw new Error(result.error ?? "Unable to start Ada conversation.");
      setThread({ threadId: result.threadId, messages: [] });
      await refreshThreads();
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section aria-label={t("Ada, AI agent")} aria-busy={isThinking} className={`${open ? "" : "hidden"} ${isThinking ? "ai-thinking-border ai-thinking-border--panel" : ""} absolute bottom-20 right-4 z-20 flex h-[380px] w-[min(320px,calc(100%-32px))] flex-col rounded-[16px] border border-line bg-surface shadow-[0_18px_50px_rgba(23,23,23,0.16)]`}>
        <div className="relative z-10 border-b border-line">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[14px] font-medium text-ink">{t("Ada, AI agent")}</p>
            <button type="button" onClick={onToggle} className="cursor-pointer text-[13px] text-muted">{t("Close")}</button>
          </div>
          <div className="flex items-center gap-4 px-4 pb-2">
            <button type="button" aria-expanded={historyOpen} onClick={() => {
              if (!historyOpen) void refreshThreads().catch(() => setLoadError(true));
              setHistoryOpen((current) => !current);
            }} className="text-[12px] text-muted hover:text-ink">{t("History")}</button>
            <button type="button" disabled={loading || isThinking} onClick={() => void startNewThread()} className="text-[12px] font-medium text-ink disabled:opacity-50">{t("New chat")}</button>
          </div>
          {historyOpen ? (
            <div className="absolute left-3 right-3 top-full z-30 max-h-[220px] overflow-y-auto rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_14px_32px_rgba(23,23,23,0.16)]">
              {threads.length ? threads.map((item) => (
                <button key={item.id} type="button" disabled={loading || item.id === thread?.threadId} onClick={() => void selectThread(item.id)} className={`block w-full rounded-[8px] px-2.5 py-2 text-left disabled:cursor-default ${item.id === thread?.threadId ? "bg-sidebar" : "hover:bg-sidebar"}`}>
                  <span className="block truncate text-[12px] text-ink-2">{item.title || t("New Ada conversation")}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{new Date(item.updated_at).toLocaleString()}</span>
                </button>
              )) : <p className="px-2 py-3 text-[12px] text-muted">{t("No conversations yet.")}</p>}
            </div>
          ) : null}
        </div>
        {loading ? (
          <div className="flex flex-1 items-center justify-center px-4 text-[13px] text-muted">{t("Loading Ada…")}</div>
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
            <p role="alert" className="text-[13px] leading-[1.45] text-muted">{t("Ada couldn’t load this conversation.")}</p>
            <button type="button" onClick={retryLoad} className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink">{t("Try again")}</button>
          </div>
        ) : thread ? (
          <AdaConversation key={thread.threadId} thread={thread} pageContext={pageContext} onBusyChange={setIsThinking} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-4 text-[13px] text-muted">{t("Loading Ada…")}</div>
        )}
      </section>
      <button
        type="button"
        aria-label={t("Open Ada")}
        aria-expanded={open}
        onClick={onToggle}
        className="absolute bottom-5 right-4 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-[13px] font-semibold shadow-[0_8px_24px_rgba(23,23,23,0.12)]"
      >
        <Icon name="spark" className="h-5 w-5 text-ink" />
      </button>
    </>
  );
}

function AdaConversation({ thread, pageContext, onBusyChange }: { thread: AdaThread; pageContext: string; onBusyChange: (busy: boolean) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const processedToolCallIds = useRef(new Set<string>());
  const firstMessagesRender = useRef(true);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ada",
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        threadId: thread.threadId,
        pageContext,
        modelKey: "hermes",
        thirdPartyConsent: hasFreeModelConsent(),
        generationDefaults: readGenerationDefaults(),
        messages: messages.slice(-1),
      },
    }),
  }), [pageContext, thread.threadId]);
  const { messages, sendMessage, status, error, stop, addToolApprovalResponse } = useChat({
    id: thread.threadId,
    messages: thread.messages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (firstMessagesRender.current) {
      for (const message of messages) {
        for (const part of message.parts) {
          if (part.type.startsWith("tool-") && "toolCallId" in part && part.state === "output-available") {
            processedToolCallIds.current.add(part.toolCallId);
          }
        }
      }
      firstMessagesRender.current = false;
      return;
    }

    for (const message of messages) {
      for (const part of message.parts) {
        if (!part.type.startsWith("tool-") || !("toolCallId" in part) || part.state !== "output-available") continue;
        if (processedToolCallIds.current.has(part.toolCallId)) continue;
        processedToolCallIds.current.add(part.toolCallId);
        const result = "output" in part && part.output && typeof part.output === "object"
          ? part.output as { action?: string; brief?: string; settings?: { aspectRatio?: string; duration?: number; voiceover?: boolean } }
          : null;
        if (part.type === "tool-openCompose" && result?.action === "openCompose" && result.brief) {
          window.localStorage.setItem("primecut-compose-draft", result.brief);
          window.dispatchEvent(new CustomEvent("primecut-compose-update", { detail: result.brief }));
          router.push("/app/compose");
        }
        if (part.type === "tool-updateDefaults" && result?.settings) {
          try {
            const previous = JSON.parse(window.localStorage.getItem("primecut-settings") ?? "{}") as Record<string, unknown>;
            window.localStorage.setItem("primecut-settings", JSON.stringify({
              ...previous,
              defaultRatio: result.settings.aspectRatio ?? previous.defaultRatio,
              defaultDuration: result.settings.duration ? `${result.settings.duration}s` : previous.defaultDuration,
              defaultVoiceover: result.settings.voiceover ?? previous.defaultVoiceover,
              voiceover: result.settings.voiceover ?? previous.voiceover,
            }));
          } catch {
          }
        }
      }
    }
  }, [messages, router]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="px-1 py-2 text-[13px] leading-[1.45] text-muted">{t("Ada can help improve a brief, find a hook, or think through pacing and aspect ratio.")}</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[92%] whitespace-pre-wrap rounded-[12px] px-3 py-2 text-[13px] leading-[1.45] ${message.role === "user" ? "bg-sidebar-active text-ink" : "bg-paper text-ink-2"}`}>
              {message.parts.map((part, index) => {
                if (part.type === "text") return renderMessageText(part.text, message.id, index);
                if (!part.type.startsWith("tool-")) return null;
                const toolPart = part as unknown as AdaToolPart;
                if (toolPart.type === "tool-searchWeb" && toolPart.state !== "approval-requested") {
                  return (
                    <p key={`${message.id}-${index}`} role="status" className="my-1 text-[11px] text-muted">
                      {toolPart.state === "output-available" ? t("Sources found. Ada is checking them…") : t("Searching the web…")}
                    </p>
                  );
                }
                if (toolPart.state !== "approval-requested" || !toolPart.approval || toolPart.approval.isAutomatic) return null;
                const toolName = toolPart.type.slice("tool-".length);
                const settings = toolPart.input?.settings;
                const requestText = toolName === "openCompose"
                  ? toolPart.input?.brief
                  : settings
                    ? [settings.aspectRatio, settings.duration ? `${settings.duration}s` : null, typeof settings.voiceover === "boolean" ? (settings.voiceover ? t("Voiceover on") : t("Voiceover off")) : null].filter(Boolean).join(" · ")
                    : null;
                return (
                  <div key={toolPart.approval.id} className="my-2 rounded-[9px] border border-line bg-surface p-3">
                    <p className="text-[12px] font-medium text-ink-2">{toolName === "openCompose" ? t("Ada wants to open this brief in Compose") : t("Ada wants to update your generation defaults")}</p>
                    {toolPart.approval.requestReason ? <p className="mt-1 text-[11px] text-muted">{toolPart.approval.requestReason}</p> : null}
                    {requestText ? <p className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap text-[12px] text-muted">{requestText}</p> : null}
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => addToolApprovalResponse({ id: toolPart.approval!.id, approved: false, reason: "The user declined this action." })} className="h-8 rounded-full border border-line px-3 text-[11px] font-medium text-ink-2">{t("Decline")}</button>
                      <button type="button" onClick={() => addToolApprovalResponse({ id: toolPart.approval!.id, approved: true })} className="h-8 rounded-full bg-ink px-3 text-[11px] font-medium text-surface">{t("Approve")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {status === "submitted" ? <p className="px-1 text-[12px] text-muted">{t("Ada is thinking…")}</p> : null}
        {error ? <p role="alert" className="rounded-[9px] bg-red-50 px-2.5 py-2 text-[12px] leading-[1.4] text-red-700">{t("Ada couldn’t complete that reply. Please try again.")}</p> : null}
        <div ref={bottomRef} />
      </div>
      <form className="border-t border-line p-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            maxLength={6000}
            placeholder={t("Message Ada")}
            className="h-10 min-w-0 flex-1 rounded-[12px] border border-line px-3 text-[13.5px] outline-none placeholder:text-muted-2 disabled:opacity-60"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="h-10 shrink-0 rounded-full border border-line px-3 text-[12px] font-medium text-ink">{t("Stop")}</button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="h-10 shrink-0 rounded-full bg-ink px-3.5 text-[12px] font-medium text-surface disabled:cursor-not-allowed disabled:opacity-45">{t("Send")}</button>
          )}
        </div>
      </form>
    </>
  );
}