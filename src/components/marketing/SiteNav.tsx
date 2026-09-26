"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/marketing/LogoMark";
import { primaryNav } from "@/data/navigation";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const productLinks = [
  { href: "/#product", title: "Prompt to ad", detail: "Describe the spot. Primecut cuts it." },
  { href: "/#product", title: "URL to ad", detail: "Start from a product page." },
  { href: "/#product", title: "Assets to ad", detail: "Use the stills and logo you already have." },
];

const solutionLinks = [
  { href: "/#solutions", title: "Startups", detail: "A launch film without a shoot." },
  { href: "/#solutions", title: "Commerce", detail: "A product page, turned into an ad." },
  { href: "/#solutions", title: "Agencies", detail: "More variations, same brand." },
];

export function SiteNav() {
  const [open, setOpen] = useState<"product" | "solutions" | "mobile" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(rootRef, open !== null, () => setOpen(null));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-paper/40 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
      />
      <div ref={rootRef} className="pointer-events-auto relative mx-auto w-full max-w-[1120px] px-4 pt-4 md:px-6">
        <nav className="flex h-[52px] items-center justify-between rounded-[var(--radius-pill)] border border-white/50 bg-white/55 px-2.5 pl-4 shadow-[0_8px_30px_rgba(23,23,23,0.05)] backdrop-blur-2xl backdrop-saturate-150">
          <div className="flex items-center gap-5">
            <Link href="/" aria-label="Primecut home" onClick={() => setOpen(null)}>
              <LogoMark />
            </Link>
            <div className="hidden items-center lg:flex">
              <MenuButton label="Product" expanded={open === "product"} onClick={() => setOpen(open === "product" ? null : "product")} />
              <MenuButton label="Solutions" expanded={open === "solutions"} onClick={() => setOpen(open === "solutions" ? null : "solutions")} />
              {primaryNav.slice(2).map((item) => (
                <Link key={item.href} href={item.href} className="rounded-[var(--radius-pill)] px-2.5 py-2 text-[13.5px] font-medium text-ink hover:bg-white/70">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden px-3 py-2 text-[13.5px] font-medium text-ink sm:inline">
              Log in
            </Link>
            <Link href="/signup" className="inline-flex rounded-[var(--radius-pill)] bg-ink px-4 py-[9px] text-[14px] font-medium leading-none text-surface hover:bg-ink-2">
              Get started
            </Link>
            <button type="button" className="mr-1 flex h-9 w-9 items-center justify-center rounded-full border border-line/80 lg:hidden" aria-label="Open menu" onClick={() => setOpen(open === "mobile" ? null : "mobile")}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </nav>

        {open === "product" ? <Flyout items={productLinks} onClose={() => setOpen(null)} /> : null}
        {open === "solutions" ? <Flyout items={solutionLinks} onClose={() => setOpen(null)} /> : null}
        {open === "mobile" ? (
          <div className="mt-2 rounded-[var(--radius-panel)] border border-line bg-surface p-3 shadow-[0_16px_40px_rgba(23,23,23,0.08)] lg:hidden">
            {primaryNav.map((item) => (
              <Link key={item.label} href={item.href} className="block rounded-[var(--radius-control)] px-3 py-2 text-[14px] font-medium" onClick={() => setOpen(null)}>
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="block rounded-[var(--radius-control)] px-3 py-2 text-[14px] font-medium" onClick={() => setOpen(null)}>
              Log in
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuButton({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded} className="inline-flex cursor-pointer items-center rounded-[var(--radius-pill)] px-2.5 py-2 text-[13.5px] font-medium text-ink hover:bg-white/70">
      {label}
      <svg width="12" height="12" viewBox="0 0 12 12" className={`ml-0.5 opacity-60 ${expanded ? "rotate-180" : ""}`} fill="none" aria-hidden>
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Flyout({ items, onClose }: { items: { href: string; title: string; detail: string }[]; onClose: () => void }) {
  return (
    <div className="absolute left-6 top-[72px] w-[min(420px,calc(100%-48px))] rounded-[18px] border border-line bg-surface p-2 shadow-[0_18px_50px_rgba(23,23,23,0.08)]">
      {items.map((item) => (
        <Link key={item.title} href={item.href} onClick={onClose} className="lift-hover block rounded-[12px] px-3 py-3 hover:bg-sidebar">
          <p className="text-[14px] font-medium text-ink-2">{item.title}</p>
          <p className="mt-0.5 text-[13px] text-muted">{item.detail}</p>
        </Link>
      ))}
    </div>
  );
}
