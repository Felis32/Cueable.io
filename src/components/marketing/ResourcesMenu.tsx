const resources = [
  "Playbooks",
  "Trust center",
  "Product releases",
  "Templates",
  "Industry",
  "Free tools",
  "FAQs",
  "Announcements",
  "Partner program",
];

const usecases = [
  "Change management",
  "Sales enablement",
  "Pre-sales",
  "Product marketing",
  "Customer success",
  "Training",
];

export function ResourcesMenu({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_18px_50px_rgba(23,23,23,0.08)]">
      <div className="border-r border-line px-6 py-5">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-2">
          Resources
        </p>
        <ul className="flex flex-col gap-3.5">
          {resources.map((item) => (
            <li key={item}>
              <a
                href="#resources"
                onClick={onNavigate}
                className="lift-hover block text-[14px] font-medium text-ink-2"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-6 py-5">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-2">
          Usecases
        </p>
        <ul className="flex flex-col gap-3.5">
          {usecases.map((item) => (
            <li key={item}>
              <a
                href="#usecases"
                onClick={onNavigate}
                className="lift-hover block text-[14px] font-medium text-ink-2"
              >
                {item}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#usecases"
              onClick={onNavigate}
              className="lift-hover block text-[14px] font-medium text-muted"
            >
              See more
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
