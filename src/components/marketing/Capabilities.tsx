function FaceMini() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#c9b8b0]">
      <div className="absolute inset-x-[18%] top-[22%] h-[38%] rounded-full bg-[#e8d5cc]" />
      <div className="absolute inset-x-[8%] bottom-0 h-[42%] rounded-t-[40%] bg-[#d7c4bc]" />
    </div>
  );
}

function VideoArt() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#c9d9b4,#ecc9be_55%,#d8c1c2)]">
      <div className="absolute inset-4 overflow-hidden rounded-[12px] bg-surface/80">
        <div className="h-8 border-b border-line bg-sidebar/80 px-3 text-[10px] leading-8 text-muted">
          File · Edit · View
        </div>
        <div className="grid grid-cols-5 gap-px bg-line p-px">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-6 bg-surface" />
          ))}
        </div>
      </div>
      <div className="absolute left-6 top-8 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink shadow-[0_8px_20px_rgba(23,23,23,0.08)]">
        Recording screen
        <span className="text-muted">02:36</span>
        <span className="h-2 w-2 rounded-full bg-[#d14b4b]" />
      </div>
      <div className="absolute bottom-6 right-6 h-20 w-[72px] overflow-hidden rounded-[10px] border-2 border-surface shadow-[0_8px_18px_rgba(23,23,23,0.18)]">
        <FaceMini />
      </div>
    </div>
  );
}

function DocsArt() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-[linear-gradient(140deg,#c2dffd,#c9d9b4)]">
      <div className="absolute inset-x-6 top-8 bottom-0 rounded-t-[14px] border border-line bg-surface px-6 pt-4 shadow-[0_16px_40px_rgba(23,23,23,0.08)]">
        <p className="text-[11px] text-muted">Documents · Navigating the workspace</p>
        <p className="mt-3 text-[18px] font-medium text-ink-2">Navigating the Cueable workspace</p>
        <p className="mt-2 text-[12px] text-muted">Role · Enablement · 12 min</p>
        <p className="mt-4 text-[13px] font-medium text-ink-2">Introduction</p>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          Welcome to the team. This is the single source of walkthroughs your
          customers will actually finish.
        </p>
      </div>
    </div>
  );
}

function CutArt() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#ecc9be,#d8c1c2)]">
      <div className="absolute left-5 top-6 w-[150px] rounded-[14px] border border-line bg-surface p-3 shadow-[0_12px_30px_rgba(23,23,23,0.08)]">
        <p className="text-[11px] text-muted">Select</p>
        <ul className="mt-2 space-y-2 text-[12px] text-ink-2">
          {["English", "Spanish", "French", "German", "Japanese"].map((lang) => (
            <li key={lang} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-line-2" />
              {lang}
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute right-6 top-10 max-w-[180px] text-right">
        <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/80 text-ink">
          ✦
        </div>
        <p className="text-[16px] font-medium leading-[1.3] text-ink-2">
          One take, every language
        </p>
      </div>
    </div>
  );
}

function KnowledgeArt() {
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#c9d9b4,#ecc9be)]">
      <div className="absolute inset-4 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_16px_40px_rgba(23,23,23,0.08)]">
        <div className="flex h-full">
          <div className="w-[92px] border-r border-line bg-sidebar p-3 text-[10px] text-muted">
            <p className="font-medium text-ink">Library</p>
            <p className="mt-2">Quick start</p>
            <p className="mt-1">Notes</p>
            <p className="mt-1">Config</p>
          </div>
          <div className="flex-1 p-4">
            <div className="mb-3 h-7 rounded-[var(--radius-pill)] border border-line px-3 text-[11px] leading-7 text-muted">
              Search knowledge base
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-2">
              Quick start
            </p>
            <p className="mt-2 text-[14px] font-medium text-ink-2">Your first ship, faster than you think</p>
            <p className="mt-1 text-[12px] leading-[1.45] text-muted">
              Go from a raw recording to a live guide without a timeline.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const cards = [
  {
    title: "Video",
    description: "Studio-quality videos from any screen recording",
    swatch: "bg-tint-sage",
    Art: VideoArt,
  },
  {
    title: "Documentation",
    description: "Auto-generate manuals, SOPs, and docs instantly",
    swatch: "bg-[#d8d3e8]",
    Art: DocsArt,
  },
  {
    title: "Localization",
    description: "Videos and docs in 65+ languages, automatically",
    swatch: "bg-tint-rose",
    Art: CutArt,
  },
  {
    title: "Knowledge base",
    description: "A searchable knowledge base for humans and agents",
    swatch: "bg-tint-sky",
    Art: KnowledgeArt,
  },
];

export function Capabilities() {
  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-24 pt-16">
      <h2 className="mb-14 text-center font-serif text-[36px] leading-[1.15] text-ink-2 md:text-[48px]">
        What Cueable can
        <br />
        do for you
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {cards.map((card, i) => {
          const right = i % 2 === 1;
          const bottom = i < 2;
          return (
            <article
              key={card.title}
              className={`px-2 py-8 md:px-8 ${right ? "md:border-l md:border-dashed md:border-line" : ""} ${
                bottom ? "md:border-b-0" : ""
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`h-7 w-7 rounded-[6px] ${card.swatch}`} />
                    <h3 className="text-[16px] font-medium text-ink-2">{card.title}</h3>
                  </div>
                  <p className="max-w-[280px] text-[14px] leading-[1.45] text-muted">
                    {card.description}
                  </p>
                </div>
                <span aria-hidden className="mt-1 text-[18px] text-muted-2">
                  →
                </span>
              </div>
              <div className="h-[240px] md:h-[280px]">
                <card.Art />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
