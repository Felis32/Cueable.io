import Link from "next/link";
import { LogoMark } from "@/components/marketing/LogoMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <LogoMark />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-muted">
          <Link href="/templates" className="hover:text-ink">Templates</Link>
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/resources" className="hover:text-ink">Resources</Link>
          <Link href="/login" className="hover:text-ink">Log in</Link>
        </div>
      </div>
    </footer>
  );
}
