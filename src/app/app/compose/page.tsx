"use client";

import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const history = ["Watch, three hooks", "Shelf pan, no voice", "App story, first open"];

const starters = [
  { title: "Open on the product", body: "Skip the logo. First frame is the object." },
  { title: "Three different hooks", body: "Same product, three ways into the first two seconds." },
  { title: "Scenes from a URL", body: "Turn a product page into a shot list." },
  { title: "Two placements", body: "Keep the story, recut it for 9:16 and 16:9." },
];

export default function ComposePage() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(historyRef, open, () => setOpen(false));

  return (
    <div className="relative min-h-[calc(100vh-140px)] pt-1">
      <div className="absolute -left-2 top-0 md:-left-4" ref={historyRef}>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] text-muted hover:text-ink">
          <span aria-hidden>↺</span>
          History
          <span className="text-[10px]">▾</span>
        </button>
        {open ? (
          <div className="absolute left-0 top-8 z-10 w-56 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(23,23,23,0.1)]">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className="block w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-[13.5px] hover:bg-sidebar"
                onClick={() => {
                  setBrief(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-[760px] flex-col items-center">
      <h1 className="mt-14 text-center font-serif text-[36px] leading-[1.15] text-ink-2 md:text-[42px]">
        Hey Om,
        <br />
        what are we cutting?
      </h1>
      <p className="mt-3 max-w-[420px] text-center text-[14px] leading-[1.45] text-muted">
        Describe the product, the length, and how the ad should open.
      </p>

      <form
        className="relative mt-8 w-full"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="A 15-second ad. Matte black kettle. Morning light. No voiceover."
          className="h-[148px] w-full resize-none rounded-[18px] border border-line bg-surface px-4 py-4 pr-16 text-[15px] leading-[1.45] outline-none placeholder:text-muted-2"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          <button type="button" aria-label="Voice" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-sidebar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="6" y="2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.2 8a3.8 3.8 0 0 0 7.6 0M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button type="submit" aria-label="Send brief" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-ink text-surface">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 11V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      <div className="mt-10 flex w-full items-center gap-4 text-[12px] text-muted-2">
        <span className="h-px flex-1 bg-line" />
        A few ways in
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-5 grid w-full gap-3 sm:grid-cols-2">
        {starters.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setBrief(item.title + ". " + item.body)}
            className="cursor-pointer rounded-[14px] border border-line px-4 py-3 text-left hover:bg-sidebar"
          >
            <p className="text-[14px] font-medium text-ink-2">{item.title}</p>
            <p className="mt-1 text-[13px] leading-[1.4] text-muted">{item.body}</p>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
