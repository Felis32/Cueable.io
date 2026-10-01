import { PublicFrame } from "@/components/marketing/PublicFrame";
import { TemplateBrowser } from "@/components/marketing/TemplateBrowser";
import { AppI18nProvider } from "@/lib/app-i18n";

export default function TemplatesPage() {
  return (
    <PublicFrame>
      <h1 className="font-serif text-[40px] leading-[1.12] text-ink-2 md:text-[52px]">Templates</h1>
      <p className="mt-4 max-w-[460px] text-[15px] leading-[1.5] text-muted">
        Starting points for a product ad. Swap the brief; keep the structure.
      </p>
      <AppI18nProvider>
        <TemplateBrowser />
      </AppI18nProvider>
    </PublicFrame>
  );
}
