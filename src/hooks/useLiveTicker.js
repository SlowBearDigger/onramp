import { useState, useEffect, useRef } from 'react'

// live price ticker backed by CoinGecko's free public API.
//
// strategy:
//   1. on mount (and on symbol change): fetch /coins/{id}/market_chart?days=1
//      to seed the sparkline with ~24 historical hourly points.
//   2. then poll /simple/price every 60s for the latest spot + 24h change.
//   3. on any failure (network, rate limit, CSP, missing coingeckoId): fall
//      back to a "static" state — show the cached `baseRate` from CRYPTOS
//      with `change=0`, `live=false`, and a frozen sparkline. no random
//      walk, so users can tell at a glance whether the data is real.
//
// returns:
//   { price, change, direction: 'up'|'down', history: number[], live: boolean }
//
// rate-limit awareness: coingecko's free tier is ~30 req/min from a single IP.
// each user mounts at most one ticker at a time and we poll at 60s — that's
// ~1 req/min/user from the seed + 1 req/min ongoing. if we ever exceed the
// limit, the fetches start returning 429; the hook treats that exactly like
// network failure and goes to fallback mode.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const POLL_INTERVAL_MS = 60_000
const SPARKLINE_POINTS = 24

// in-memory cache shared across hook instances. keyed by coingeckoId. lets
// rapid symbol switches pull from cache instead of hitting the API again.
const cache = new Map()

export function useLiveTicker(crypto) {
  const baseRate = crypto?.rate ?? 0
  const symbol = crypto?.symbol ?? ''
  const coingeckoId = crypto?.coingeckoId || null

  const [price, setPrice] = useState(baseRate)
  const [change, setChange] = useState(0)
  const [direction, setDirection] = useState('up')
  const [history, setHistory] = useState(() => Array.from({ length: SPARKLINE_POINTS }, () => baseRate))
  const [live, setLive] = useState(false)

  // ref guards so a slow fetch coming back AFTER a symbol change doesn't
  // overwrite state for the new symbol.
  const activeReq = useRef(0)

  useEffect(() => {
    if (!coingeckoId) {
      // unknown asset — stay in fallback (decorative) mode silently.
      setPrice(baseRate)
      setChange(0)
      setDirection('up')
      setHistory(Array.from({ length: SPARKLINE_POINTS }, () => baseRate))
      setLive(false)
      return
    }

    const reqId = ++activeReq.current
    let cancelled = false

    async function seed() {
      // try cache first.
      const cached = cache.get(coingeckoId)
      if (cached && Date.now() - cached.t < POLL_INTERVAL_MS) {
        if (cancelled || reqId !== activeReq.current) return
        setPrice(cached.price)
        setChange(cached.change)
        setDirection(cached.change >= 0 ? 'up' : 'down')
        setHistory(cached.history)
        setLive(true)
        return
      }

      // pull historical points + spot in parallel.
      const histUrl = `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=usd&days=1`
      const spotUrl = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=usd&include_24hr_change=true`

      const [histRes, spotRes] = await Promise.allSettled([
        fetchJson(histUrl),
        fetchJson(spotUrl),
      ])
      if (cancelled || reqId !== activeReq.current) return

      const histPrices = histRes.status === 'fulfilled'
        ? sampleSparkline(histRes.value?.prices)
        : null
      const spotPrice = spotRes.status === 'fulfilled'
        ? Number(spotRes.value?.[coingeckoId]?.usd)
        : NaN
      const spotChange = spotRes.status === 'fulfilled'
        ? Number(spotRes.value?.[coingeckoId]?.usd_24h_change)
        : NaN

      if (Number.isFinite(spotPrice) && spotPrice > 0) {
        const dir = Number.isFinite(spotChange) && spotChange < 0 ? 'down' : 'up'
        const next = histPrices && histPrices.length
          ? [...histPrices.slice(-(SPARKLINE_POINTS - 1)), spotPrice]
          : Array.from({ length: SPARKLINE_POINTS }, () => spotPrice)
        setPrice(spotPrice)
        setChange(Number.isFinite(spotChange) ? spotChange : 0)
        setDirection(dir)
        setHistory(next)
        setLive(true)
        cache.set(coingeckoId, {
          price: spotPrice,
          change: Number.isFinite(spotChange) ? spotChange : 0,
          history: next,
          t: Date.now(),
        })
      } else {
        // fallback: cached baseRate, no live indicator.
        setPrice(baseRate)
        setChange(0)
        setDirection('up')
        setHistory(Array.from({ length: SPARKLINE_POINTS }, () => baseRate))
        setLive(false)
      }
    }

    seed()

    // ongoing poll. if a poll fails, do NOT immediately drop to fallback —
    // a transient failure would cause flicker. only drop after two
    // consecutive failures.
    let consecutiveFailures = 0
    const interval = setInterval(async () => {
      const spotUrl = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=usd&include_24hr_change=true`
      try {
        const data = await fetchJson(spotUrl)
        if (cancelled || reqId !== activeReq.current) return
        const p = Number(data?.[coingeckoId]?.usd)
        const c = Number(data?.[coingeckoId]?.usd_24h_change)
        if (!Number.isFinite(p) || p <= 0) {
          consecutiveFailures += 1
          if (consecutiveFailures >= 2) setLive(false)
          return
        }
        consecutiveFailures = 0
        setPrice((prev) => {
          setDirection(p > prev ? 'up' : p < prev ? 'down' : (Number.isFinite(c) && c >= 0 ? 'up' : 'down'))
          return p
        })
        if (Number.isFinite(c)) setChange(c)
        setHistory((h) => [...h.slice(-(SPARKLINE_POINTS - 1)), p])
        setLive(true)
        cache.set(coingeckoId, {
          price: p,
          change: Number.isFinite(c) ? c : 0,
          history: [...(cache.get(coingeckoId)?.history || []).slice(-(SPARKLINE_POINTS - 1)), p],
          t: Date.now(),
        })
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures >= 2) setLive(false)
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // baseRate is intentionally excluded — only re-fetch on coin change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coingeckoId, symbol])

  return { price, change, direction, history, live }
}

async function fetchJson(url) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

// downsample coingecko's market_chart prices array to SPARKLINE_POINTS.
// shape from API: { prices: [[ts, price], [ts, price], ...] } (~24 hourly).
function sampleSparkline(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return null
  const values = prices.map((p) => Number(p?.[1])).filter(Number.isFinite)
  if (values.length === 0) return null
  if (values.length <= SPARKLINE_POINTS) return values
  const step = values.length / SPARKLINE_POINTS
  const out = []
  for (let i = 0; i < SPARKLINE_POINTS; i++) out.push(values[Math.floor(i * step)])
  return out
}
