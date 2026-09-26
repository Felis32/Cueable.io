"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/app/icons";
import { LogoMark } from "@/components/marketing/LogoMark";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const nav = [
  { label: "Home", href: "/app", icon: "home" },
  { label: "Compose", href: "/app/compose", icon: "spark" },
  { label: "Library", href: "/app/projects", icon: "library" },
  { label: "Templates", href: "/app/templates", icon: "templates" },
  { label: "Brand kit", href: "/app/brand", icon: "brand" },
  { label: "Assets", href: "/app/assets", icon: "assets" },
];

const prompts = [
  "A 15-second ad for a matte black kettle",
  "Turn this product page into a 9:16 story",
  "Three cuts of the same watch, different hooks",
  "List the scenes for a quiet product film",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(accountRef, accountOpen, () => setAccountOpen(false));

  return (
    <div className="min-h-screen bg-paper p-2">
      <div className="flex min-h-[calc(100vh-16px)] gap-2">
        <aside
          className={`${mobile ? "fixed inset-2 z-40 flex" : "hidden"} ${collapsed ? "w-[68px]" : "w-[236px]"} shrink-0 flex-col rounded-[18px] bg-sidebar p-2 lg:flex`}
        >
          <div className={`flex items-center px-1.5 py-2 ${collapsed ? "justify-center" : "justify-between"}`}>
            {collapsed ? null : (
              <Link href="/app" aria-label="Primecut home" className="shrink-0">
                <LogoMark />
              </Link>
            )}
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((value) => !value)}
              className="hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-sidebar-hover lg:flex"
            >
              {collapsed ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M6 2.5v11M9 6.5 11 8 9 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </button>
            {collapsed ? null : (
              <button type="button" className="text-[13px] text-muted lg:hidden" onClick={() => setMobile(false)}>
                Close
              </button>
            )}
          </div>

          <nav className="mt-3 flex flex-col gap-0.5">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={() => setMobile(false)}
                  className={`flex items-center text-[13.5px] font-medium ${
                    collapsed
                      ? `mx-auto h-10 w-10 justify-center rounded-[12px] ${active ? "bg-sidebar-active text-ink" : "text-ink hover:bg-sidebar-hover"}`
                      : `h-11 gap-3 rounded-[12px] px-3 ${active ? "bg-sidebar-active text-ink" : "text-ink hover:bg-sidebar-hover"}`
                  }`}
                >
                  <Icon name={item.icon} />
                  {collapsed ? null : item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto">
            <div className="relative" ref={accountRef}>
              {accountOpen ? (
                <div className="absolute bottom-12 left-0 z-20 w-[220px] rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(23,23,23,0.12)]">
                  <MenuLink href="/resources">Help centre</MenuLink>
                  <MenuLink href="/app/settings">Settings</MenuLink>
                  <MenuLink href="/">Log out</MenuLink>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-[12px] px-2 py-2 text-left hover:bg-sidebar-hover ${collapsed ? "justify-center" : ""}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-medium text-surface">O</span>
                {collapsed ? null : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">Om</span>
                      <span className="block text-[11px] text-muted">Free</span>
                    </span>
                    <span className="text-muted-2">⌃</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        <section className="relative min-w-0 flex-1 overflow-hidden rounded-[18px] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
            <LogoMark />
            <button type="button" className="text-[13.5px] font-medium" onClick={() => setMobile(true)}>
              Menu
            </button>
          </div>
          <div className={`h-[calc(100vh-16px)] overflow-y-auto px-5 py-6 md:px-8 md:py-7 ${pathname === "/app" ? "pb-28" : "pb-20"}`}>{children}</div>
          {pathname === "/app" ? <PromptBar /> : null}
          <Chat chatOpen={chatOpen} onToggle={() => setChatOpen((value) => !value)} />
        </section>
      </div>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-[10px] px-3 py-2 text-[13.5px] text-ink hover:bg-sidebar">
      {children}
    </Link>
  );
}

function PromptBar() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % prompts.length), 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <form
      className="absolute bottom-5 left-1/2 z-20 flex w-[min(560px,calc(100%-40px))] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-surface px-3 py-1.5 shadow-[0_12px_40px_rgba(23,23,23,0.12)]"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/app/compose");
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={prompts[index]}
        className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
      />
      <span className="text-muted">
        <Icon name="mic" />
      </span>
      <button type="submit" aria-label="Send" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-ink text-surface">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M7 11V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}

function Chat({ chatOpen, onToggle }: { chatOpen: boolean; onToggle: () => void }) {
  const [draft, setDraft] = useState("");
  return (
    <>
      {chatOpen ? (
        <div className="absolute bottom-20 right-4 z-20 flex h-[380px] w-[min(320px,calc(100%-32px))] flex-col rounded-[16px] border border-line bg-surface shadow-[0_18px_50px_rgba(23,23,23,0.16)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-medium text-ink">Ada, AI agent</p>
            <button type="button" onClick={onToggle} className="cursor-pointer text-[13px] text-muted">
              Close
            </button>
          </div>
          <div className="flex-1 px-4 py-4 text-[13.5px] leading-[1.45] text-muted">
            Ask about a brief, a ratio, or how a cut should open. This preview stays on your machine.
          </div>
          <form
            className="border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message Ada"
              className="h-10 w-full rounded-[12px] border border-line px-3 text-[13.5px] outline-none"
            />
          </form>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Open Ada"
        onClick={onToggle}
        className="absolute bottom-5 right-4 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-[13px] font-semibold shadow-[0_8px_24px_rgba(23,23,23,0.12)]"
      >
        P
      </button>
    </>
  );
}
