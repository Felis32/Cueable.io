const wash: Record<string, string> = {
  rose: "bg-tint-rose",
  sage: "bg-tint-sage",
  peach: "bg-tint-peach",
  sky: "bg-tint-sky",
};

export function Thumb({ tint, label, ratio = "16/9" }: { tint: string; label: string; ratio?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[12px] ${wash[tint] ?? wash.peach}`} style={{ aspectRatio: ratio }}>
      <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_20%_10%,rgba(255,255,255,0.55),transparent_50%)]" />
      <div className="absolute inset-x-[18%] bottom-[22%] top-[28%] rounded-[10px] border border-white/70 bg-white/50" />
      <div className="absolute bottom-3 left-3 rounded-full bg-night/80 px-2 py-0.5 text-[11px] text-surface">{label}</div>
    </div>
  );
}
