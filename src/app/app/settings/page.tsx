export default function SettingsPage() {
  return (
    <div className="max-w-[520px]">
      <h1 className="font-serif text-[32px] text-ink-2">Settings</h1>
      <p className="mt-2 text-[14px] text-muted">Workspace preferences. Nothing here is saved yet.</p>
      <label className="mt-8 block text-[13px] font-medium text-ink-2">
        Workspace name
        <input defaultValue="Primecut studio" className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line px-3 text-[14px] outline-none" />
      </label>
      <label className="mt-4 block text-[13px] font-medium text-ink-2">
        Brand color
        <input defaultValue="#171717" className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line px-3 text-[14px] outline-none" />
      </label>
    </div>
  );
}