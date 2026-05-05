import { useState, useCallback, useEffect, useRef } from 'react'
import { getProvider } from '../providers/index.js'
import { rememberWallet } from './useOrders'

// stable UUIDv4. prefer crypto.randomUUID() (safari 15.4+, all modern browsers
// in HTTPS/localhost context). fallback uses crypto.getRandomValues() — never
// Math.random() — so the correlator is unpredictable even when used as an
// idempotency key in future flows.
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  }
  throw new Error('generateUUID: no secure random source available')
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// generic provider widget orchestration.
//
// flow:
//   1. caller invokes startOrder({ providerId, ... }) → we resolve the
//      provider from the registry, generate a partnerOrderId, await its
//      bootstrap (sync for transak/mtpelerin, async fetch for topper),
//      then build the widget URL.
//   2. ProviderModal opens, iframe loads the widget.
//   3. provider posts messages back via window.postMessage.
//   4. we validate event.origin against the picked provider's allowlist
//      then dispatch via provider.parseEvent into canonical events.
//   5. on success/fail we invoke caller callbacks; for mtpelerin we also
//      forward the event to /api/providers/mtpelerin/event for analytics.
//
// security note: providers with hasWebhook=true treat the postMessage
// 'success' event as a UI hint only — the backend webhook is the source
// of truth (read by useOrders).
export function useProvider({ onSuccess, onFailure, onClose } = {}) {
  const [providerId, setProviderId] = useState(null)
  const [state, setState] = useState('idle') // idle | bootstrapping | widget-open | created | success | success-unverified | failed | cancelled
  const [orderData, setOrderData] = useState(null)
  const [widgetUrl, setWidgetUrl] = useState(null)
  const [partnerOrderId, setPartnerOrderId] = useState(null)
  const [error, setError] = useState(null)

  const callbacksRef = useRef({ onSuccess, onFailure, onClose })
  useEffect(() => {
    callbacksRef.current = { onSuccess, onFailure, onClose }
  }, [onSuccess, onFailure, onClose])

  const startOrder = useCallback(async ({ providerId: pid, crypto, fiatAmount, cryptoAmount, walletAddress, fiatCurrency = 'USD', mode = 'buy', email }) => {
    let provider
    try {
      provider = getProvider(pid)
    } catch (err) {
      setError(err)
      setState('failed')
      return null
    }

    const orderId = generateUUID()
    const dark = document.documentElement.classList.contains('dark')

    const params = {
      mode,
      cryptoCurrency: crypto.transakCode || crypto.symbol,
      cryptoNetwork: crypto.network,
      fiatCurrency,
      fiatAmount,
      cryptoAmount,
      walletAddress,
      partnerOrderId: orderId,
      partnerCustomerId: walletAddress,
      email,
      theme: dark ? 'dark' : 'light',
      themeColor: typeof crypto.color === 'string' ? crypto.color.replace('#', '') : undefined,
    }

    setProviderId(pid)
    setPartnerOrderId(orderId)
    setOrderData(null)
    setError(null)
    setState('bootstrapping')

    try {
      const bootstrap = await provider.getBootstrap(params)
      const url = provider.buildWidgetUrl(params, bootstrap)
      rememberWallet(walletAddress)
      setWidgetUrl(url)
      setState('widget-open')
      return orderId
    } catch (err) {
      console.error(`[${pid}] startOrder failed:`, err?.message)
      setError(err)
      setState('failed')
      return null
    }
  }, [])

  const handleMessage = useCallback((event) => {
    if (!providerId) return
    let provider
    try { provider = getProvider(providerId) } catch { return }

    // origin guard — only accept messages from this provider's allowlist.
    const origins = provider.getOrigins()
    if (!origins.includes(event.origin)) return

    let parsed
    try {
      parsed = provider.parseEvent(event)
    } catch (err) {
      console.warn(`[${providerId}] parseEvent threw:`, err?.message)
      return
    }
    if (!parsed || parsed.type === 'unknown') return

    switch (parsed.type) {
      case 'open':
      case 'created':
        setOrderData((prev) => parsed.orderData || prev)
        if (parsed.type === 'created') setState('created')
        break

      case 'success':
        setOrderData(parsed.orderData || null)
        setState('success')
        callbacksRef.current.onSuccess?.(parsed.orderData, providerId)
        break

      case 'success-unverified':
        setOrderData(parsed.orderData || null)
        setState('success-unverified')
        // best-effort analytics: forward mtpelerin frontend events to the
        // backend so admin dashboard can show them (with unverified badge).
        if (providerId === 'mtpelerin') {
          forwardMtPelerinEvent({
            ...parsed.orderData,
            eventType: parsed.rawEventId || 'paymentSubmitted',
            partnerOrderId,
          }).catch(() => { /* non-fatal */ })
        }
        callbacksRef.current.onSuccess?.(parsed.orderData, providerId)
        break

      case 'failed':
      case 'cancelled':
        setOrderData(parsed.orderData || null)
        setState(parsed.type)
        callbacksRef.current.onFailure?.(parsed.orderData, providerId)
        break

      case 'closed':
        setState((s) => (s === 'widget-open' || s === 'created' ? 'idle' : s))
        setWidgetUrl((u) => (u ? null : u))
        callbacksRef.current.onClose?.()
        break

      default:
        break
    }
  }, [providerId, partnerOrderId])

  const close = useCallback(() => {
    setState('idle')
    setWidgetUrl(null)
    setOrderData(null)
    setPartnerOrderId(null)
    setProviderId(null)
    setError(null)
  }, [])

  const reset = close

  const isOpen = state === 'bootstrapping' ||
                 state === 'widget-open' ||
                 state === 'created' ||
                 state === 'success' ||
                 state === 'success-unverified' ||
                 state === 'failed' ||
                 state === 'cancelled'

  return {
    providerId,
    state,
    orderData,
    widgetUrl,
    partnerOrderId,
    error,
    isOpen,
    startOrder,
    handleMessage,
    close,
    reset,
  }
}

async function forwardMtPelerinEvent(body) {
  await fetch(`${API_BASE}/api/providers/mtpelerin/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => { /* swallow — dashboard analytics, not user-facing */ })
}
