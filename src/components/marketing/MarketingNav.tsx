"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/marketing/LogoMark";
import { ProductPanel } from "@/components/marketing/ProductPanel";
import { ResourcesMenu } from "@/components/marketing/ResourcesMenu";

const links = [
  { label: "Stories", href: "#stories" },
  { label: "Help", href: "#help" },
  { label: "Pricing", href: "#pricing" },
  { label: "Careers", href: "#careers" },
];

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`ml-0.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MarketingNav() {
  const [open, setOpen] = useState<"product" | "resources" | "mobile" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggle(next: "product" | "resources" | "mobile") {
    setOpen((current) => (current === next ? null : next));
  }

  return (
    <>
    <div className="nav-frost" aria-hidden />
    <div ref={rootRef} className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="pointer-events-auto relative mx-auto w-full max-w-[1180px] px-4 pt-4 md:px-6">
        <nav className="relative flex h-[52px] items-center justify-between rounded-[var(--radius-pill)] border border-white/45 bg-white/30 px-2.5 pl-4 shadow-[0_8px_30px_rgba(23,23,23,0.04)] backdrop-blur-[24px] backdrop-saturate-150">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/" aria-label="ShipCut home">
              <LogoMark />
            </Link>
            <div className="hidden items-center lg:flex">
              <button
                type="button"
                onClick={() => toggle("product")}
                className="inline-flex cursor-pointer items-center rounded-[var(--radius-pill)] px-2.5 py-2 text-[13.5px] font-medium text-ink hover:bg-white/50"
                aria-expanded={open === "product"}
              >
                Product
                <Chevron open={open === "product"} />
              </button>
              <button
                type="button"
                onClick={() => toggle("resources")}
                className="inline-flex cursor-pointer items-center rounded-[var(--radius-pill)] px-2.5 py-2 text-[13.5px] font-medium text-ink hover:bg-white/50"
                aria-expanded={open === "resources"}
              >
                Resources
                <Chevron open={open === "resources"} />
              </button>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-[var(--radius-pill)] px-2.5 py-2 text-[13.5px] font-medium text-ink hover:bg-white/50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-[var(--radius-pill)] border border-white/60 bg-white/35 px-4 py-[9px] text-[14px] font-medium leading-none text-ink hover:bg-white/55 sm:inline-flex"
            >
              Book a demo
            </Link>
            <Link
              href="/signup"
              className="inline-flex rounded-[var(--radius-pill)] bg-gold px-4 py-[9px] text-[14px] font-medium leading-none text-ink hover:bg-gold-hover"
            >
              Start free trial
            </Link>
            <button
              type="button"
              className="mr-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line lg:hidden"
              aria-label="Open menu"
              onClick={() => toggle("mobile")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </nav>

        {open === "product" ? (
          <div className="absolute left-1/2 top-[68px] z-50 w-[min(920px,calc(100%-32px))] -translate-x-1/2">
            <ProductPanel onNavigate={() => setOpen(null)} />
          </div>
        ) : null}

        {open === "resources" ? (
          <div className="absolute left-4 top-[68px] z-50 w-[min(520px,calc(100%-32px))] md:left-28">
            <ResourcesMenu onNavigate={() => setOpen(null)} />
          </div>
        ) : null}

        {open === "mobile" ? (
          <div className="mt-2 rounded-[var(--radius-panel)] border border-line bg-surface p-3 shadow-[0_12px_40px_rgba(23,23,23,0.08)] lg:hidden">
            <button
              type="button"
              onClick={() => toggle("product")}
              className="block w-full cursor-pointer rounded-[var(--radius-control)] px-3 py-2 text-left text-[14px] font-medium"
            >
              Product
            </button>
            <button
              type="button"
              onClick={() => toggle("resources")}
              className="block w-full cursor-pointer rounded-[var(--radius-control)] px-3 py-2 text-left text-[14px] font-medium"
            >
              Resources
            </button>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-[var(--radius-control)] px-3 py-2 text-[14px] font-medium"
                onClick={() => setOpen(null)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
    </>
  );
}
