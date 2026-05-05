// metric tile. shows a label, big primary value, and optional sub-value.
// purely presentational — caller passes already-formatted strings.

export default function StatCard({ label, value, subValue, accent }) {
  return (
    <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-xl p-4 sm:p-5 flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-secondary">{label}</span>
      <span
        className="text-2xl sm:text-3xl font-bold text-on-surface font-mono"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      {subValue && (
        <span className="text-xs text-secondary">{subValue}</span>
      )}
    </div>
  )
}
