"use client";

import Link from "next/link";
import { useState } from "react";
import { Thumb } from "@/components/marketing/Thumb";

const modes = ["Prompt", "URL", "Assets"] as const;

export function HeroStudio() {
  const [mode, setMode] = useState<(typeof modes)[number]>("Prompt");

  return (
    <section id="product" className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 pb-8 pt-[128px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-[148px]">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">Video ads from the source</p>
        <h1 className="mt-4 font-serif text-[42px] leading-[1.08] tracking-[-0.02em] text-ink-2 sm:text-[56px]">
          Turn your product into a video ad in minutes.
        </h1>
        <p className="mt-5 max-w-[440px] text-[15px] leading-[1.5] text-muted">
          Write a prompt, paste a product URL, or drop in the assets you already have. Primecut returns a cut you can run.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/signup" className="inline-flex rounded-[var(--radius-pill)] bg-ink px-5 py-[11px] text-[14px] font-medium text-surface hover:bg-ink-2">
            Create a video
          </Link>
          <a href="#demo" className="text-[14px] font-medium text-ink">
            Watch demo
          </a>
        </div>
      </div>

      <div id="demo" className="rounded-[22px] border border-line bg-surface p-3 shadow-[0_18px_50px_rgba(23,23,23,0.05)]">
        <div className="mb-3 flex gap-1 rounded-[var(--radius-pill)] bg-sidebar p-1">
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 cursor-pointer rounded-[var(--radius-pill)] py-2 text-[13px] font-medium ${mode === item ? "bg-surface text-ink shadow-[0_1px_2px_rgba(23,23,23,0.06)]" : "text-muted"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {mode === "Prompt" ? (
          <textarea
            readOnly
            value="A 20-second ad for a matte black ceramic pour-over. Morning light, no voiceover, end on the wordmark."
            className="h-[92px] w-full resize-none rounded-[14px] border border-line bg-paper/40 px-4 py-3 text-[14px] leading-[1.45] text-ink outline-none"
          />
        ) : null}
        {mode === "URL" ? (
          <input readOnly value="https://atelier.example/pour-over" className="h-12 w-full rounded-[14px] border border-line bg-paper/40 px-4 text-[14px] text-ink outline-none" />
        ) : null}
        {mode === "Assets" ? (
          <div className="flex h-[92px] items-center justify-center rounded-[14px] border border-dashed border-line text-[13.5px] text-muted">
            Logo, stills, or a reference clip
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_148px]">
          <Thumb tint="peach" label="0:20 · 9:16" ratio="16/10" />
          <ol className="flex flex-col justify-center gap-2 text-[12.5px] text-ink-2">
            {["Hook", "Product", "Detail", "CTA"].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="w-4 text-muted-2">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
