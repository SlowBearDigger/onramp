import { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, CircleNotch, Warning, ArrowsClockwise } from '@phosphor-icons/react'
import { useAdminAuth } from '../../hooks/useAdminAuth'
import StatCard from '../../components/admin/StatCard'
import BarChart, { PROVIDER_COLORS } from '../../components/admin/BarChart'
import DateRangePicker from '../../components/admin/DateRangePicker'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const PROVIDER_LABELS = { transak: 'Transak', mtpelerin: 'Mt Pelerin', topper: 'Topper' }

function defaultRange() {
  const now = Date.now()
  return { from: now - 30 * 24 * 60 * 60 * 1000, to: now }
}

function formatUsd(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0.00'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCount(n) {
  if (typeof n !== 'number') return '0'
  return n.toLocaleString('en-US')
}

export default function DashboardPage() {
  const { authFetch, session } = useAdminAuth()
  const [range, setRange] = useState(defaultRange)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ from: String(range.from), to: String(range.to) })
      const r = await authFetch(`/api/admin/stats?${qs.toString()}`)
      if (!r.ok) {
        setError(`Stats request failed (HTTP ${r.status})`)
        setStats(null)
        return
      }
      const body = await r.json()
      setStats(body)
    } catch (err) {
      setError(`Network error: ${err?.message || 'unknown'}`)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [authFetch, range.from, range.to])

  useEffect(() => { refresh() }, [refresh])

  const handleExport = async () => {
    if (!session) return
    setExporting(true)
    try {
      const qs = new URLSearchParams({ from: String(range.from), to: String(range.to) })
      const r = await fetch(`${API_BASE}/api/admin/export.csv?${qs.toString()}`, {
        headers: { authorization: `Bearer ${session.token}` },
      })
      if (!r.ok) {
        setError(`Export failed (HTTP ${r.status})`)
        return
      }
      const blob = await r.blob()
      // server sets content-disposition with the right filename, but browsers
      // ignore it on programmatic anchor clicks — derive a fallback name.
      const fromIso = new Date(range.from).toISOString().slice(0, 10)
      const toIso = new Date(range.to).toISOString().slice(0, 10)
      const filename = extractFilename(r.headers.get('content-disposition')) || `onramp-${fromIso}_to_${toIso}.csv`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`Network error: ${err?.message || 'unknown'}`)
    } finally {
      setExporting(false)
    }
  }

  // shape the daily aggregation for the BarChart component.
  const dailyChart = useMemo(() => {
    if (!stats?.daily) return []
    return stats.daily.map((d) => ({
      bucket: d.day,
      segments: Object.entries(d.byProvider).map(([providerId, slot]) => ({
        providerId,
        // include both verified and unverified volumes — the chart shows total
        // settled volume; the cards below split them out.
        value: (slot.volume || 0) + (slot.unverifiedVolume || 0),
      })),
    }))
  }, [stats])

  const monthlyChart = useMemo(() => {
    if (!stats?.monthly) return []
    return stats.monthly.map((m) => ({
      bucket: m.month,
      segments: Object.entries(m.byProvider).map(([providerId, slot]) => ({
        providerId,
        value: (slot.volume || 0) + (slot.unverifiedVolume || 0),
      })),
    }))
  }, [stats])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-xs text-secondary mt-0.5">Real-time aggregations from webhook + frontend events</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            onClick={refresh}
            disabled={loading}
            aria-busy={loading ? 'true' : undefined}
            aria-label="Refresh stats"
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-surface-container-low dark:bg-surface-container-high/40 hover:bg-surface-container-high dark:hover:bg-surface-container-high transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ArrowsClockwise size={12} weight="bold" className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !stats}
            aria-busy={exporting ? 'true' : undefined}
            aria-label="Export stats as CSV"
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {exporting
              ? <CircleNotch size={12} weight="bold" className="animate-spin" aria-hidden="true" />
              : <Download size={12} weight="bold" aria-hidden="true" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* live region for async errors so screen-reader users hear them */}
      <div role="alert" aria-live="polite">
        {error && (
          <div className="flex items-start gap-2 text-xs text-error bg-error/5 border border-error/20 rounded-lg p-3">
            <Warning size={14} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {loading && !stats && (
        <div className="flex items-center justify-center py-20 text-secondary" role="status" aria-live="polite">
          <CircleNotch size={20} weight="bold" className="animate-spin mr-2" aria-hidden="true" />
          Loading…
        </div>
      )}

      {stats && (
        <>
          <section aria-labelledby="totals-heading">
            <h2 id="totals-heading" className="sr-only">Totals</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total volume"
                value={formatUsd(stats.summary.totals.volume)}
                subValue={`${formatCount(stats.summary.totals.count)} transactions`}
              />
              <StatCard
                label="Verified volume"
                value={formatUsd(stats.summary.totals.verifiedVolume)}
                subValue="Webhook-confirmed"
                accent="var(--color-success)"
              />
              <StatCard
                label="Unverified volume"
                value={formatUsd(stats.summary.totals.unverifiedVolume)}
                subValue="Mt Pelerin frontend events"
                accent="var(--color-warning)"
              />
              <StatCard
                label="Unique wallets / month"
                value={formatCount(latestUniqueWallets(stats.uniqueWallets))}
                subValue="Anonymous (by wallet address)"
              />
            </div>
          </section>

          <section aria-labelledby="byprovider-heading">
            <h2 id="byprovider-heading" className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">By provider</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
              {Object.entries(stats.summary.byProvider).map(([id, slot]) => (
                <ProviderBreakdown
                  key={id}
                  providerId={id}
                  providerLabel={PROVIDER_LABELS[id] || id}
                  slot={slot}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="trends-heading">
            <h2 id="trends-heading" className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">Trends</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <BarChart
                title="Daily volume"
                data={dailyChart}
                valueFormat={(n) => formatUsd(n)}
              />
              <BarChart
                title="Monthly volume"
                data={monthlyChart}
                valueFormat={(n) => formatUsd(n)}
              />
            </div>
          </section>

          <p className="text-[11px] text-secondary/70 leading-relaxed text-center">
            Volume sums fiat amounts of orders in status COMPLETED, PROCESSING, or
            PAYMENT_SUBMITTED_UNVERIFIED (Mt Pelerin best-effort frontend events).
            Failed, cancelled, expired, and refunded orders are excluded.
          </p>

          <AuditLogPanel />
        </>
      )}
    </div>
  )
}

// recent admin activity. logins, logouts, and CSV exports — anything that
// touches privileged endpoints. read-only; the only way data lands here is
// via the backend's logAuditEvent calls. helps answer "who did what when".
function AuditLogPanel() {
  const { authFetch } = useAdminAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await authFetch('/api/admin/audit?limit=25')
      if (!r.ok) {
        setError(`HTTP ${r.status}`)
        return
      }
      const body = await r.json()
      setEvents(body.events || [])
    } catch (err) {
      setError(err?.message || 'unknown')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { refresh() }, [refresh])

  return (
    <section aria-labelledby="audit-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="audit-heading" className="text-sm font-bold uppercase tracking-widest text-secondary">Recent admin activity</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-bold text-secondary hover:text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <ArrowsClockwise size={12} weight="bold" className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-xl overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-error">Failed to load audit log: {error}</div>
        )}
        {!error && !loading && events.length === 0 && (
          <div className="p-4 text-sm text-secondary text-center">No recent activity.</div>
        )}
        {!error && events.length > 0 && (
          <ul className="divide-y divide-outline-variant/10 dark:divide-white/5">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-xs flex items-baseline gap-3">
                <span className="font-mono text-secondary shrink-0 w-32 sm:w-40">{formatAuditTs(e.ts)}</span>
                <AuditActionBadge action={e.action} />
                <span className="text-on-surface truncate">{e.username || '—'}</span>
                <span className="font-mono text-secondary text-[10px] truncate ml-auto">{e.ip || ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function AuditActionBadge({ action }) {
  const styles = {
    'login.success': 'bg-success/10 text-success',
    'login.failure': 'bg-error/10 text-error',
    'logout':        'bg-secondary/10 text-secondary',
    'logout.idle':   'bg-tertiary/10 text-tertiary',
    'csv.export':    'bg-primary/10 text-primary',
  }
  const cls = styles[action] || 'bg-secondary/10 text-secondary'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide font-mono shrink-0 ${cls}`}>
      {action}
    </span>
  )
}

function formatAuditTs(ts) {
  if (!Number.isFinite(ts)) return ''
  const d = new Date(ts)
  // shorter than full ISO; locale-stable: YYYY-MM-DD HH:mm:ss
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ProviderBreakdown({ providerId, providerLabel, slot }) {
  const total = (slot.volume || 0) + (slot.unverifiedVolume || 0)
  const totalCount = (slot.count || 0) + (slot.unverifiedCount || 0)
  const color = PROVIDER_COLORS[providerId] || '#9ca3af'
  return (
    <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <span className="text-sm font-bold">{providerLabel}</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Volume</span>
          <span className="font-bold font-mono">{formatUsd(total)}</span>
        </div>
        <div className="flex justify-between text-xs text-secondary">
          <span>Transactions</span>
          <span className="font-mono">{formatCount(totalCount)}</span>
        </div>
        {slot.unverifiedCount > 0 && (
          <div className="flex justify-between text-xs text-warning border-t border-outline-variant/15 dark:border-white/5 pt-2 mt-2">
            <span>Unverified</span>
            <span className="font-mono">
              {formatUsd(slot.unverifiedVolume)} · {formatCount(slot.unverifiedCount)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function latestUniqueWallets(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0
  return arr[arr.length - 1].uniqueWallets || 0
}

function extractFilename(disposition) {
  if (!disposition) return null
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return m ? m[1] : null
}
