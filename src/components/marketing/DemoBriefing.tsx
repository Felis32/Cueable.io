"use client";

import { useState } from "react";

type Tab = "raw" | "polished" | "guide";

function Face({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#c9b8b0] ${className}`}>
      <div className="absolute inset-x-[18%] top-[22%] h-[38%] rounded-full bg-[#e8d5cc]" />
      <div className="absolute inset-x-[8%] bottom-0 h-[42%] rounded-t-[40%] bg-[#d7c4bc]" />
      <div className="absolute left-[32%] top-[38%] h-1.5 w-1.5 rounded-full bg-[#3a2a26]" />
      <div className="absolute right-[32%] top-[38%] h-1.5 w-1.5 rounded-full bg-[#3a2a26]" />
    </div>
  );
}

function SheetGrid({ highlight }: { highlight?: boolean }) {
  const rows = [
    ["Channel", "Budget", "Spend", "Conv.", "CPL"],
    ["Search", "5,000", "4,850", "120", "40.4"],
    ["LinkedIn", "4,000", "4,200", "45", "93.3"],
    ["Email", "1,500", "1,200", "300", "4.0"],
    ["SEO", "3,000", "3,000", "85", "35.3"],
    ["Total", "13,500", "13,250", "550", "24.1"],
  ];

  return (
    <div className="h-full overflow-hidden bg-surface text-[11px] text-ink">
      <div className="flex items-center gap-2 border-b border-line bg-sidebar px-3 py-2">
        <span className="h-3.5 w-3.5 rounded-sm bg-olive/70" />
        <span className="text-[12px] font-medium">Q3 pipeline review</span>
        <span className="ml-auto text-[11px] text-muted">Share</span>
      </div>
      <div className="flex border-b border-line px-2 py-1.5 text-[10px] text-muted">
        File · Edit · View · Insert · Format
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((row, r) => (
            <tr key={row[0]}>
              {row.map((cell, c) => (
                <td
                  key={`${r}-${c}`}
                  className={`border border-line px-2 py-1.5 ${
                    r === 0 ? "bg-olive/80 text-[10px] font-medium text-surface" : ""
                  } ${highlight && r === 3 && c === 3 ? "bg-blue-bg" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayMark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface/90 shadow-[0_8px_24px_rgba(23,23,23,0.16)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          <path d="M6 4.5v9l8-4.5-8-4.5Z" />
        </svg>
      </div>
    </div>
  );
}

function RawView() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-demo-chrome p-2.5 pt-9">
      <div className="absolute left-4 top-2.5 text-[12px] font-medium text-surface/90">
        Raw capture
      </div>
      <div className="relative h-full overflow-hidden rounded-[12px] bg-surface">
        <SheetGrid />
        <div className="absolute bottom-5 right-5 h-[128px] w-[110px] overflow-hidden rounded-[14px] border-2 border-surface shadow-[0_10px_24px_rgba(23,23,23,0.2)]">
          <Face className="h-full w-full" />
        </div>
        <PlayMark />
      </div>
    </div>
  );
}

function PolishedView() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-demo-chrome p-2.5 pt-9">
      <div className="absolute left-4 top-2.5 text-[12px] font-medium text-surface/90">
        Polished cut
      </div>
      <div className="relative h-full overflow-hidden rounded-[12px] bg-surface">
        <SheetGrid highlight />
        <div className="absolute bottom-5 right-5 overflow-hidden rounded-[14px] border-2 border-surface shadow-[0_10px_24px_rgba(23,23,23,0.2)]">
          <Face className="h-[132px] w-[118px]" />
        </div>
        <PlayMark />
      </div>
    </div>
  );
}

function GuideView() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px]">
      <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_10%_40%,#ecc9be,transparent_55%),radial-gradient(70%_90%_at_95%_20%,#d8c1c2,transparent_50%),linear-gradient(180deg,#f3e4d8,#e8cfc6)]" />
      <div className="absolute inset-y-0 left-[12%] right-[12%] overflow-hidden bg-surface px-8 py-8 shadow-[0_20px_60px_rgba(23,23,23,0.1)] md:px-12">
        <p className="text-[12px] font-medium text-olive">ShipCut · Walkthrough</p>
        <h2 className="mt-3 text-[26px] font-medium leading-[1.2] text-ink-2 md:text-[30px]">
          Cleaning a pipeline sheet before you ship the cut
        </h2>
        <p className="mt-2 text-[12px] text-muted">Mar 12, 2026 · 3 min read</p>
        <div className="mt-5 rounded-[var(--radius-control)] bg-[#f6efe6] px-4 py-3 text-[13px] leading-[1.5] text-ink-2">
          This walkthrough standardizes decimal places and callouts so the polished
          video and the guide stay in sync.
        </div>
        <p className="mt-5 text-[14px] font-medium text-ink-2">Step 1 · Select the target column</p>
        <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">
          Click the header of the column that holds the numbers you want to normalize.
        </p>
        <div className="mt-4 h-[150px] overflow-hidden rounded-[10px] border border-line">
          <SheetGrid highlight />
        </div>
      </div>
    </div>
  );
}

const tabs: { id: Tab; label: string }[] = [
  { id: "raw", label: "Raw capture" },
  { id: "polished", label: "Polished video" },
  { id: "guide", label: "Guide" },
];

export function DemoBriefing() {
  const [tab, setTab] = useState<Tab>("polished");

  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-8 pt-6 md:pt-8">
      <div className="h-[420px] md:h-[520px]">
        {tab === "raw" ? <RawView /> : null}
        {tab === "polished" ? <PolishedView /> : null}
        {tab === "guide" ? <GuideView /> : null}
      </div>
      <div className="mt-5 flex justify-center">
        <div className="inline-flex items-center rounded-[var(--radius-pill)] border border-line bg-surface p-1">
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`cursor-pointer rounded-[var(--radius-pill)] px-4 py-2 text-[13.5px] font-medium leading-none transition-colors ${
                  active
                    ? "bg-clay text-surface"
                    : "text-ink hover:bg-sidebar-hover"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
