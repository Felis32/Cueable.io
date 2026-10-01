"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { logOutAction } from "@/app/(auth)/actions";
import { Icon } from "@/components/app/icons";
import { AdaChatPanel } from "@/components/app/AdaChatPanel";
import { LogoMark } from "@/components/marketing/LogoMark";
import { createClient } from "@/lib/supabase/client";
import { saveRemoteComposeHistoryEntry } from "@/lib/compose-history";
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

export function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();
  const [accountName, setAccountName] = useState("O");
  const accountRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(accountRef, accountOpen, () => setAccountOpen(false));
  const visibleNav = isAdmin ? [...nav, { label: "Admin", href: "/admin", icon: "admin" }] : nav;

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const sourceName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email?.split("@")[0] ||
        "Om";

      const first = sourceName.trim().split(/\s+/)[0] || "Om";
      setAccountName(first);
    };

    void loadUser();
  }, []);

  useEffect(() => {
    let active = true;
    document.documentElement.dataset.theme = "light";
    void fetch("/api/app/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { userSettings?: { theme?: string } };
        if (active && ["light", "dark"].includes(result.userSettings?.theme ?? "")) {
          document.documentElement.dataset.theme = result.userSettings?.theme;
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-paper p-2">
      <div className="flex min-h-[calc(100vh-16px)] gap-2">
        <aside
          className={`${mobile ? "fixed inset-2 z-40 flex" : "hidden"} ${collapsed ? "w-[68px]" : "w-[236px]"} shrink-0 flex-col rounded-[18px] bg-sidebar p-2 lg:flex`}
        >
          <div className={`flex items-center px-1.5 py-2 ${collapsed ? "justify-center" : "justify-between"}`}>
            {collapsed ? null : (
              <Link href="/app" aria-label="Cueable home" className="shrink-0">
                <LogoMark />
              </Link>
            )}
            <div className="hidden shrink-0 lg:flex">
              <div className="relative">
                <button
                  type="button"
                  aria-label="Toggle sidebar"
                  onClick={() => setCollapsed((value) => !value)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-sidebar-hover"
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
              </div>
            </div>
            {collapsed ? null : (
              <button type="button" className="text-[13px] text-muted lg:hidden" onClick={() => setMobile(false)}>
                {t("Close")}
              </button>
            )}
          </div>

          <nav className="mt-3 flex flex-col gap-0.5">
            {visibleNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={t(item.label)}
                  onClick={() => setMobile(false)}
                  className={`flex items-center text-[13.5px] font-medium ${
                    collapsed
                      ? `mx-auto h-10 w-10 justify-center rounded-[12px] ${active ? "bg-sidebar-active text-ink" : "text-ink hover:bg-sidebar-hover"}`
                      : `h-11 gap-3 rounded-[12px] px-3 ${active ? "bg-sidebar-active text-ink" : "text-ink hover:bg-sidebar-hover"}`
                  }`}
                >
                  <Icon name={item.icon} />
                  {collapsed ? null : t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto">
            <div className="relative" ref={accountRef}>
              {accountOpen ? (
                <div className="absolute bottom-12 left-0 z-20 w-[220px] rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(23,23,23,0.12)]">
                  <MenuLink href="/app/resources">{t("Help centre")}</MenuLink>
                  <MenuLink href="/app/settings">{t("Settings")}</MenuLink>
                  <button
                    type="button"
                    disabled={isSigningOut}
                    onClick={() => {
                      setAccountOpen(false);
                      setLogoutConfirmOpen(true);
                    }}
                    className="block w-full rounded-[10px] px-3 py-2 text-left text-[13.5px] text-ink transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                  >
                    {isSigningOut ? t("Logging out…") : t("Log out")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-[12px] px-2 py-2 text-left hover:bg-sidebar-hover ${collapsed ? "justify-center" : ""}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-medium text-surface">{accountName.charAt(0).toUpperCase()}</span>
                {collapsed ? null : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{accountName}</span>
                      <span className="block text-[11px] text-muted">{t("Free")}</span>
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
              {t("Menu")}
            </button>
          </div>
          <div className={`h-[calc(100vh-16px)] overflow-y-auto px-5 py-6 md:px-8 md:py-7 ${pathname === "/app" ? "pb-28" : "pb-20"}`}>{children}</div>
          {pathname === "/app" ? <PromptBar /> : null}
          <AdaChatPanel open={chatOpen} onToggle={() => setChatOpen((value) => !value)} pageContext={pathname} />
        </section>
      </div>
      {logoutConfirmOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/35 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSigningOut) setLogoutConfirmOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isSigningOut) setLogoutConfirmOpen(false);
          }}
        >
          <section role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description" className="w-full max-w-[400px] rounded-[12px] border border-line bg-surface p-5 shadow-[0_24px_70px_rgba(17,18,20,0.24)]">
            <h2 id="logout-confirm-title" className="text-[17px] font-medium text-ink-2">{t("Are you sure you want to log out?")}</h2>
            <p id="logout-confirm-description" className="mt-2 text-[13px] leading-[1.5] text-muted">{t("You’ll need to sign in again to access your workspace.")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus disabled={isSigningOut} onClick={() => setLogoutConfirmOpen(false)} className="h-9 rounded-[7px] border border-line px-3 text-[12px] font-medium text-ink-2 disabled:opacity-50">
                {t("Cancel")}
              </button>
              <button type="button" disabled={isSigningOut} onClick={() => startSignOut(async () => { await logOutAction(); })} className="h-9 rounded-[7px] bg-red-700 px-3 text-[12px] font-medium text-white disabled:opacity-50">
                {isSigningOut ? t("Logging out…") : t("Log out")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
  const { t } = useTranslation();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % prompts.length), 2800);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem("primecut-compose-draft");
    if (storedValue) setValue(storedValue);

    const updateDraft = (event: Event) => {
      const payload = event as CustomEvent<string>;
      if (typeof payload.detail === "string") setValue(payload.detail);
    };

    window.addEventListener("primecut-compose-update", updateDraft as EventListener);
    return () => window.removeEventListener("primecut-compose-update", updateDraft as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("primecut-compose-draft", value);
  }, [value]);

  return (
    <form
      className="absolute bottom-5 left-1/2 z-20 flex w-[min(560px,calc(100%-40px))] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-surface px-3 py-1.5 shadow-[0_12px_40px_rgba(23,23,23,0.12)]"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;

        if (typeof window !== "undefined") {
          const historyKey = "primecut-compose-history";
          const nextEntry = {
            id: crypto.randomUUID(),
            threadId: crypto.randomUUID(),
            text: trimmed,
            createdAt: new Date().toISOString(),
          };
          void saveRemoteComposeHistoryEntry(nextEntry);

          const current = JSON.parse(window.localStorage.getItem(historyKey) ?? "[]");
          const merged = Array.isArray(current) ? [nextEntry, ...current].slice(0, 20) : [nextEntry];
          window.localStorage.setItem(historyKey, JSON.stringify(merged));
          window.localStorage.setItem("primecut-compose-draft", "");
          window.dispatchEvent(new CustomEvent("primecut-compose-update", { detail: "" }));
        }

        router.push("/app/compose");
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t(prompts[index])}
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

