export default function BrandPage() {
  return (
    <div>
      <h1 className="font-serif text-[32px] text-ink-2">Brand kit</h1>
      <p className="mt-2 max-w-[460px] text-[14px] leading-[1.45] text-muted">Logo, colors, and a line you want on the end card. Nothing here is saved yet.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {["Logo", "Colors", "End card"].map((label) => (
          <div key={label} className="flex h-36 items-center justify-center rounded-[16px] border border-dashed border-line text-[14px] text-muted">
            + {label}
          </div>
        ))}
      </div>
    </div>
  );
}
