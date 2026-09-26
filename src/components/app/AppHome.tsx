"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Icon } from "@/components/app/icons";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const steps = [
  "Add a logo and a brand color",
  "Describe the ad, or paste a product URL",
  "Generate the first cut",
  "Export a 9:16 or 16:9",
];

const features = [
  { title: "Prompt to ad", body: "Describe the product, the length, and the light.", tint: "bg-tint-rose", kind: "play" },
  { title: "Product URL", body: "Start from the page you already sell on.", tint: "bg-tint-sage", kind: "langs" },
  { title: "A few concepts", body: "Same brief, different hooks, before you commit.", tint: "bg-tint-peach", kind: "lines" },
  { title: "Placement sizes", body: "9:16, 1:1, and 16:9 from one cut.", tint: "bg-tint-sky", kind: "doc" },
];

const examples = [
  { title: "Matte kettle, morning light", meta: "Example · 0:15", tint: "bg-night" },
  { title: "Watch, three quiet shots", meta: "Example · 0:20", tint: "bg-olive" },
  { title: "App story, first open", meta: "Example · 0:12", tint: "bg-night-2" },
  { title: "Shelf pan, no voiceover", meta: "Example · 0:18", tint: "bg-[#3d4a38]" },
];

export function AppHome() {
  const [done, setDone] = useState(0);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuRef, menu, () => setMenu(false));

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-[1.2] text-ink-2">Hi Om, welcome to Primecut</h1>
          <p className="mt-1 text-[14px] text-muted">How would you like to get started?</p>
        </div>
        <div className="relative flex items-center gap-2" ref={menuRef}>
          <Link href="/app/brand" className="hidden rounded-[var(--radius-pill)] border border-line px-3.5 py-2 text-[13.5px] font-medium text-ink sm:inline-flex">
            Add brand kit
          </Link>
          <button type="button" onClick={() => setMenu((value) => !value)} className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13.5px] font-medium text-surface">
            + Create new
            <span aria-hidden className="text-[10px] opacity-80">▾</span>
          </button>
          {menu ? (
            <div className="absolute right-0 top-11 z-10 w-52 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(23,23,23,0.12)]">
              <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                Ad from a prompt
              </Link>
              <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                Ad from a URL
              </Link>
              <Link href="/app/assets" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setMenu(false)}>
                Ad from assets
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Link href="/app/create" className="rounded-[16px] border border-line bg-paper/60 p-5 hover:bg-sidebar">
          <Icon name="pen" className="h-6 w-6" />
          <h2 className="mt-4 text-[14px] font-medium text-ink-2">Describe an ad</h2>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">Write the product, the length, and the feeling. Primecut drafts the cut.</p>
        </Link>
        <Link href="/app/create" className="rounded-[16px] border border-line bg-paper/60 p-5 hover:bg-sidebar">
          <Icon name="link" className="h-6 w-6" />
          <h2 className="mt-4 text-[14px] font-medium text-ink-2">Start from a product</h2>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">Paste a product URL or bring stills and a logo you already use.</p>
        </Link>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink-2">Quick start</h2>
          <p className="text-[12px] text-muted">{done}/4 done</p>
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
                <span className={`flex-1 text-[14px] ${complete ? "text-muted line-through" : "text-ink"}`}>{step}</span>
                {current ? (
                  <button type="button" onClick={() => setDone((value) => Math.min(4, value + 1))} className="cursor-pointer rounded-[var(--radius-pill)] bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface">
                    Next
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-ink-2">Popular features</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="overflow-hidden rounded-[16px] border border-line">
              <div className={`relative h-[140px] ${feature.tint}`}>
                <FeatureArt kind={feature.kind} />
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
        <h2 className="text-[15px] font-medium text-ink-2">Example ads</h2>
        <p className="mt-1 text-[13px] text-muted">Structures Primecut can cut. Not customer work.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {examples.map((item) => (
            <article key={item.title}>
              <div className={`relative h-[132px] overflow-hidden rounded-[14px] ${item.tint}`}>
                <div className="absolute inset-4 rounded-[8px] bg-white/15" />
                <span className="absolute bottom-2 right-2 rounded-md bg-night/80 px-1.5 py-0.5 text-[11px] text-surface">{item.meta.split("· ")[1]}</span>
              </div>
              <h3 className="mt-2 text-[13.5px] font-medium text-ink-2">{item.title}</h3>
              <p className="text-[12px] text-muted">{item.meta.split(" · ")[0]}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeatureArt({ kind }: { kind: string }) {
  if (kind === "play") {
    return (
      <div className="absolute inset-5 flex items-center justify-center rounded-[12px] bg-white/55">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-olive">▶</span>
      </div>
    );
  }
  if (kind === "langs") {
    return (
      <div className="absolute inset-x-6 top-5 rounded-[12px] bg-surface p-3 text-[12px] shadow-[0_8px_20px_rgba(23,23,23,0.06)]">
        <p className="text-muted">Aspect</p>
        <p className="mt-1">9:16 story</p>
        <p className="mt-1">1:1 feed</p>
        <p className="mt-1">16:9 film</p>
      </div>
    );
  }
  if (kind === "lines") {
    return (
      <div className="absolute inset-6 space-y-2 rounded-[12px] bg-white/70 p-3">
        <div className="h-2 w-2/3 rounded bg-white" />
        <div className="h-2 rounded bg-white/80" />
        <div className="h-2 w-5/6 rounded bg-white/80" />
      </div>
    );
  }
  return (
    <div className="absolute inset-5 rounded-[12px] bg-white/70 p-3">
      <div className="h-2 w-1/2 rounded bg-line" />
      <div className="mt-3 h-8 rounded bg-white" />
    </div>
  );
}
