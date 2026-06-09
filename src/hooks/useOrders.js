import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const LAST_WALLET_KEY = 'onramp:last-wallet'

// remember the most recent wallet the user has used so HistoryView has a
// customerId to query with. called by useProvider.startOrder.
export function rememberWallet(addr) {
  if (typeof addr !== 'string' || addr.length < 6) return
  try { localStorage.setItem(LAST_WALLET_KEY, addr) } catch { /* storage disabled */ }
}

export function readLastWallet() {
  try { return localStorage.getItem(LAST_WALLET_KEY) || null } catch { return null }
}

// canonical "in-flight" raw statuses across all providers — covers transak's
// AWAITING_PAYMENT_FROM_USER / PAYMENT_DONE_MARKED_BY_USER / PROCESSING and
// topper's AWAITING_PAYMENT_FROM_USER / PROCESSING. mtpelerin's
// PAYMENT_SUBMITTED_UNVERIFIED is also in-flight (awaiting webhook upgrade
// — except mtpelerin has no webhook, so it stays unverified forever; we
// still poll while pending in case the user is waiting).
const IN_FLIGHT_STATUSES = new Set([
  'AWAITING_PAYMENT_FROM_USER',
  'PAYMENT_DONE_MARKED_BY_USER',
  'PROCESSING',
  'PAYMENT_SUBMITTED_UNVERIFIED',
  'CREATED_UNVERIFIED',
])

// raw provider status → coarse UI bucket. drives badge color.
function bucketForStatus(rawStatus) {
  const s = (rawStatus || '').toUpperCase()
  if (s === 'COMPLETED') return 'completed'
  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(s)) return 'failed'
  return 'pending'
}

// raw status → fine-grained translation key (matches history.status.detail.*).
// these surface the actual stage of the order in the expanded detail card.
function detailKeyForStatus(rawStatus) {
  const s = (rawStatus || '').toUpperCase()
  switch (s) {
    case 'AWAITING_PAYMENT_FROM_USER':       return 'awaitingPayment'
    case 'PAYMENT_DONE_MARKED_BY_USER':      return 'paymentMarked'
    case 'PROCESSING':                       return 'processing'
    case 'PAYMENT_SUBMITTED_UNVERIFIED':     return 'paymentSubmittedUnverified'
    case 'CREATED_UNVERIFIED':               return 'createdUnverified'
    case 'COMPLETED':                        return 'completed'
    case 'FAILED':                           return 'failed'
    case 'CANCELLED':                        return 'cancelled'
    case 'EXPIRED':                          return 'expired'
    case 'REFUNDED':                         return 'refunded'
    default:                                  return 'unknown'
  }
}

// pretty provider id → display name. falls back to capitalised id.
function providerDisplay(id) {
  switch (id) {
    case 'transak':    return 'Transak'
    case 'mtpelerin':  return 'Mt Pelerin'
    case 'topper':     return 'Topper'
    default:           return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unknown'
  }
}

// normalise a backend row into the shape the UI expects.
//
// the UI was built around MOCK_TRANSACTIONS's schema; we keep that surface
// (id, type, symbol, amountUsd, amountCrypto, status, date, wallet, provider,
// txHash) and add fields the new tracker needs (rawStatus, providerId,
// unverified, network, updatedAt, detailKey).
export function toUiShape(row) {
  const rawStatus = (row.status || '').toUpperCase()

  return {
    id: row.id,
    type: (row.product || 'BUY').toLowerCase(),
    symbol: row.crypto_currency || '',
    amountUsd: Number(row.fiat_amount) || 0,
    amountCrypto: row.crypto_amount != null ? String(row.crypto_amount) : '0',
    status: bucketForStatus(rawStatus),
    rawStatus,
    detailKey: detailKeyForStatus(rawStatus),
    date: new Date(row.updated_at || Date.now()).toISOString(),
    updatedAt: Number(row.updated_at) || Date.now(),
    wallet: row.wallet_address || '',
    provider: providerDisplay(row.provider),
    providerId: row.provider || 'unknown',
    network: row.network || null,
    unverified: row.unverified === 1 || row.unverified === true,
    txHash: row.tx_hash || null,
  }
}

// hook: fetches orders from the backend, with light polling while anything is
// in-flight. falls through to mock data when VITE_USE_MOCK is on. when the
// backend is unreachable we surface the error explicitly (state='error') —
// we do NOT swap to mock data silently because that hides outages from the
// user and from support.
export function useOrders({ customerId } = {}) {
  // if the caller didn't pass one, fall back to the last-used wallet.
  const effectiveCustomerId = customerId || readLastWallet()
  const [orders, setOrders] = useState([])
  const [state, setState] = useState('idle') // idle | loading | ready | error | mock
  const [error, setError] = useState(null)
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const [isPolling, setIsPolling] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  // wallet we already ran the partner-api sync for. the first fetch per
  // wallet goes through /api/profile/orders (backend reconciles against
  // transak's partner api, then returns the merged view); every poll after
  // that stays on the local-only /api/orders so we never burn upstream
  // quota in the 5s loop.
  const syncedForRef = useRef(null)

  const fetchOnce = useCallback(async () => {
    if (USE_MOCK) {
      const { MOCK_TRANSACTIONS } = await import('../data/mockData')
      setOrders(MOCK_TRANSACTIONS)
      setState('mock')
      setLastFetchedAt(Date.now())
      return
    }

    // require a customerId before calling the API — matches the backend
    // contract (no global listing allowed).
    if (!effectiveCustomerId) {
      setOrders([])
      setState('ready')
      return
    }

    // cancel any previous in-flight fetch so we don't race state writes.
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setState((s) => (s === 'ready' ? 'ready' : 'loading'))
    try {
      const wantSync = syncedForRef.current !== effectiveCustomerId
      let r
      if (wantSync) {
        r = await fetch(
          `${API_BASE}/api/profile/orders?walletAddress=${encodeURIComponent(effectiveCustomerId)}`,
          { signal: ac.signal },
        )
        // mark synced even when the upstream reconciliation was partial —
        // the endpoint degrades to the local view by itself. only a hard
        // failure (rate limit, network, old backend without the route)
        // falls through to the plain orders endpoint below.
        if (r.ok) syncedForRef.current = effectiveCustomerId
      }
      if (!wantSync || !r.ok) {
        const qs = `?customerId=${encodeURIComponent(effectiveCustomerId)}`
        r = await fetch(`${API_BASE}/api/orders${qs}`, { signal: ac.signal })
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const body = await r.json()
      const mapped = (body.orders || []).map(toUiShape)
      setOrders(mapped)
      setState('ready')
      setError(null)
      setLastFetchedAt(Date.now())
    } catch (err) {
      if (err?.name === 'AbortError') return
      // surface the real error. we do NOT silently swap to mock data here —
      // that would hide backend outages (or compromise) from the user and
      // from support. mock data only shows when VITE_USE_MOCK is explicitly
      // enabled (handled at the top of this function).
      setOrders([])
      setState('error')
      setError(err)
    }
  }, [effectiveCustomerId])

  useEffect(() => {
    fetchOnce()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchOnce])

  // light poll while anything is in-flight. stops once every order is
  // terminal (completed/failed/refunded). does NOT poll on error state —
  // would hammer a downed backend.
  useEffect(() => {
    if (state !== 'ready') {
      setIsPolling(false)
      return
    }
    const hasInFlight = orders.some((o) => IN_FLIGHT_STATUSES.has(o.rawStatus))
    if (!hasInFlight) {
      setIsPolling(false)
      return
    }
    setIsPolling(true)
    timerRef.current = setTimeout(fetchOnce, 5000)
    return () => clearTimeout(timerRef.current)
  }, [orders, state, fetchOnce])

  return { orders, state, error, lastFetchedAt, isPolling, refresh: fetchOnce }
}
