const names = [
  { label: "Helios", mark: "H" },
  { label: "Northwind", mark: "N" },
  { label: "Atlas", mark: "A" },
  { label: "Kite", mark: "K" },
  { label: "Lumen", mark: "L" },
  { label: "Forge", mark: "F" },
];

export function TrustedBy() {
  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-4 pt-12">
      <p className="mb-5 text-center text-[13px] text-muted">Trusted by teams that ship</p>
      <ul className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-pill)] border border-line bg-surface sm:grid-cols-3 lg:grid-cols-6">
        {names.map((item) => (
          <li
            key={item.label}
            className="flex h-[72px] items-center justify-center gap-2 border-line px-4 shadow-[1px_1px_0_0_var(--line)]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-[11px] font-semibold text-ink">
              {item.mark}
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
