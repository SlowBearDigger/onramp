// minimal date range picker using native <input type="date">.
// emits { from, to } as ms-since-epoch when both inputs are valid.
//
// presets render as quick chips: 7d / 30d / 90d / YTD.

import { useState, useEffect } from 'react'

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function dayStartMs(iso) {
  return new Date(`${iso}T00:00:00Z`).getTime()
}

function dayEndMs(iso) {
  return new Date(`${iso}T23:59:59.999Z`).getTime()
}

const PRESETS = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: 'ytd', label: 'YTD', days: null }, // computed dynamically
]

export default function DateRangePicker({ value, onChange }) {
  const [fromIso, setFromIso] = useState(isoDay(value.from))
  const [toIso, setToIso] = useState(isoDay(value.to))

  useEffect(() => {
    setFromIso(isoDay(value.from))
    setToIso(isoDay(value.to))
  }, [value.from, value.to])

  const commit = (nextFromIso, nextToIso) => {
    const from = dayStartMs(nextFromIso)
    const to = dayEndMs(nextToIso)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return
    onChange({ from, to })
  }

  const applyPreset = (preset) => {
    const now = Date.now()
    const to = now
    let from
    if (preset.id === 'ytd') {
      const start = new Date()
      start.setUTCMonth(0, 1)
      start.setUTCHours(0, 0, 0, 0)
      from = start.getTime()
    } else {
      from = now - preset.days * 24 * 60 * 60 * 1000
    }
    onChange({ from, to })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={fromIso}
          onChange={(e) => {
            setFromIso(e.target.value)
            if (e.target.value && toIso) commit(e.target.value, toIso)
          }}
          className="bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-outline-variant/15 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs"
          aria-label="From date"
        />
        <span className="text-secondary text-xs">→</span>
        <input
          type="date"
          value={toIso}
          onChange={(e) => {
            setToIso(e.target.value)
            if (fromIso && e.target.value) commit(fromIso, e.target.value)
          }}
          className="bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-outline-variant/15 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs"
          aria-label="To date"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-surface-container-low dark:bg-surface-container-high/40 hover:bg-surface-container-high dark:hover:bg-surface-container-high text-on-surface transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
