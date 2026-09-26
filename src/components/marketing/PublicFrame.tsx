import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteNav } from "@/components/marketing/SiteNav";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-[1120px] px-5 pb-24 pt-[120px]">{children}</main>
      <SiteFooter />
    </div>
  );
}
