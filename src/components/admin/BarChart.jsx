import { useId } from 'react'

// stacked-bar chart for daily/monthly volume by provider.
// data: [{ bucket: 'YYYY-MM-DD', segments: [{ providerId, value, color }] }]
// values must be ≥ 0. zero-volume buckets render as a faint baseline tick
// so the time axis stays continuous.
//
// accessibility: visual bars are decorative (aria-hidden). a parallel
// sr-only data table lets screen-reader users get the same numbers without
// trying to interpret colored bars.

const PROVIDER_COLORS = {
  transak: '#10b981',
  mtpelerin: '#7c3aed',
  topper: '#f59e0b',
}

export default function BarChart({ data, valueFormat = (n) => n.toLocaleString(), title }) {
  const headingId = useId()
  const tableId = useId()

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div
        className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-xl p-6 text-center"
        role="region"
        aria-labelledby={headingId}
      >
        {title && <h3 id={headingId} className="text-sm font-bold mb-3">{title}</h3>}
        <p className="text-sm text-secondary">No transactions in this range yet</p>
      </div>
    )
  }

  const max = Math.max(
    1,
    ...data.map((d) => d.segments.reduce((s, seg) => s + (seg.value || 0), 0))
  )
  const providerIds = Object.keys(PROVIDER_COLORS)

  return (
    <div
      className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-xl p-4 sm:p-5"
      role="region"
      aria-labelledby={headingId}
      aria-describedby={tableId}
    >
      {title && <h3 id={headingId} className="text-sm font-bold mb-3">{title}</h3>}

      {/* visual bars — decorative; screen readers use the table below */}
      <div className="flex items-end gap-1 sm:gap-1.5 h-40 mb-2" aria-hidden="true">
        {data.map((d) => {
          const total = d.segments.reduce((s, seg) => s + (seg.value || 0), 0)
          const heightPct = total === 0 ? 1 : (total / max) * 100
          return (
            <div key={d.bucket} className="flex-1 min-w-0 h-full flex flex-col justify-end group" title={`${d.bucket} — ${valueFormat(total)}`}>
              <div
                className="w-full flex flex-col-reverse rounded-t-md overflow-hidden"
                style={{ height: `${heightPct}%`, minHeight: total === 0 ? '1px' : '4px' }}
              >
                {d.segments.map((seg) => {
                  if (!seg.value) return null
                  const segPct = (seg.value / total) * 100
                  return (
                    <div
                      key={seg.providerId}
                      className="w-full"
                      style={{
                        height: `${segPct}%`,
                        backgroundColor: PROVIDER_COLORS[seg.providerId] || '#9ca3af',
                      }}
                      title={`${seg.providerId}: ${valueFormat(seg.value)}`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-secondary/70 font-medium font-mono" aria-hidden="true">
        <span>{data[0]?.bucket}</span>
        {data.length > 1 && <span>{data[data.length - 1]?.bucket}</span>}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-[11px]" aria-hidden="true">
        {Object.entries(PROVIDER_COLORS).map(([id, color]) => (
          <div key={id} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="capitalize text-secondary">{id}</span>
          </div>
        ))}
      </div>

      {/* parallel data table for screen readers + keyboard users */}
      <table id={tableId} className="sr-only">
        <caption>{title || 'Volume by provider per bucket'}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {providerIds.map((id) => (
              <th key={id} scope="col">{id}</th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => {
            const total = d.segments.reduce((s, seg) => s + (seg.value || 0), 0)
            return (
              <tr key={d.bucket}>
                <th scope="row">{d.bucket}</th>
                {providerIds.map((id) => {
                  const seg = d.segments.find((s) => s.providerId === id)
                  return <td key={id}>{valueFormat(seg?.value || 0)}</td>
                })}
                <td>{valueFormat(total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export { PROVIDER_COLORS }
