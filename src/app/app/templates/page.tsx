"use client";

import { useTranslation } from "react-i18next";
import { TemplateBrowser } from "@/components/marketing/TemplateBrowser";

export default function AppTemplatesPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="font-serif text-[32px] text-ink-2">{t("Templates")}</h1>
      <TemplateBrowser />
    </div>
  );
}
