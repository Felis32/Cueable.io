"use client";

import { useMemo, useState } from "react";
import { Thumb } from "@/components/marketing/Thumb";
import { templateCategories, templates } from "@/data/templates";

export function TemplateBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof templateCategories)[number]>("All");

  const visible = useMemo(() => {
    return templates.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesQuery = item.title.toLowerCase().includes(query.trim().toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search templates"
        className="mt-8 h-11 w-full max-w-sm rounded-[var(--radius-pill)] border border-line bg-surface px-4 text-[14px] outline-none"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {templateCategories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`cursor-pointer rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] font-medium ${category === item ? "bg-ink text-surface" : "border border-line bg-surface text-ink"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {visible.map((item) => (
          <article key={item.id} className="rounded-[16px] border border-line bg-surface p-2 pb-3">
            <Thumb tint={item.tint} label={item.duration} />
            <h2 className="mt-3 px-1 text-[14px] font-medium text-ink-2">{item.title}</h2>
            <p className="px-1 text-[12.5px] text-muted">{item.category} · {item.ratio}</p>
          </article>
        ))}
      </div>
      {visible.length === 0 ? <p className="mt-8 text-[14px] text-muted">Nothing matches that search.</p> : null}
    </>
  );
}
