"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/app/icons";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { isHomeCardHoverAnimation, type HomeCardHoverAnimation } from "@/data/home-content";

const steps = [
  "Add a logo and a brand color",
  "Describe the ad, or paste a product URL",
  "Generate the first cut",
  "Export a 9:16 or 16:9",
];

type HomeCardItem = {
  id: string;
  section: "features" | "examples" | "client_work";
  title: string;
  body?: string;
  meta?: string;
  tint?: string;
  kind?: string;
  media_type?: "text" | "image" | "audio" | "video";
  media_url?: string;
  text_content?: string;
  hover_animation?: HomeCardHoverAnimation;
  created_at?: string;
};

const HOME_CONTENT_KEY = "primecut-home-content";

const defaultFeatures: HomeCardItem[] = [
  { id: "feature-prompt", section: "features", title: "Prompt to ad", body: "Describe the product, the length, and the light.", tint: "bg-tint-rose", kind: "play" },
  { id: "feature-url", section: "features", title: "Product URL", body: "Start from the page you already sell on.", tint: "bg-tint-sage", kind: "langs" },
  { id: "feature-concepts", section: "features", title: "A few concepts", body: "Same brief, different hooks, before you commit.", tint: "bg-tint-peach", kind: "lines" },
  { id: "feature-placement", section: "features", title: "Placement sizes", body: "9:16, 1:1, and 16:9 from one cut.", tint: "bg-tint-sky", kind: "doc" },
];

const defaultExamples: HomeCardItem[] = [
  { id: "example-kettle", section: "examples", title: "Matte kettle, morning light", meta: "Example · 0:15", tint: "bg-night" },
  { id: "example-watch", section: "examples", title: "Watch, three quiet shots", meta: "Example · 0:20", tint: "bg-olive" },
  { id: "example-app", section: "examples", title: "App story, first open", meta: "Example · 0:12", tint: "bg-night-2" },
  { id: "example-shelf", section: "examples", title: "Shelf pan, no voiceover", meta: "Example · 0:18", tint: "bg-[#3d4a38]" },
];

function normalizeHomeContent(data: HomeCardItem[] | null | undefined) {
  const items = Array.isArray(data) ? data : [];
  const features = items.filter((item) => item.section === "features");
  const examples = items.filter((item) => item.section === "examples");
  const clientWork = items.filter((item) => item.section === "client_work");
  return {
    features: features.length ? features : defaultFeatures,
    examples: examples.length ? examples : defaultExamples,
    clientWork,
  };
}

function readLocalHomeContent() {
  if (typeof window === "undefined") return { features: defaultFeatures, examples: defaultExamples, clientWork: [] as HomeCardItem[] };
  try {
    const raw = window.localStorage.getItem(HOME_CONTENT_KEY);
    if (!raw) return { features: defaultFeatures, examples: defaultExamples, clientWork: [] as HomeCardItem[] };
    const parsed = JSON.parse(raw) as { features?: HomeCardItem[]; examples?: HomeCardItem[]; clientWork?: HomeCardItem[] };
    return normalizeHomeContent([...(parsed.features ?? []), ...(parsed.examples ?? []), ...(parsed.clientWork ?? [])]);
  } catch {
    return { features: defaultFeatures, examples: defaultExamples, clientWork: [] as HomeCardItem[] };
  }
}

function saveLocalHomeContent(next: { features: HomeCardItem[]; examples: HomeCardItem[]; clientWork: HomeCardItem[] }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_CONTENT_KEY, JSON.stringify(next));
}

export function AppHome() {
  const { t } = useTranslation();
  const [done, setDone] = useState(0);
  const [quickStartReady, setQuickStartReady] = useState(false);
  const [quickStartStorageKey, setQuickStartStorageKey] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [features, setFeatures] = useState<HomeCardItem[]>(defaultFeatures);
  const [examples, setExamples] = useState<HomeCardItem[]>(defaultExamples);
  const [clientWork, setClientWork] = useState<HomeCardItem[]>([]);
  const [displayName, setDisplayName] = useState("there");
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuRef, menu, () => setMenu(false));

  useEffect(() => {
    void loadHomeContent();

    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const quickStartKey = `primecut-quick-start:${user?.id ?? "guest"}`;
      setQuickStartStorageKey(quickStartKey);
      const storedProgress = Number.parseInt(window.localStorage.getItem(quickStartKey) ?? "0", 10);
      setDone(Number.isInteger(storedProgress) ? Math.max(0, Math.min(steps.length, storedProgress)) : 0);
      setQuickStartReady(true);

      const nextName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email?.split("@")[0] ||
        "there";

      setDisplayName(nextName.split(/\s+/)[0] || "there");
    };

    void loadUser();
  }, []);

  async function loadHomeContent() {
    const local = readLocalHomeContent();
    setFeatures(local.features);
    setExamples(local.examples);
    setClientWork(local.clientWork);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.from("home_content").select("*").order("created_at", { ascending: true });
      if (!error && data) {
        const normalized = normalizeHomeContent(data as HomeCardItem[]);
        setFeatures(normalized.features);
        setExamples(normalized.examples);
        setClientWork(normalized.clientWork);
        saveLocalHomeContent(normalized);
      }
    } catch {
      setFeatures(local.features);
      setExamples(local.examples);
      setClientWork(local.clientWork);
    }
  }

  function completeNextQuickStartStep() {
    setDone((current) => {
      const next = Math.min(steps.length, current + 1);
      if (quickStartStorageKey) window.localStorage.setItem(quickStartStorageKey, String(next));
      return next;
    });
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-[1.2] text-ink-2">{t("Hi {{name}}, welcome to Cueable", { name: displayName })}</h1>
          <p className="mt-1 text-[14px] text-muted">{t("How would you like to get started?")}</p>
        </div>
        <div className="relative flex items-center gap-2" ref={menuRef}>
          <Link href="/app/brand" className="hidden rounded-[var(--radius-pill)] border border-line px-3.5 py-2 text-[13.5px] font-medium text-ink sm:inline-flex">
            {t("Add brand kit")}
          </Link>
          <button type="button" onClick={() => setMenu((value) => !value)} className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13.5px] font-medium text-surface">
            {t("+ Create new")}
            <span aria-hidden className="text-[10px] opacity-80">▾</span>
          </button>
          {menu ? (
            <div className="absolute right-0 top-11 z-10 w-52 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(23,23,23,0.12)]">
              <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                {t("Ad from a prompt")}
              </Link>
              <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                {t("Ad from a URL")}
              </Link>
              <Link href="/app/assets" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                {t("Ad from assets")}
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Link href="/app/create" className="rounded-[16px] border border-line bg-paper/60 p-5 hover:bg-sidebar">
          <Icon name="pen" className="h-6 w-6" />
          <h2 className="mt-4 text-[14px] font-medium text-ink-2">{t("Describe an ad")}</h2>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">{t("Write the product, the length, and the feeling. Cueable drafts the video.")}</p>
        </Link>
        <Link href="/app/create" className="rounded-[16px] border border-line bg-paper/60 p-5 hover:bg-sidebar">
          <Icon name="link" className="h-6 w-6" />
          <h2 className="mt-4 text-[14px] font-medium text-ink-2">{t("Start from a product")}</h2>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">{t("Paste a product URL or bring stills and a logo you already use.")}</p>
        </Link>
      </div>

      {quickStartReady && done < steps.length ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-ink-2">{t("Quick start")}</h2>
            <p className="text-[12px] text-muted">{t("{{done}}/4 done", { done })}</p>
          </div>
          <ol className="overflow-hidden rounded-[16px] border border-line">
            {steps.map((step, index) => {
              const complete = index < done;
              const current = index === done;
              return (
                <li key={step} className="flex h-[60px] items-center gap-3 border-b border-line px-4 last:border-b-0">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${complete ? "border-olive bg-olive text-[11px] text-surface" : "border-line-2"}`}>
                    {complete ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-[14px] ${complete ? "text-muted line-through" : "text-ink"}`}>{t(step)}</span>
                  {current ? (
                    <button type="button" onClick={completeNextQuickStartStep} className="cursor-pointer rounded-[var(--radius-pill)] bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface">
                      {t("Next")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {quickStartReady && done === steps.length ? <ClientWorkMarquee items={clientWork} /> : null}

      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-ink-2">{t("Popular features")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.id} className={`home-card-hover overflow-hidden rounded-[16px] border border-line bg-surface ${getHomeCardHoverClass(feature.hover_animation)}`}>
              <div className={`relative h-[140px] overflow-hidden ${feature.tint ?? "bg-tint-rose"}`}>
                <FeatureCardArt item={feature} />
              </div>
              <div className="bg-surface px-3 py-3">
                <h3 className="text-[14px] font-medium text-ink-2">{feature.title}</h3>
                <p className="mt-1 text-[12.5px] leading-[1.4] text-muted">{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-ink-2">{t("Example ads")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {examples.map((item) => (
            <article key={item.id} className={`home-card-hover ${getHomeCardHoverClass(item.hover_animation)}`}>
              <div className={`relative h-[132px] overflow-hidden rounded-[14px] ${item.tint ?? "bg-night"}`}>
                <FeatureCardArt item={item} compact />
                {item.meta ? (
                  <span className="absolute bottom-2 right-2 rounded-md bg-night/80 px-1.5 py-0.5 text-[11px] text-surface">{item.meta.split("· ")[1] || item.meta}</span>
                ) : null}
              </div>
              <h3 className="mt-2 text-[13.5px] font-medium text-ink-2">{item.title}</h3>
              <p className="text-[12px] text-muted">{item.meta ? item.meta.split(" · ")[0] : item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function getHomeCardHoverClass(animation: unknown) {
  return `home-card-hover--${isHomeCardHoverAnimation(animation) ? animation : "none"}`;
}

function ClientWorkMarquee({ items }: { items: HomeCardItem[] }) {
  const { t } = useTranslation();

  return (
    <section className="mt-8" aria-labelledby="client-work-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="client-work-title" className="text-[15px] font-medium text-ink-2">{t("Client work")}</h2>
          <p className="mt-1 text-[12px] text-muted">{t("Selected work from the Cueable studio")}</p>
        </div>
      </div>
      {items.length ? (
        <div className="home-client-work-marquee" aria-label={t("Featured client work") }>
          <div className="home-client-work-track">
            {[false, true].map((duplicate) => (
              <div key={duplicate ? "duplicate" : "original"} className="home-client-work-group" aria-hidden={duplicate}>
                {items.map((item) => (
                  <article key={`${duplicate ? "duplicate-" : ""}${item.id}`} className={`home-card-hover w-[290px] shrink-0 overflow-hidden rounded-[12px] border border-line bg-surface ${getHomeCardHoverClass(item.hover_animation)}`}>
                    <div className={`relative h-[150px] overflow-hidden ${item.tint ?? "bg-night"}`}>
                      <FeatureCardArt item={item} compact decorative={duplicate} />
                    </div>
                    <div className="px-3 py-3">
                      <h3 className="truncate text-[13.5px] font-medium text-ink-2">{item.title}</h3>
                      {item.body ? <p className="mt-1 line-clamp-2 text-[12px] leading-[1.4] text-muted">{item.body}</p> : null}
                      {item.meta ? <p className="mt-1 text-[11px] text-muted-2">{item.meta}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-line px-4 py-5 text-[12px] text-muted">{t("Client work will appear here when it is published.")}</div>
      )}
    </section>
  );
}

function FeatureCardArt({ item, compact = false, decorative = false }: { item: HomeCardItem; compact?: boolean; decorative?: boolean }) {
  if (item.media_type === "image" && item.media_url) {
    return <img src={item.media_url} alt={item.title} className="h-full w-full object-cover" />;
  }

  if (item.media_type === "audio" && item.media_url) {
    return (
      <div className="absolute inset-4 flex items-center justify-center rounded-[12px] border border-white/20 bg-black/10 backdrop-blur-sm">
        <audio controls src={item.media_url} className="w-full max-w-[180px]" />
      </div>
    );
  }

  if (item.media_type === "video" && item.media_url) {
    return (
      <video controls={!decorative} tabIndex={decorative ? -1 : 0} aria-hidden={decorative || undefined} src={item.media_url} className="h-full w-full object-cover" />
    );
  }

  if (item.media_type === "text" || item.text_content) {
    return (
      <div className="absolute inset-4 rounded-[12px] border border-white/20 bg-white/18 p-3 text-left shadow-[0_8px_20px_rgba(23,23,23,0.06)]">
        <p className="line-clamp-5 text-[12px] leading-[1.5] text-ink-2">{item.text_content || item.body || item.title}</p>
      </div>
    );
  }

  if (item.kind === "play") {
    return (
      <div className="absolute inset-5 flex items-center justify-center rounded-[12px] bg-white/55">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-olive">▶</span>
      </div>
    );
  }

  if (item.kind === "langs") {
    return (
      <div className="absolute inset-x-6 top-5 rounded-[12px] bg-surface p-3 text-[12px] shadow-[0_8px_20px_rgba(23,23,23,0.06)]">
        <p className="text-muted">Aspect</p>
        <p className="mt-1">9:16 story</p>
        <p className="mt-1">1:1 feed</p>
        <p className="mt-1">16:9 film</p>
      </div>
    );
  }

  if (item.kind === "lines") {
    return (
      <div className="absolute inset-6 space-y-2 rounded-[12px] bg-white/70 p-3">
        <div className="h-2 w-2/3 rounded bg-white" />
        <div className="h-2 rounded bg-white/80" />
        <div className="h-2 w-5/6 rounded bg-white/80" />
      </div>
    );
  }

  if (compact) {
    return <div className="absolute inset-4 rounded-[8px] bg-white/15" />;
  }

  return (
    <div className="absolute inset-5 rounded-[12px] bg-white/70 p-3">
      <div className="h-2 w-1/2 rounded bg-line" />
      <div className="mt-3 h-8 rounded bg-white" />
    </div>
  );
}
