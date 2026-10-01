import Link from "next/link";
import { Thumb } from "@/components/marketing/Thumb";
import { templates } from "@/data/templates";

const steps = [
  { n: "01", title: "Give Cueable the product", body: "A sentence, a URL, or the files you already use in market." },
  { n: "02", title: "Cueable sets the cut", body: "Scenes, pace, type, and the line you want remembered." },
  { n: "03", title: "Take the ad", body: "A finished ratio for the placement you actually buy." },
];

const paths = [
  { title: "URL → video", body: "Cueable reads the page and keeps the product, not the chrome around it." },
  { title: "Prompt → video", body: "Say the length, the light, and what must not appear." },
  { title: "Assets → video", body: "Stills, a logo, an old clip. The cut is built from those, not a stock library." },
];

const uses = [
  { title: "Startups", body: "Ship a launch film the week the product is ready." },
  { title: "Commerce", body: "Turn the product page into the ad that points back to it." },
  { title: "Agencies", body: "More directions for the same client, without another shoot." },
  { title: "Marketing teams", body: "A first cut before the brief gets a second meeting." },
  { title: "Creators", body: "An idea in the morning, a placement-ready file after lunch." },
];

export function HomeSections() {
  return (
    <>
      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <h2 className="font-serif text-[32px] leading-[1.15] text-ink-2 md:text-[40px]">How a cut gets made</h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-[18px] border border-line bg-line md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="bg-surface px-6 py-7">
              <p className="text-[12px] font-medium tracking-[0.14em] text-muted-2">{step.n}</p>
              <h3 className="mt-3 text-[16px] font-medium text-ink-2">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-[1.5] text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-8">
        <div className="grid gap-4 md:grid-cols-3">
          {paths.map((item) => (
            <article key={item.title} className="rounded-[18px] border border-line bg-surface p-6">
              <h3 className="text-[16px] font-medium text-ink-2">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-[1.5] text-muted">{item.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-[14px] text-muted">
          Exports for Reels, Stories, YouTube, TikTok, Meta, and LinkedIn — 9:16, 1:1, and 16:9 from the same brief.
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="font-serif text-[32px] leading-[1.15] text-ink-2 md:text-[40px]">Start from a template</h2>
          <Link href="/templates" className="text-[14px] font-medium text-ink">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {templates.slice(0, 4).map((item) => (
            <Link key={item.id} href="/templates" className="group">
              <Thumb tint={item.tint} label={item.duration} />
              <p className="mt-3 text-[14px] font-medium text-ink-2">{item.title}</p>
              <p className="text-[12.5px] text-muted">{item.category} · {item.ratio}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="solutions" className="mx-auto max-w-[1120px] px-5 pb-24">
        <h2 className="font-serif text-[32px] leading-[1.15] text-ink-2 md:text-[40px]">Who it’s for</h2>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {uses.map((item) => (
            <li key={item.title} className="grid gap-2 py-5 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <h3 className="text-[15px] font-medium text-ink-2">{item.title}</h3>
              <p className="text-[14px] leading-[1.5] text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
