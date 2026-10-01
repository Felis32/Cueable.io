"use client";

import { useTranslation } from "react-i18next";

const notes = [
  { title: "Writing a brief Cueable can cut", detail: "Length, what must be seen, and what must not." },
  { title: "When to start from a URL", detail: "Use the product page if the copy there is already true." },
  { title: "Aspect ratios that match the buy", detail: "9:16 for stories, 1:1 for feeds, 16:9 for YouTube." },
  { title: "What the preview is", detail: "The app shows a structured preview until a render API is connected." },
];

export default function AppResourcesPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[860px]">
      <header className="border-b border-line pb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("Help centre")}</p>
        <h1 className="mt-2 font-serif text-[34px] leading-[1.1] text-ink-2">{t("Resources for better cuts")}</h1>
        <p className="mt-3 max-w-[520px] text-[14px] leading-[1.5] text-muted">{t("Practical notes for briefing, reviewing, and shipping video ads from your workspace.")}</p>
      </header>

      <div className="mt-8 divide-y divide-line border-y border-line">
        {notes.map((note, index) => (
          <article key={note.title} className="grid gap-3 py-6 sm:grid-cols-[48px_1fr]">
            <span className="text-[12px] font-medium text-muted-2">0{index + 1}</span>
            <div>
              <h2 className="text-[16px] font-medium text-ink-2">{t(note.title)}</h2>
              <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-muted">{t(note.detail)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
