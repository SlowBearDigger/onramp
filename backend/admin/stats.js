import { db } from '../db.js'

// admin analytics queries.
//
// all aggregations are computed live from the orders table — no caching, no
// mock data. queries are bounded by [from, to] in milliseconds since epoch.
//
// for "completed" volume, we sum fiat_amount across rows where status either
// equals COMPLETED (transak/topper canonical), or matches the unverified
// "PAYMENT_SUBMITTED_UNVERIFIED" status (mtpelerin best-effort). the
// returned shapes always separate verified from unverified totals so the
// dashboard can flag mtpelerin contributions.

const COMPLETED_STATUSES_VERIFIED = new Set(['COMPLETED'])
const COMPLETED_STATUSES_UNVERIFIED = new Set(['PAYMENT_SUBMITTED_UNVERIFIED'])

const PROVIDER_IDS = ['transak', 'mtpelerin', 'topper']

function statusFilterSql() {
  // any "successful or in-flight" terminal-ish status. excludes FAILED /
  // CANCELLED / EXPIRED / REFUNDED so analytics reflect actual settled volume.
  return `(status = 'COMPLETED' OR status = 'PAYMENT_SUBMITTED_UNVERIFIED' OR status = 'PROCESSING')`
}

const summaryStmt = db.prepare(`
  SELECT
    provider,
    unverified,
    COUNT(*) AS count,
    COALESCE(SUM(fiat_amount), 0) AS volume
  FROM orders
  WHERE updated_at >= @from AND updated_at < @to
    AND ${statusFilterSql()}
  GROUP BY provider, unverified
`)

const dailyStmt = db.prepare(`
  SELECT
    strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch') AS day,
    provider,
    unverified,
    COUNT(*) AS count,
    COALESCE(SUM(fiat_amount), 0) AS volume
  FROM orders
  WHERE updated_at >= @from AND updated_at < @to
    AND ${statusFilterSql()}
  GROUP BY day, provider, unverified
  ORDER BY day ASC
`)

const monthlyStmt = db.prepare(`
  SELECT
    strftime('%Y-%m', updated_at / 1000, 'unixepoch') AS month,
    provider,
    unverified,
    COUNT(*) AS count,
    COALESCE(SUM(fiat_amount), 0) AS volume
  FROM orders
  WHERE updated_at >= @from AND updated_at < @to
    AND ${statusFilterSql()}
  GROUP BY month, provider, unverified
  ORDER BY month ASC
`)

const uniqueWalletsMonthlyStmt = db.prepare(`
  SELECT
    strftime('%Y-%m', updated_at / 1000, 'unixepoch') AS month,
    COUNT(DISTINCT customer_id) AS uniqueWallets
  FROM orders
  WHERE updated_at >= @from AND updated_at < @to
    AND customer_id IS NOT NULL
    AND ${statusFilterSql()}
  GROUP BY month
  ORDER BY month ASC
`)

// build the empty per-provider summary skeleton so the response shape is
// stable even when a provider has zero rows in the window.
function emptyProviderSummary() {
  const out = {}
  for (const p of PROVIDER_IDS) {
    out[p] = { count: 0, volume: 0, unverifiedCount: 0, unverifiedVolume: 0 }
  }
  return out
}

export function getSummary({ from, to }) {
  const rows = summaryStmt.all({ from, to })
  const byProvider = emptyProviderSummary()
  let totalCount = 0
  let totalVolume = 0
  let unverifiedVolume = 0

  for (const row of rows) {
    const slot = byProvider[row.provider]
    if (!slot) continue
    if (row.unverified) {
      slot.unverifiedCount += row.count
      slot.unverifiedVolume += row.volume
      unverifiedVolume += row.volume
    } else {
      slot.count += row.count
      slot.volume += row.volume
    }
    totalCount += row.count
    totalVolume += row.volume
  }

  return {
    range: { from, to },
    totals: {
      count: totalCount,
      volume: totalVolume,
      unverifiedVolume,
      verifiedVolume: totalVolume - unverifiedVolume,
    },
    byProvider,
  }
}

// returns [{ day: 'YYYY-MM-DD', byProvider: { transak: {...}, ... } }, ...]
export function getDaily({ from, to }) {
  const rows = dailyStmt.all({ from, to })
  return groupByBucket(rows, 'day')
}

export function getMonthly({ from, to }) {
  const rows = monthlyStmt.all({ from, to })
  return groupByBucket(rows, 'month')
}

export function getUniqueWalletsMonthly({ from, to }) {
  return uniqueWalletsMonthlyStmt.all({ from, to })
}

function groupByBucket(rows, bucketKey) {
  const map = new Map()
  for (const row of rows) {
    const key = row[bucketKey]
    if (!map.has(key)) {
      map.set(key, { [bucketKey]: key, byProvider: emptyProviderSummary() })
    }
    const slot = map.get(key).byProvider[row.provider]
    if (!slot) continue
    if (row.unverified) {
      slot.unverifiedCount += row.count
      slot.unverifiedVolume += row.volume
    } else {
      slot.count += row.count
      slot.volume += row.volume
    }
  }
  return Array.from(map.values())
}

// flatten the daily aggregation into rows suitable for CSV export.
// columns match the PDF spec: Date, Provider, Transaction Count, Total Volume.
// adds a Verified column so consumers can filter mtpelerin best-effort data.
export function getDailyForCsv({ from, to }) {
  const rows = dailyStmt.all({ from, to })
  return rows.map((r) => ({
    date: r.day,
    provider: r.provider,
    transactionCount: r.count,
    totalVolume: Number(r.volume.toFixed(2)),
    verified: r.unverified ? 'no' : 'yes',
  }))
}
