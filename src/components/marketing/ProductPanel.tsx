type Tint = "rose" | "sage" | "peach" | "sky";

const tintClass: Record<Tint, string> = {
  rose: "bg-tint-rose",
  sage: "bg-tint-sage",
  peach: "bg-tint-peach",
  sky: "bg-tint-sky",
};

function WindowChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[10px] border border-white/70 bg-surface shadow-[0_10px_28px_rgba(23,23,23,0.12)]">
      <div className="flex items-center gap-1 border-b border-line px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
        <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
        <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
      </div>
      <div className="p-2.5">{children}</div>
    </div>
  );
}

function RecordPreview() {
  return (
    <WindowChrome>
      <div className="flex gap-2">
        <div className="h-[58px] flex-1 rounded-md bg-sidebar" />
        <div className="flex w-10 flex-col items-center gap-1.5">
          <div className="aspect-square w-full rounded-md bg-night/80" />
          <div className="h-1.5 w-full rounded bg-line" />
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-olive/80" />
    </WindowChrome>
  );
}

function CutPreview() {
  return (
    <WindowChrome>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="col-span-2 h-[52px] rounded-md bg-sidebar" />
        <div className="flex flex-col gap-1.5">
          <div className="h-6 rounded bg-olive/25" />
          <div className="h-6 rounded bg-line" />
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3.5 flex-1 rounded-sm bg-line-2" />
        ))}
      </div>
    </WindowChrome>
  );
}

function LibraryPreview() {
  return (
    <WindowChrome>
      <div className="space-y-1.5">
        <div className="h-2.5 w-1/3 rounded bg-ink/80" />
        <div className="h-1.5 w-2/3 rounded bg-line" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="h-8 rounded bg-sidebar" />
          <div className="h-8 rounded bg-sidebar" />
        </div>
      </div>
    </WindowChrome>
  );
}

function KnowledgePreview() {
  return (
    <WindowChrome>
      <div className="flex gap-2">
        <div className="w-8 space-y-1 pt-0.5">
          <div className="h-1.5 rounded bg-line" />
          <div className="h-1.5 w-3/4 rounded bg-line" />
          <div className="h-1.5 w-2/3 rounded bg-line" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-8 rounded-md bg-night" />
          <div className="h-1.5 rounded bg-line" />
          <div className="h-1.5 w-5/6 rounded bg-line" />
        </div>
      </div>
    </WindowChrome>
  );
}

const products = [
  {
    title: "Record",
    description: "Capture a walkthrough in minutes",
    tint: "rose" as Tint,
    Preview: RecordPreview,
  },
  {
    title: "Cut",
    description: "AI turns raw takes into a shippable video",
    tint: "sage" as Tint,
    Preview: CutPreview,
  },
  {
    title: "Library",
    description: "Everything your team has created, in one place",
    tint: "peach" as Tint,
    Preview: LibraryPreview,
  },
  {
    title: "Knowledge",
    description: "Publish on-brand help people can actually find",
    tint: "sky" as Tint,
    Preview: KnowledgePreview,
  },
];

const features = [
  { title: "Brand kit", description: "Voices, logos, and colors that stay consistent" },
  { title: "Skills", description: "Reusable workflows for video and docs" },
  { title: "Ask AI", description: "Steer the editor with a single prompt" },
  { title: "Screen capture", description: "From a raw recording to a polished cut" },
];

export function ProductPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="rounded-[22px] border border-line bg-surface p-4 shadow-[0_18px_50px_rgba(23,23,23,0.08)] md:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {products.map(({ title, description, tint, Preview }) => (
            <a
              key={title}
              href={`#${title.toLowerCase()}`}
              onClick={onNavigate}
              className="lift-hover group rounded-[var(--radius-card)] border border-line bg-surface p-2 pb-3"
            >
              <div
                className={`relative mb-3 h-[118px] overflow-hidden rounded-[12px] ${tintClass[tint]}`}
              >
                <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(120%_80%_at_10%_0%,rgba(255,255,255,0.55),transparent_50%),radial-gradient(80%_80%_at_90%_110%,rgba(0,0,0,0.08),transparent_45%)]" />
                <div className="absolute inset-x-5 bottom-3 top-5">
                  <Preview />
                </div>
              </div>
              <h3 className="px-1.5 text-[14px] font-medium leading-[1.3] text-ink-2">{title}</h3>
              <p className="px-1.5 text-[13.5px] leading-[1.45] text-muted">{description}</p>
            </a>
          ))}
        </div>

        <aside className="flex flex-col justify-center gap-7 py-2 lg:pr-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Features
          </p>
          <ul className="flex flex-col gap-7">
            {features.map((item) => (
              <li key={item.title}>
                <a
                  href={`#${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={onNavigate}
                  className="lift-hover block"
                >
                  <p className="text-[14px] font-medium leading-[1.3] text-ink-2">{item.title}</p>
                  <p className="mt-1 text-[13.5px] leading-[1.45] text-muted">{item.description}</p>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
