"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useObject } from "@ai-sdk/react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadRemoteComposeHistory, saveRemoteComposeHistoryEntry, saveRemoteComposeHistoryResult } from "@/lib/compose-history";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { adBriefSchema, type AdBrief } from "@/lib/ai/brief";
import { composeResponseSchema, type ComposeResponse } from "@/lib/ai/compose-response";
import { productScrapeDataSchema, type ProductScrapeData } from "@/lib/ai/product-scrape-schema";
import { planSceneSchema, scenePlanSchema, type PlanScene, type PlanVariant, type ScenePlan } from "@/lib/ai/scene-plan";

const COMPOSE_DRAFT_KEY = "primecut-compose-draft";
const COMPOSE_HISTORY_KEY = "primecut-compose-history";

const starters = [
  { title: "Open on the product", body: "Skip the logo. First frame is the object." },
  { title: "Three different hooks", body: "Same product, three ways into the first two seconds." },
  { title: "Scenes from a URL", body: "Turn a product page into a shot list." },
  { title: "Two placements", body: "Keep the story, recut it for 9:16 and 16:9." },
];

type HistoryEntry = {
  id: string;
  threadId: string;
  text: string;
  createdAt: string;
  response?: ComposeResponse | null;
  plan?: ScenePlan | null;
};

type HistoryConversation = { id: string; title: string; updatedAt: string; turns: HistoryEntry[] };

type ComposeAttachment = { id: string; name: string; type: string; file: File; url?: string; assetId?: string; uploadedUrl?: string };
type VariantMode = "single" | "three-hooks" | "two-placements";
type GenerationJob = {
  id: string;
  project_id: string;
  project_name: string;
  status: "queued" | "running" | "failed" | "done";
  progress: number;
  cost: number;
  model: string;
  error: string | null;
  attempt_count: number;
  max_attempts: number;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getHistoryGroups(entries: HistoryEntry[]) {
  const now = new Date();
  const conversations = new Map<string, HistoryConversation>();
  for (const entry of entries) {
    const id = entry.threadId || entry.id;
    const conversation = conversations.get(id);
    if (conversation) {
      conversation.turns.push(entry);
      if (entry.createdAt > conversation.updatedAt) conversation.updatedAt = entry.createdAt;
    } else {
      conversations.set(id, { id, title: entry.text, updatedAt: entry.createdAt, turns: [entry] });
    }
  }

  const orderedConversations = [...conversations.values()].map((conversation) => {
    conversation.turns.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    conversation.title = conversation.turns[0]?.text ?? conversation.title;
    return conversation;
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return orderedConversations.reduce<Record<string, HistoryConversation[]>>((result, conversation) => {
    const created = new Date(conversation.updatedAt);
    const label =
      created.toDateString() === now.toDateString()
        ? "Today"
        : new Date(now.getTime() - 86400000).toDateString() === created.toDateString()
          ? "Yesterday"
          : created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

    result[label] = [...(result[label] ?? []), conversation];
    return result;
  }, {});
}

function readGenerationDefaults() {
  try {
    const stored = window.localStorage.getItem("primecut-settings");
    if (!stored) return undefined;
    const preferences = JSON.parse(stored) as { defaultRatio?: unknown; defaultDuration?: unknown; defaultVoiceover?: unknown };
    const ratio = typeof preferences.defaultRatio === "string" && /^[1-9]\d{0,3}:[1-9]\d{0,3}$/.test(preferences.defaultRatio)
      ? preferences.defaultRatio
      : undefined;
    const duration = typeof preferences.defaultDuration === "string"
      ? Number.parseFloat(preferences.defaultDuration.replace(/[^\d.]/g, ""))
      : Number.NaN;
    return {
      aspectRatio: ratio,
      duration: Number.isInteger(duration) && duration >= 1 && duration <= 600 ? duration : undefined,
      voiceover: typeof preferences.defaultVoiceover === "boolean" ? preferences.defaultVoiceover : undefined,
    };
  } catch {
    return undefined;
  }
}

function normalizeVariantDuration(variant: PlanVariant, duration: number): PlanVariant {
  const scenes = variant.scenes.slice(0, Math.min(variant.scenes.length, duration));
  const weightTotal = scenes.reduce((total, scene) => total + scene.seconds, 0) || scenes.length;
  const targetSeconds = scenes.map((scene) => duration * scene.seconds / weightTotal);
  const normalizedSeconds = targetSeconds.map((value) => Math.max(1, Math.floor(value)));
  let remaining = duration - normalizedSeconds.reduce((total, seconds) => total + seconds, 0);

  while (remaining > 0) {
    let index = 0;
    for (let candidate = 1; candidate < normalizedSeconds.length; candidate += 1) {
      if (targetSeconds[candidate] - normalizedSeconds[candidate] > targetSeconds[index] - normalizedSeconds[index]) index = candidate;
    }
    normalizedSeconds[index] += 1;
    remaining -= 1;
  }
  while (remaining < 0) {
    let index = -1;
    for (let candidate = 0; candidate < normalizedSeconds.length; candidate += 1) {
      if (normalizedSeconds[candidate] <= 1) continue;
      if (index < 0 || normalizedSeconds[candidate] - targetSeconds[candidate] > normalizedSeconds[index] - targetSeconds[index]) index = candidate;
    }
    if (index < 0) break;
    normalizedSeconds[index] -= 1;
    remaining += 1;
  }

  return {
    ...variant,
    scenes: scenes.map((scene, index) => ({ ...scene, sceneNumber: index + 1, seconds: normalizedSeconds[index] })),
  };
}

function normalizeScenePlan(plan: ScenePlan, duration: number): ScenePlan {
  return { variants: plan.variants.map((variant) => normalizeVariantDuration(variant, duration)) };
}

function renumberScenes(scenes: PlanScene[]): PlanScene[] {
  return scenes.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
}

export default function ComposePage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const [approvedBrief, setApprovedBrief] = useState<AdBrief | null>(null);
  const [composeAnswer, setComposeAnswer] = useState<string | null>(null);
  const [composeSources, setComposeSources] = useState<Extract<ComposeResponse, { kind: "answer" }>["sources"]>([]);
  const [scrapedProduct, setScrapedProduct] = useState<ProductScrapeData | null>(null);
  const [scrapeWarning, setScrapeWarning] = useState<string | null>(null);
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [variantMode, setVariantMode] = useState<VariantMode>("single");
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [planError, setPlanError] = useState<string | null>(null);
  const pendingSceneRegeneration = useRef<{ variantIndex: number; sceneIndex: number; scene: PlanScene } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [displayName, setDisplayName] = useState("there");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const pendingHistoryTurnId = useRef<string | null>(null);
  const activeHistoryTurnId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const thirdPartyConsentMessage = "Opt in before sending prompts and selected context to third-party free models.";
  const composeStream = useObject({
    api: "/api/compose/brief",
    schema: composeResponseSchema,
    onError: (error) => {
      pendingHistoryTurnId.current = null;
      setSubmitting(false);
      setSubmitError(error.message || "Cueable couldn’t complete that request.");
    },
    onFinish: ({ object, error }) => {
      setSubmitting(false);
      if (error || !object) {
        setSubmitError(error?.message ?? "Cueable couldn’t complete that request. Please try again.");
        return;
      }
      const parsed = composeResponseSchema.safeParse(object);
      if (!parsed.success) {
        setSubmitError("Cueable returned an invalid response. Please try again.");
        return;
      }
      const turnId = pendingHistoryTurnId.current;
      pendingHistoryTurnId.current = null;
      if (turnId) {
        setHistoryEntries((current) => current.map((entry) => entry.id === turnId ? { ...entry, response: parsed.data } : entry));
        void saveRemoteComposeHistoryResult(turnId, { response: parsed.data });
      }
      if (parsed.data.kind === "answer") {
        setApprovedBrief(null);
        setComposeAnswer(parsed.data.answer);
        setComposeSources(parsed.data.sources ?? []);
        return;
      }
      setComposeAnswer(null);
      setComposeSources([]);
      setApprovedBrief(parsed.data.brief);
    },
  });
  const planStream = useObject({
    api: "/api/compose/plan",
    schema: scenePlanSchema,
    onError: (error) => setPlanError(error.message || "Cueable couldn’t create the shot list."),
    onFinish: ({ object, error }) => {
      if (error || !object || !approvedBrief) {
        setPlanError(error?.message ?? "Cueable couldn’t create a complete shot list. Try again.");
        return;
      }
      const parsed = scenePlanSchema.safeParse(object);
      if (!parsed.success) {
        setPlanError("Cueable returned an invalid shot list. Try again.");
        return;
      }
      setScenePlan(normalizeScenePlan(parsed.data, approvedBrief.duration));
      setActiveVariantIndex(0);
      setPlanError(null);
    },
  });
  const sceneStream = useObject({
    api: "/api/compose/plan",
    schema: planSceneSchema,
    onError: (error) => setPlanError(error.message || "Cueable couldn’t regenerate that scene."),
    onFinish: ({ object, error }) => {
      const pending = pendingSceneRegeneration.current;
      pendingSceneRegeneration.current = null;
      if (error || !object || !pending) {
        setPlanError(error?.message ?? "Cueable couldn’t regenerate that scene. Try again.");
        return;
      }
      const parsed = planSceneSchema.safeParse(object);
      if (!parsed.success) {
        setPlanError("Cueable returned an invalid scene. Try again.");
        return;
      }
      setScenePlan((current) => {
        if (!current) return current;
        const variants = current.variants.slice();
        const variant = variants[pending.variantIndex];
        if (!variant || !variant.scenes[pending.sceneIndex]) return current;
        const scenes = variant.scenes.slice();
        scenes[pending.sceneIndex] = {
          ...parsed.data,
          sceneNumber: pending.scene.sceneNumber,
          seconds: pending.scene.seconds,
        };
        variants[pending.variantIndex] = { ...variant, scenes };
        return { variants };
      });
      setPlanError(null);
    },
  });
  useDismissOnOutside(historyRef, open, () => setOpen(false));

  useEffect(() => {
    try {
      setThirdPartyConsent(window.localStorage.getItem("primecut-free-model-consent") === "true");
    } catch {
    }
  }, []);

  useEffect(() => {
    const jobId = generationJob?.id;
    if (!jobId) return;

    const supabase = createClient();
    let active = true;
    void supabase.from("generation_jobs")
      .select("id, project_id, status, progress, cost, model, error, attempt_count, max_attempts")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setGenerationJob((current) => current?.id === jobId ? { ...current, ...data } as GenerationJob : current);
      });
    const channel = supabase
      .channel(`generation-job-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "generation_jobs", filter: `id=eq.${jobId}` }, (payload) => {
        const update = payload.new as Partial<GenerationJob>;
        setGenerationJob((current) => current?.id === jobId ? { ...current, ...update } : current);
        if (update.status === "done") router.refresh();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [generationJob?.id, router]);

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const nextName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email?.split("@")[0] ||
        "there";

      setDisplayName(nextName.split(/\s+/)[0] || "there");
    };

    void loadUser();

    try {
      const savedDraft = window.localStorage.getItem(COMPOSE_DRAFT_KEY);
      if (savedDraft) setBrief(savedDraft);

      const savedHistory = window.localStorage.getItem(COMPOSE_HISTORY_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as HistoryEntry[];
        if (Array.isArray(parsed)) setHistoryEntries(parsed.map((entry) => ({ ...entry, threadId: entry.threadId || crypto.randomUUID() })));
      }
    } catch {
      // ignore local storage issues
    }

    void loadRemoteComposeHistory().then((remoteEntries) => {
      if (!remoteEntries) return;
      setHistoryEntries((current) => {
        const merged = [...remoteEntries, ...current];
        const unique = merged.filter((entry, index) => merged.findIndex((candidate) => candidate.id === entry.id) === index);
        return unique.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      });
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key === COMPOSE_DRAFT_KEY && typeof event.newValue === "string") setBrief(event.newValue);
      if (event.key === COMPOSE_HISTORY_KEY && typeof event.newValue === "string") {
        try {
          const parsed = JSON.parse(event.newValue) as HistoryEntry[];
          if (Array.isArray(parsed)) setHistoryEntries(parsed);
        } catch {
          // ignore parse issues
        }
      }
    };

    window.addEventListener("storage", onStorage);
    const handleComposeUpdate = (event: Event) => {
      const payload = event as CustomEvent<string>;
      if (typeof payload.detail === "string") setBrief(payload.detail);
    };
    window.addEventListener("primecut-compose-update", handleComposeUpdate as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("primecut-compose-update", handleComposeUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMPOSE_DRAFT_KEY, brief);
  }, [brief]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMPOSE_HISTORY_KEY, JSON.stringify(historyEntries));
  }, [historyEntries]);

  useEffect(() => {
    const turnId = activeHistoryTurnId.current;
    if (!turnId) return;
    const response: ComposeResponse | undefined = approvedBrief
      ? { kind: "brief", brief: approvedBrief }
      : composeAnswer
        ? { kind: "answer", answer: composeAnswer, sources: composeSources }
        : undefined;
    const patch = { ...(response ? { response } : {}), plan: scenePlan };
    setHistoryEntries((current) => current.map((entry) => entry.id === turnId ? { ...entry, ...patch } : entry));
    const timer = window.setTimeout(() => void saveRemoteComposeHistoryResult(turnId, patch), 400);
    return () => window.clearTimeout(timer);
  }, [approvedBrief, composeAnswer, composeSources, scenePlan]);

  const groupedHistory = getHistoryGroups(historyEntries);
  const activeConversationTurns = activeConversationId
    ? historyEntries.filter((entry) => entry.threadId === activeConversationId).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];

  function clearScenePlan() {
    if (planStream.isLoading) planStream.stop();
    if (sceneStream.isLoading) sceneStream.stop();
    setScenePlan(null);
    setPlanError(null);
    pendingSceneRegeneration.current = null;
    planStream.clear();
    sceneStream.clear();
  }

  function updatePromptDraft(value: string) {
    setBrief(value);
    setComposeAnswer(null);
    setComposeSources([]);
    setApprovedBrief(null);
    setScrapedProduct(null);
    setScrapeWarning(null);
    clearScenePlan();
  }

  function selectedAssetIds() {
    return [...new Set([
      ...attachments.flatMap((attachment) => attachment.assetId ? [attachment.assetId] : []),
      ...(scrapedProduct?.images.map((image) => image.assetId) ?? []),
    ])];
  }

  function updateApprovedBrief<K extends keyof AdBrief>(key: K, value: AdBrief[K]) {
    setApprovedBrief((current) => current ? { ...current, [key]: value } : current);
    clearScenePlan();
    setSubmitError(null);
  }

  async function saveHistoryItem(text: string, threadId: string) {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const nextEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      threadId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      response: null,
      plan: null,
    };

    setHistoryEntries((current) => [...current, nextEntry]);
    await saveRemoteComposeHistoryEntry(nextEntry);
    return nextEntry;
  }

  function startNewConversation() {
    updatePromptDraft("");
    setActiveConversationId(null);
    activeHistoryTurnId.current = null;
    setAttachments((current) => {
      current.forEach((attachment) => { if (attachment.url) URL.revokeObjectURL(attachment.url); });
      return [];
    });
    setSubmitError(null);
    setGenerationJob(null);
    setOpen(false);
  }

  function restoreConversation(conversation: HistoryConversation) {
    clearScenePlan();
    const latestTurn = conversation.turns[conversation.turns.length - 1];
    setActiveConversationId(conversation.id);
    activeHistoryTurnId.current = latestTurn?.id ?? null;
    setBrief("");
    setAttachments((current) => {
      current.forEach((attachment) => { if (attachment.url) URL.revokeObjectURL(attachment.url); });
      return [];
    });
    setScrapedProduct(null);
    setScrapeWarning(null);
    setSubmitError(null);
    setGenerationJob(null);
    setApprovedBrief(latestTurn?.response?.kind === "brief" ? latestTurn.response.brief : null);
    setComposeAnswer(latestTurn?.response?.kind === "answer" ? latestTurn.response.answer : null);
    setComposeSources(latestTurn?.response?.kind === "answer" ? latestTurn.response.sources ?? [] : []);
    setScenePlan(latestTurn?.plan ?? null);
    setOpen(false);
  }

  async function uploadAttachments() {
    if (!attachments.length) return [];
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be logged in to upload assets.");

    const uploaded = attachments.slice();
    for (let index = 0; index < uploaded.length; index += 1) {
      const attachment = uploaded[index];
      if (attachment.assetId && attachment.uploadedUrl) continue;
      const filePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${attachment.file.name}`;
      const { data, error: uploadError } = await supabase.storage.from("assets").upload(filePath, attachment.file, { upsert: true });
      if (uploadError || !data) throw new Error(uploadError?.message ?? "Unable to upload attachment.");
      const uploadedUrl = supabase.storage.from("assets").getPublicUrl(data.path).data.publicUrl;
      const { data: asset, error: insertError } = await supabase.from("assets").insert({
        user_id: user.id,
        name: attachment.file.name,
        url: uploadedUrl,
        type: attachment.file.type,
        created_at: new Date().toISOString(),
      }).select("id").single();
      if (insertError || !asset) throw new Error(insertError?.message ?? "Unable to save attachment.");
      uploaded[index] = { ...attachment, assetId: asset.id, uploadedUrl };
      setAttachments(uploaded.slice());
    }
    return uploaded;
  }

  async function handleSend() {
    if (submitting || composeStream.isLoading || (!brief.trim() && !attachments.length)) return;
    if (!thirdPartyConsent) {
      setSubmitError(thirdPartyConsentMessage);
      return;
    }
    const prompt = brief.trim() || "Create a video ad from these product assets.";
    const conversationId = activeConversationId ?? crypto.randomUUID();
    setActiveConversationId(conversationId);
    activeHistoryTurnId.current = null;
    setSubmitting(true);
    setSubmitError(null);
    setApprovedBrief(null);
    setComposeAnswer(null);
    setComposeSources([]);
    clearScenePlan();

    try {
      setScrapedProduct(null);
      setScrapeWarning(null);
      const detectedUrl = prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[),.!?;:]+$/, "");
      let scraped: ProductScrapeData | null = null;
      if (detectedUrl) {
        try {
          const scrapeResponse = await fetch("/api/compose/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: detectedUrl }),
          });
          const scrapeResult = await scrapeResponse.json() as { product?: unknown; warning?: string; error?: string };
          const parsedScrape = productScrapeDataSchema.safeParse(scrapeResult.product);
          if (!scrapeResponse.ok || !parsedScrape.success) {
            setScrapeWarning(scrapeResult.warning ?? scrapeResult.error ?? "Cueable couldn’t read that product page. You can continue with your prompt.");
          } else {
            scraped = parsedScrape.data;
            setScrapedProduct(scraped);
            if (scrapeResult.warning) setScrapeWarning(scrapeResult.warning);
          }
        } catch {
          setScrapeWarning("Cueable couldn’t read that product page. You can continue with your prompt.");
        }
      }
      const uploaded = await uploadAttachments();
      const historyTurn = await saveHistoryItem(prompt, conversationId);
      if (historyTurn) {
        activeHistoryTurnId.current = historyTurn.id;
        pendingHistoryTurnId.current = historyTurn.id;
      }
      composeStream.submit({
        prompt,
        conversationId,
        thirdPartyConsent,
        assetIds: [...new Set([
          ...uploaded.flatMap((attachment) => attachment.assetId ? [attachment.assetId] : []),
          ...(scraped?.images.map((image) => image.assetId) ?? []),
        ])],
        generationDefaults: readGenerationDefaults(),
        scrapedProduct: scraped ? {
          sourceUrl: scraped.sourceUrl,
          title: scraped.title,
          description: scraped.description,
          price: scraped.price,
          keyFeatures: scraped.keyFeatures,
        } : undefined,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to understand this brief.");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePlan() {
    if (!approvedBrief || submitting || composeStream.isLoading || planStream.isLoading || sceneStream.isLoading) return;
    if (!thirdPartyConsent) {
      setSubmitError(thirdPartyConsentMessage);
      return;
    }
    const validatedBrief = adBriefSchema.safeParse(approvedBrief);
    if (!validatedBrief.success) {
      setSubmitError("Review the brief fields and try again.");
      return;
    }

    setSubmitError(null);
    clearScenePlan();
    setActiveVariantIndex(0);
    planStream.submit({
      action: "plan",
      brief: validatedBrief.data,
      assetIds: selectedAssetIds(),
      thirdPartyConsent,
      variantMode,
    });
  }

  function regenerateScene(variantIndex: number, sceneIndex: number) {
    const variant = scenePlan?.variants[variantIndex];
    const scene = variant?.scenes[sceneIndex];
    if (!approvedBrief || !variant || !scene || composeStream.isLoading || planStream.isLoading || sceneStream.isLoading || submitting) return;
    if (!thirdPartyConsent) {
      setPlanError(thirdPartyConsentMessage);
      return;
    }
    pendingSceneRegeneration.current = { variantIndex, sceneIndex, scene };
    setPlanError(null);
    sceneStream.clear();
    sceneStream.submit({
      action: "regenerate-scene",
      brief: approvedBrief,
      assetIds: selectedAssetIds(),
      thirdPartyConsent,
      variant: { label: variant.label, aspectRatio: variant.aspectRatio, hook: variant.hook },
      scene,
    });
  }

  async function handleCreateFromPlan() {
    if (!approvedBrief || !scenePlan || submitting || planStream.isLoading || sceneStream.isLoading || generationJob?.status === "queued" || generationJob?.status === "running") return;
    const variant = scenePlan.variants[activeVariantIndex];
    if (!variant) return;
    const totalSeconds = variant.scenes.reduce((total, scene) => total + scene.seconds, 0);
    if (totalSeconds !== approvedBrief.duration) {
      setPlanError(`Scene duration is ${totalSeconds}s. Adjust the scenes to total ${approvedBrief.duration}s before continuing.`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/compose/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: approvedBrief,
          variant,
          assetIds: selectedAssetIds(),
        }),
      });
      const result = await response.json() as { job?: Partial<GenerationJob>; error?: string };
      if (!response.ok || !result.job?.id || !result.job.project_id) {
        throw new Error(result.error ?? "Unable to queue video generation.");
      }
      setGenerationJob({
        id: result.job.id,
        project_id: result.job.project_id,
        project_name: result.job.project_name ?? approvedBrief.product,
        status: result.job.status ?? "queued",
        progress: result.job.progress ?? 0,
        cost: result.job.cost ?? 0,
        model: result.job.model ?? "mock-video-v1",
        error: result.job.error ?? null,
        attempt_count: result.job.attempt_count ?? 0,
        max_attempts: result.job.max_attempts ?? 3,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to queue video generation.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateScene(variantIndex: number, sceneIndex: number, patch: Partial<PlanScene>) {
    setScenePlan((current) => {
      if (!current) return current;
      const variants = current.variants.slice();
      const variant = variants[variantIndex];
      if (!variant) return current;
      const scenes = variant.scenes.slice();
      scenes[sceneIndex] = { ...scenes[sceneIndex], ...patch };
      variants[variantIndex] = { ...variant, scenes };
      return { variants };
    });
    setPlanError(null);
  }

  function moveScene(variantIndex: number, sceneIndex: number, direction: -1 | 1) {
    setScenePlan((current) => {
      if (!current) return current;
      const variants = current.variants.slice();
      const variant = variants[variantIndex];
      const destination = sceneIndex + direction;
      if (!variant || destination < 0 || destination >= variant.scenes.length) return current;
      const scenes = variant.scenes.slice();
      [scenes[sceneIndex], scenes[destination]] = [scenes[destination], scenes[sceneIndex]];
      variants[variantIndex] = { ...variant, scenes: renumberScenes(scenes) };
      return { variants };
    });
  }

  function deleteScene(variantIndex: number, sceneIndex: number) {
    setScenePlan((current) => {
      if (!current) return current;
      const variants = current.variants.slice();
      const variant = variants[variantIndex];
      if (!variant || variant.scenes.length <= 1) return current;
      variants[variantIndex] = { ...variant, scenes: renumberScenes(variant.scenes.filter((_, index) => index !== sceneIndex)) };
      return { variants };
    });
    setPlanError(null);
  }

  const activeVariant = scenePlan?.variants[activeVariantIndex] ?? null;
  const activeVariantDuration = activeVariant?.scenes.reduce((total, scene) => total + scene.seconds, 0) ?? 0;
  const liveComposeAnswer = composeStream.object?.kind === "answer" && typeof composeStream.object.answer === "string"
    ? composeStream.object.answer
    : composeAnswer;
  const liveComposeSources = composeStream.object?.kind === "answer" && Array.isArray(composeStream.object.sources)
    ? composeStream.object.sources.filter((source): source is { title: string; url: string } => Boolean(source?.title && source?.url))
    : composeSources;

  function handleMic() {
    if (typeof window === "undefined") return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const SpeechRecognitionCtor = (window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      window.alert("Speech recognition is not available in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = i18n.language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setApprovedBrief(null);
        setScrapedProduct(null);
        setScrapeWarning(null);
        clearScenePlan();
        setBrief((current) => (current ? `${current} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
    recognitionRef.current = recognition;
  }

  function removeAttachment(id: string) {
    setApprovedBrief(null);
    setAttachments((current) => {
      const next = current.filter((item) => item.id !== id);
      const removed = current.find((item) => item.id === id);
      if (removed?.url) {
        URL.revokeObjectURL(removed.url);
      }
      return next;
    });
  }

  function handleClipUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setApprovedBrief(null);
    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type || "file",
        file,
        url: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : undefined,
      })),
    ].slice(-6));
    event.target.value = "";
  }

  function updateThirdPartyConsent(value: boolean) {
    setThirdPartyConsent(value);
    try {
      window.localStorage.setItem("primecut-free-model-consent", String(value));
    } catch {
    }
    if (value) {
      setSubmitError((current) => current?.startsWith("Opt in before sending") ? null : current);
      setPlanError((current) => current?.startsWith("Opt in before sending") ? null : current);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-140px)] pt-1">
      <div className="absolute -left-2 top-0 md:-left-4" ref={historyRef}>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] text-muted hover:text-ink">
          <span aria-hidden>↺</span>
          {t("History")}
          <span className="text-[10px]">▾</span>
        </button>
        {open ? (
          <div className="absolute left-0 top-8 z-20 w-[320px] rounded-[14px] border border-line bg-surface p-2 shadow-[0_16px_40px_rgba(23,23,23,0.1)]">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[12px] font-medium text-ink-2">{t("Conversations")}</p>
              <button type="button" disabled={submitting || composeStream.isLoading} onClick={startNewConversation} className="text-[12px] font-medium text-ink underline underline-offset-2 disabled:opacity-50">{t("New chat")}</button>
            </div>
            <div className="max-h-[260px] space-y-4 overflow-y-auto pr-1">
              {Object.entries(groupedHistory).length ? (
                Object.entries(groupedHistory).map(([label, items]) => (
                  <div key={label}>
                    <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
                    <div className="space-y-1">
                      {items.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          disabled={submitting || composeStream.isLoading}
                          className={`block w-full rounded-[10px] px-2 py-2 text-left hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50 ${activeConversationId === conversation.id ? "bg-sidebar" : "cursor-pointer"}`}
                          onClick={() => restoreConversation(conversation)}
                        >
                          <div className="truncate text-[13px] text-ink">{conversation.title}</div>
                          <div className="mt-1 text-[10.5px] text-muted">{conversation.turns.length} {t("turns")} · {new Date(conversation.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-2 py-2 text-[12.5px] text-muted">{t("No recent prompts yet.")}</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-[760px] flex-col items-center">
        <h1 className="mt-14 text-center font-serif text-[36px] leading-[1.15] text-ink-2 md:text-[42px]">
          {t("Hey {{name}},", { name: displayName })}
          <br />
          {t("what are we creating?")}
        </h1>
        <p className="mt-3 max-w-[420px] text-center text-[14px] leading-[1.45] text-muted">
          {t("Describe the product, the length, and how the ad should open.")}
        </p>

        <div className="relative mt-8 w-full">
          <textarea
            value={brief}
            onChange={(event) => updatePromptDraft(event.target.value)}
            placeholder={t("A 15-second ad. Matte black kettle. Morning light. No voiceover.")}
            aria-busy={submitting || composeStream.isLoading}
            className={`${submitting || composeStream.isLoading ? "ai-thinking-border" : ""} h-[148px] w-full resize-none rounded-[18px] border border-line bg-surface px-4 py-4 pr-20 text-[15px] leading-[1.45] outline-none placeholder:text-muted-2`}
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-end gap-3">
            <div className="flex shrink-0 items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple className="hidden" onChange={handleClipUpload} />
            <div className="group relative">
              <button
                type="button"
                aria-label={t("Add media")}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 12.2V5.4a1 1 0 0 1 1-1h5.4a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M6.5 9.5 8 7.5l2 2.5 1.6-2 1.9 4.2H4.6L6.5 9.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] text-ink opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
                {t("Upload")}
              </span>
            </div>
            <div className="group relative">
              <button
                type="button"
                aria-label={t("Voice input")}
                onClick={handleMic}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ${isListening ? "bg-ink text-surface" : "text-muted hover:bg-sidebar"}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="6" y="2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.2 8a3.8 3.8 0 0 0 7.6 0M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] text-ink opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
                {isListening ? t("Stop") : t("Speak")}
              </span>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => void handleSend()} disabled={submitting || composeStream.isLoading} aria-label={t(submitting || composeStream.isLoading ? "Thinking…" : "Send")} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-ink text-surface disabled:cursor-wait disabled:opacity-60">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M7 11V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] text-ink opacity-0 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
                {submitting ? t("Sending…") : composeStream.isLoading ? t("Thinking…") : t("Send")}
              </span>
            </div>
            </div>
          </div>
        </div>

        {!thirdPartyConsent ? (
          <label className="mt-2 flex w-full items-start gap-2 text-[11px] leading-[1.4] text-muted">
            <input type="checkbox" checked={thirdPartyConsent} onChange={(event) => updateThirdPartyConsent(event.target.checked)} className="mt-0.5 accent-ink" />
            <span>{t("I opt in to sending my prompt and selected assets to Cueable’s free AI and web search providers when needed.")}</span>
          </label>
        ) : (
          <div className="mt-2 flex w-full items-center gap-2 text-[11px] text-muted">
            <span aria-live="polite">{t("Cueable free model enabled")}</span>
            <button type="button" onClick={() => updateThirdPartyConsent(false)} className="underline">{t("Undo")}</button>
          </div>
        )}

        {activeConversationTurns.length ? (
          <section aria-label={t("Conversation history")} className="mt-4 max-h-[360px] w-full space-y-3 overflow-y-auto rounded-[12px] border border-line bg-paper/40 p-3">
            {activeConversationTurns.map((turn, index) => (
              <article key={turn.id} className="space-y-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <p className="whitespace-pre-wrap rounded-[9px] bg-surface px-3 py-2 text-[12px] leading-[1.5] text-ink-2">{turn.text}</p>
                {turn.response && index < activeConversationTurns.length - 1 ? (
                  <div className="rounded-[9px] bg-surface px-3 py-2 text-[12px] leading-[1.5] text-muted">
                    {turn.response.kind === "answer" ? (
                      <p className="whitespace-pre-wrap">{turn.response.answer}</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(turn.response.brief).map(([key, value]) => (
                          <p key={key}><span className="font-medium capitalize text-ink-2">{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}:</span> {Array.isArray(value) ? value.join(" · ") : typeof value === "boolean" ? value ? t("On") : t("Off") : String(value)}</p>
                        ))}
                      </div>
                    )}
                    {turn.plan ? (
                      <details className="mt-2 border-t border-line pt-2">
                        <summary className="cursor-pointer font-medium text-ink-2">{t("Saved shot list")}</summary>
                        {turn.plan.variants.map((variant) => (
                          <div key={variant.key} className="mt-2 space-y-1">
                            <p className="font-medium text-ink-2">{variant.label} · {variant.aspectRatio}</p>
                            <p><strong>{t("Hook")}:</strong> {variant.hook}</p>
                            <p className="whitespace-pre-wrap"><strong>{t("Script")}:</strong> {variant.script}</p>
                            {variant.scenes.map((scene) => <p key={scene.sceneNumber}>{scene.sceneNumber}. {scene.visualDescription} · {scene.seconds}s{scene.onScreenText ? ` · ${scene.onScreenText}` : ""}{scene.voiceoverLine ? ` · ${scene.voiceoverLine}` : ""}</p>)}
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </div>
                ) : turn.response ? null : index < activeConversationTurns.length - 1 ? (
                  <p className="px-2 text-[11px] text-muted">{t("No reply was saved for this turn.")}</p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        {liveComposeAnswer ? (
          <section role="status" aria-label={t("Cueable answer")} className="mt-4 w-full border-l-2 border-olive pl-3 text-[13px] leading-[1.55] text-ink-2">
            <p className="mb-1 text-[11px] font-medium text-muted">{t("Cueable")}</p>
            <p className="whitespace-pre-wrap">{liveComposeAnswer}</p>
            {liveComposeSources?.length ? (
              <ul className="mt-2 space-y-1 text-[11px]">
                {liveComposeSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{source.title}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {composeStream.isLoading && !liveComposeAnswer ? <p role="status" className="mt-3 w-full text-[12px] text-muted">{t("Cueable is thinking…")}</p> : null}
        {submitError ? <p className="mt-3 w-full text-[13px] text-red-600">{submitError}</p> : null}
        {scrapeWarning ? <p role="status" className="mt-3 w-full text-[13px] text-muted">{scrapeWarning}</p> : null}

        {attachments.length ? (
          <div className="mt-3 flex w-full flex-wrap gap-2">
            {attachments.map((file) => (
              <div key={file.id} className="group inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-sidebar px-2.5 py-1 text-[11px] text-muted transition hover:border-[#d5cabd] hover:text-ink">
                <button
                  type="button"
                  onClick={() => {
                    if (file.url) {
                      window.open(file.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="max-w-[220px] truncate text-left"
                  aria-label={`Open ${file.name}`}
                >
                  {file.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeAttachment(file.id)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-muted transition hover:text-ink"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {approvedBrief ? (
          <section aria-labelledby="approved-brief-title" className="mt-5 w-full rounded-[14px] border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <h2 id="approved-brief-title" className="text-[16px] font-medium text-ink-2">{t("Brief")}</h2>
              <button type="button" disabled={submitting} onClick={() => void handleSend()} className="text-[12px] font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink disabled:opacity-50">{t("Regenerate")}</button>
            </div>
            {scrapedProduct ? (
              <div className="mt-4 rounded-[10px] bg-paper px-3 py-3 text-[12px] leading-[1.5] text-muted">
                <p className="font-medium text-ink-2">{t("Product page details")}: {scrapedProduct.title || scrapedProduct.sourceUrl}</p>
                {scrapedProduct.description ? <p className="mt-1">{scrapedProduct.description}</p> : null}
                {scrapedProduct.price ? <p className="mt-1">{t("Listed price")}: {scrapedProduct.price}</p> : null}
                {scrapedProduct.keyFeatures.length ? <p className="mt-1">{scrapedProduct.keyFeatures.join(" · ")}</p> : null}
                {scrapedProduct.images.length ? <p className="mt-1">{t("{{count}} product images added", { count: scrapedProduct.images.length })}</p> : null}
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-[12px] font-medium text-ink-2">{t("Product")}
                <input value={approvedBrief.product} onChange={(event) => updateApprovedBrief("product", event.target.value)} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Audience")}
                <input value={approvedBrief.audience} onChange={(event) => updateApprovedBrief("audience", event.target.value)} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Duration (seconds)")}
                <input type="number" min={1} max={600} step={1} value={approvedBrief.duration} onChange={(event) => updateApprovedBrief("duration", Number(event.target.value))} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Aspect ratios")}
                <input value={approvedBrief.aspectRatios.join(", ")} onChange={(event) => updateApprovedBrief("aspectRatios", event.target.value.split(",").map((ratio) => ratio.trim()).filter(Boolean))} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Hook style")}
                <input value={approvedBrief.hookStyle} onChange={(event) => updateApprovedBrief("hookStyle", event.target.value)} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Tone")}
                <input value={approvedBrief.tone} onChange={(event) => updateApprovedBrief("tone", event.target.value)} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Call to action")}
                <input value={approvedBrief.cta} onChange={(event) => updateApprovedBrief("cta", event.target.value)} className="mt-1.5 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[13px] font-normal" />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={approvedBrief.voiceover} onChange={(event) => updateApprovedBrief("voiceover", event.target.checked)} className="h-4 w-4 accent-ink" />
                {t("Include voiceover")}
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Must include")}
                <textarea value={approvedBrief.mustInclude.join("\n")} onChange={(event) => updateApprovedBrief("mustInclude", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} rows={3} className="mt-1.5 w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-medium text-ink-2">{t("Must avoid")}
                <textarea value={approvedBrief.mustAvoid.join("\n")} onChange={(event) => updateApprovedBrief("mustAvoid", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} rows={3} className="mt-1.5 w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-normal" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => { clearScenePlan(); setVariantMode("single"); }} aria-pressed={variantMode === "single"} disabled={planStream.isLoading || sceneStream.isLoading} className={`h-9 rounded-full px-3 text-[12px] font-medium disabled:opacity-50 ${variantMode === "single" ? "bg-ink text-surface" : "border border-line text-ink-2"}`}>
                {t("Standard")}
              </button>
              <button type="button" onClick={() => { clearScenePlan(); setVariantMode("three-hooks"); }} aria-pressed={variantMode === "three-hooks"} disabled={planStream.isLoading || sceneStream.isLoading} className={`h-9 rounded-full px-3 text-[12px] font-medium disabled:opacity-50 ${variantMode === "three-hooks" ? "bg-ink text-surface" : "border border-line text-ink-2"}`}>
                {t("3 hooks")}
              </button>
              <button type="button" onClick={() => { clearScenePlan(); setVariantMode("two-placements"); }} aria-pressed={variantMode === "two-placements"} disabled={planStream.isLoading || sceneStream.isLoading} className={`h-9 rounded-full px-3 text-[12px] font-medium disabled:opacity-50 ${variantMode === "two-placements" ? "bg-ink text-surface" : "border border-line text-ink-2"}`}>
                {t("2 placements")}
              </button>
              <button type="button" onClick={handlePlan} disabled={planStream.isLoading || sceneStream.isLoading || submitting} className="h-10 rounded-full bg-ink px-4 text-[13px] font-medium text-surface disabled:cursor-wait disabled:opacity-60">
                {planStream.isLoading ? t("Planning…") : scenePlan ? t("Regenerate plan") : t("Create script & shot list")}
              </button>
            </div>
          </section>
        ) : null}

        {planStream.isLoading ? (
          <section aria-live="polite" className="mt-5 w-full rounded-[12px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-ink-2">{t("Building script and shot list…")}</p>
              <button type="button" onClick={() => planStream.stop()} className="text-[12px] text-muted underline decoration-line underline-offset-4">{t("Stop")}</button>
            </div>
            {planStream.object?.variants?.map((variant, variantIndex) => (
              <div key={variant?.key ?? variantIndex} className="mt-3 border-t border-line pt-3">
                {variant?.label ? <p className="text-[12px] font-medium text-ink-2">{variant.label}</p> : null}
                {variant?.script ? <p className="mt-1 whitespace-pre-wrap text-[12px] leading-[1.5] text-muted">{variant.script}</p> : null}
                {variant?.scenes?.map((scene, sceneIndex) => (
                  <p key={scene?.sceneNumber ?? sceneIndex} className="mt-2 text-[12px] text-muted">
                    {scene?.sceneNumber ? `${scene.sceneNumber}. ` : ""}{scene?.visualDescription ?? t("Writing scene…")}{scene?.seconds ? ` · ${scene.seconds}s` : ""}
                  </p>
                ))}
              </div>
            ))}
          </section>
        ) : null}

        {planError && !scenePlan ? <p role="alert" className="mt-4 w-full rounded-[9px] bg-red-50 px-3 py-2 text-[12px] text-red-700">{planError}</p> : null}

        {scenePlan && activeVariant ? (
          <section aria-labelledby="scene-plan-title" className="mt-5 w-full rounded-[14px] border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <h2 id="scene-plan-title" className="text-[16px] font-medium text-ink-2">{t("Script & shot list")}</h2>
                <p className={`mt-1 text-[12px] ${activeVariantDuration === approvedBrief?.duration ? "text-muted" : "text-red-700"}`}>
                  {t("{{current}} of {{total}} seconds", { current: activeVariantDuration, total: approvedBrief?.duration ?? 0 })}
                </p>
              </div>
              {scenePlan.variants.length > 1 ? (
                <div role="group" aria-label={t("Plan variants")} className="flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1">
                  {scenePlan.variants.map((variant, index) => (
                    <button key={`${variant.key}-${index}`} type="button" aria-pressed={activeVariantIndex === index} onClick={() => { setActiveVariantIndex(index); setPlanError(null); }} className={`h-8 rounded-full px-3 text-[12px] font-medium ${activeVariantIndex === index ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}>
                      {variant.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="mt-4 block text-[12px] font-medium text-ink-2">{t("Opening hook")}
              <textarea value={activeVariant.hook} onChange={(event) => setScenePlan((current) => current ? { ...current, variants: current.variants.map((variant, index) => index === activeVariantIndex ? { ...variant, hook: event.target.value } : variant) } : current)} rows={2} className="mt-1.5 w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-normal" />
            </label>
            <label className="mt-4 block text-[12px] font-medium text-ink-2">{t("Script")}
              <textarea value={activeVariant.script} onChange={(event) => setScenePlan((current) => current ? { ...current, variants: current.variants.map((variant, index) => index === activeVariantIndex ? { ...variant, script: event.target.value } : variant) } : current)} rows={4} className="mt-1.5 w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-normal" />
            </label>
            <div className="mt-4 space-y-3">
              {activeVariant.scenes.map((scene, sceneIndex) => {
                const isRegenerating = sceneStream.isLoading && pendingSceneRegeneration.current?.variantIndex === activeVariantIndex && pendingSceneRegeneration.current.sceneIndex === sceneIndex;
                const partialScene = isRegenerating ? sceneStream.object : undefined;
                return (
                  <article key={`${activeVariant.key}-${sceneIndex}`} className="rounded-[10px] border border-line bg-paper/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-medium text-ink-2">{t("Scene {{number}}", { number: scene.sceneNumber })}</h3>
                      <div className="flex items-center gap-1">
                        <button type="button" aria-label={t("Move scene up")} title={t("Move up")} disabled={sceneIndex === 0 || sceneStream.isLoading} onClick={() => moveScene(activeVariantIndex, sceneIndex, -1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-2 disabled:opacity-40">↑</button>
                        <button type="button" aria-label={t("Move scene down")} title={t("Move down")} disabled={sceneIndex === activeVariant.scenes.length - 1 || sceneStream.isLoading} onClick={() => moveScene(activeVariantIndex, sceneIndex, 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-2 disabled:opacity-40">↓</button>
                        <button type="button" disabled={sceneStream.isLoading} onClick={() => regenerateScene(activeVariantIndex, sceneIndex)} className="h-8 rounded-full border border-line px-3 text-[11px] font-medium text-ink-2 disabled:opacity-50">{isRegenerating ? t("Regenerating…") : t("Regenerate")}</button>
                        <button type="button" aria-label={t("Delete scene")} title={t("Delete scene")} disabled={activeVariant.scenes.length <= 1 || sceneStream.isLoading} onClick={() => deleteScene(activeVariantIndex, sceneIndex)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-[18px] text-muted disabled:opacity-40">×</button>
                      </div>
                    </div>
                    {isRegenerating && partialScene?.visualDescription ? <p aria-live="polite" className="mt-2 text-[12px] text-muted">{partialScene.visualDescription}</p> : null}
                    <label className="mt-3 block text-[11px] font-medium text-muted">{t("Visual description")}
                      <textarea value={scene.visualDescription} disabled={isRegenerating} onChange={(event) => updateScene(activeVariantIndex, sceneIndex, { visualDescription: event.target.value })} rows={2} className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-2 text-[12px] font-normal text-ink-2 disabled:opacity-60" />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-[11px] font-medium text-muted">{t("On-screen text")}
                        <textarea value={scene.onScreenText} disabled={isRegenerating} onChange={(event) => updateScene(activeVariantIndex, sceneIndex, { onScreenText: event.target.value })} rows={2} className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-2 text-[12px] font-normal text-ink-2 disabled:opacity-60" />
                      </label>
                      <label className="block text-[11px] font-medium text-muted">{t("Voiceover line")}
                        <textarea value={scene.voiceoverLine} onChange={(event) => updateScene(activeVariantIndex, sceneIndex, { voiceoverLine: event.target.value })} rows={2} disabled={!approvedBrief?.voiceover || isRegenerating} className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-2 text-[12px] font-normal text-ink-2 disabled:bg-paper disabled:text-muted-2" />
                      </label>
                    </div>
                    <label className="mt-3 block max-w-[180px] text-[11px] font-medium text-muted">{t("Seconds")}
                      <input type="number" min={1} max={600} step={1} value={scene.seconds} disabled={isRegenerating} onChange={(event) => updateScene(activeVariantIndex, sceneIndex, { seconds: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-[8px] border border-line bg-surface px-2.5 text-[12px] font-normal text-ink-2 disabled:opacity-60" />
                    </label>
                  </article>
                );
              })}
            </div>
            {planError ? <p role="alert" className="mt-4 rounded-[9px] bg-red-50 px-3 py-2 text-[12px] text-red-700">{planError}</p> : null}
            {activeVariantDuration !== approvedBrief?.duration ? <p role="status" className="mt-3 text-[12px] text-red-700">{t("Adjust scene times to match the approved duration before continuing.")}</p> : null}
            <div className="mt-4 flex justify-end border-t border-line pt-4">
              <button type="button" onClick={() => void handleCreateFromPlan()} disabled={submitting || sceneStream.isLoading || activeVariantDuration !== approvedBrief?.duration} className="h-10 rounded-full bg-ink px-4 text-[13px] font-medium text-surface disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? t("Creating project…") : t("Create project")}
              </button>
            </div>
          </section>
        ) : null}

        {generationJob ? (
          <section aria-live="polite" aria-label={t("Generation job status")} className="mt-5 w-full rounded-[12px] border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-medium text-ink-2">
                  {generationJob.status === "done" ? t("Mock ad ready") : generationJob.status === "failed" ? t("Generation failed") : t("Generating your ad")}
                </h2>
                <p className="mt-1 text-[12px] text-muted">{generationJob.project_name} · {generationJob.model}</p>
              </div>
              {generationJob.status === "done" ? (
                <Link href={`/app/projects/${generationJob.project_id}`} className="inline-flex h-9 items-center rounded-full bg-ink px-3.5 text-[12px] font-medium text-surface">{t("View ad")}</Link>
              ) : generationJob.status === "failed" ? (
                <button type="button" disabled={submitting} onClick={() => void handleCreateFromPlan()} className="h-9 rounded-full border border-line px-3.5 text-[12px] font-medium text-ink-2 disabled:opacity-50">{submitting ? t("Queueing…") : t("Retry")}</button>
              ) : null}
            </div>
            {generationJob.status === "done" ? (
              <p className="mt-3 text-[12px] leading-[1.5] text-muted">{t("This is a mock preview from the no-cost provider adapter. Configure a video provider before using it as a final ad.")}</p>
            ) : generationJob.status === "failed" ? (
              <p role="alert" className="mt-3 text-[12px] leading-[1.5] text-red-700">{generationJob.error || t("The job failed after {{attempts}} attempts.", { attempts: generationJob.attempt_count })}</p>
            ) : (
              <>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-label={t("Generation progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationJob.progress}>
                  <div className="h-full rounded-full bg-olive transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, generationJob.progress))}%` }} />
                </div>
                <p className="mt-2 text-[12px] text-muted">{generationJob.status === "queued" ? t("Waiting for a generation worker…") : t("Rendering scenes…")} {generationJob.progress}%</p>
              </>
            )}
          </section>
        ) : null}

        <div className="mt-10 flex w-full items-center gap-4 text-[12px] text-muted-2">
          <span className="h-px flex-1 bg-line" />
          {t("A few ways in")}
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="mt-5 grid w-full gap-3 sm:grid-cols-2">
          {starters.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => updatePromptDraft(`${t(item.title)}. ${t(item.body)}`)}
              className="cursor-pointer rounded-[14px] border border-line px-4 py-3 text-left hover:bg-sidebar"
            >
              <p className="text-[14px] font-medium text-ink-2">{t(item.title)}</p>
              <p className="mt-1 text-[13px] leading-[1.4] text-muted">{t(item.body)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
