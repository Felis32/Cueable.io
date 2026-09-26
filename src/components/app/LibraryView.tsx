"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

export function LibraryView() {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-[1.2] text-ink-2">Your library</h1>
          <p className="mt-1 text-[14px] text-muted">Every ad this workspace has cut</p>
        </div>
        <CreateButton align="right" />
      </header>

      <div className="mt-6 flex justify-end">
        <div className="flex items-center gap-1 text-muted">
          <ToolButton label="Search">
            <path d="M7 3.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6ZM10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </ToolButton>
          <ToolButton label="Filter">
            <path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </ToolButton>
          <ToolButton label="Sort">
            <path d="M5 3.5v9M5 3.5 3.2 5.2M5 3.5 6.8 5.2M11 12.5v-9M11 12.5 9.2 10.8M11 12.5l1.8-1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </ToolButton>
          <div className="ml-1 flex overflow-hidden rounded-[10px] border border-line">
            <ViewButton label="Grid" active={view === "grid"} onClick={() => setView("grid")}>
              <path d="M3.2 3.2h3.6v3.6H3.2V3.2Zm6 0h3.6v3.6H9.2V3.2Zm-6 6h3.6v3.6H3.2V9.2Zm6 0h3.6v3.6H9.2V9.2Z" stroke="currentColor" strokeWidth="1.2" />
            </ViewButton>
            <ViewButton label="List" active={view === "list"} onClick={() => setView("list")}>
              <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </ViewButton>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-line text-muted-2">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <rect x="3" y="5" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 9.2 13.2 11 9 12.8V9.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-5 text-[16px] font-medium text-ink-2">You haven&apos;t cut an ad yet</h2>
        <p className="mt-1 max-w-[360px] text-[14px] leading-[1.45] text-muted">
          Start from a prompt, a product URL, or stills you already have.
        </p>
        <div className="mt-5">
          <CreateButton align="center" />
        </div>
      </div>
    </div>
  );
}

function CreateButton({ align }: { align: "right" | "center" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(rootRef, open, () => setOpen(false));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13.5px] font-medium text-surface"
      >
        + Create new
        <span aria-hidden className="text-[10px] opacity-80">▾</span>
      </button>
      {open ? (
        <div className={`absolute top-11 z-10 w-52 rounded-[14px] border border-line bg-surface p-1.5 text-left shadow-[0_16px_40px_rgba(23,23,23,0.12)] ${align === "center" ? "left-1/2 -translate-x-1/2" : "right-0"}`}>
          <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            Ad from a prompt
          </Link>
          <Link href="/app/create" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            Ad from a URL
          </Link>
          <Link href="/app/assets" className="block rounded-[10px] px-3 py-2 text-[13.5px] hover:bg-sidebar" onClick={() => setOpen(false)}>
            Ad from assets
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] hover:bg-sidebar">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center ${active ? "bg-sidebar text-ink" : "text-muted hover:bg-sidebar"}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
