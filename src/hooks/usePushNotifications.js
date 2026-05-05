import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// web push opt-in flow.
//
// state machine:
//   'unsupported'   — browser doesn't support PushManager / Notification
//   'denied'        — user clicked "Block" in the permission prompt
//   'unsubscribed'  — supported + permission granted (or default), but not yet subscribed
//   'subscribed'    — active subscription POSTed to backend
//   'error'         — transient failure (offline, bad VAPID key, etc.)
//
// we DON'T auto-prompt — calling Notification.requestPermission() without
// a clear user gesture is a UX antipattern that browsers increasingly
// punish (chrome's "quiet permission" mode hides the prompt entirely).
// the consumer of this hook renders an opt-in button; clicking it calls
// subscribe(). after that, the registration + permission prompt happens.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function usePushNotifications({ customerId } = {}) {
  const [state, setState] = useState('checking')
  const [error, setError] = useState(null)

  // detect support + initial state.
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (typeof window === 'undefined') return
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied')
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (!cancelled) setState(existing ? 'subscribed' : 'unsubscribed')
      } catch (err) {
        if (!cancelled) {
          setError(err)
          setState('error')
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const subscribe = useCallback(async () => {
    if (!customerId) {
      setError(new Error('No wallet address — make a purchase first to enable notifications.'))
      setState('error')
      return false
    }
    try {
      // 1. permission
      const perm = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'unsubscribed')
        return false
      }

      // 2. fetch VAPID public key from backend
      const r = await fetch(`${API_BASE}/api/push/vapid-public-key`)
      if (!r.ok) throw new Error(`vapid-public-key HTTP ${r.status}`)
      const { publicKey } = await r.json()
      if (!publicKey) throw new Error('vapid-public-key empty')

      // 3. ensure SW is active, subscribe via push manager
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      // 4. POST subscription to backend
      const subJson = sub.toJSON()
      const ack = await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId,
          subscription: {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          },
        }),
      })
      if (!ack.ok) throw new Error(`subscribe HTTP ${ack.status}`)
      setState('subscribed')
      setError(null)
      return true
    } catch (err) {
      setError(err)
      setState('error')
      return false
    }
  }, [customerId])

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(() => { /* swallow — we still want to drop the local sub */ })
        await existing.unsubscribe()
      }
      setState('unsubscribed')
    } catch (err) {
      setError(err)
      setState('error')
    }
  }, [])

  return { state, error, subscribe, unsubscribe }
}
