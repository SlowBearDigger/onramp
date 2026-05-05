import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// web push opt-in flow.
//
// state machine:
//   'checking'         — initial, before SW + permission status is read
//   'unsupported'      — browser lacks PushManager / Notification
//   'ios-needs-pwa'    — iOS Safari, push works only when installed to
//                        Home Screen (since iOS 16.4). user-action gate.
//   'denied'           — user clicked "Block" in the permission prompt
//   'unsubscribed'     — supported + not subscribed; ready to opt-in
//   'subscribed'       — active subscription POSTed to backend
//   'error'            — transient failure (offline, backend 500, etc.)
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
      // iOS Safari quirks: web push requires the PWA to be installed on
      // the Home Screen (iOS 16.4+). detect the combo of (a) iOS device
      // and (b) NOT in standalone display mode → tell the user the
      // install-to-home-screen step is needed before we even try.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // ipad with desktop UA
      const isStandalone = window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
      if (isIOS && !isStandalone) {
        if (!cancelled) setState('ios-needs-pwa')
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
      setError({ code: 'no_wallet', message: 'Make a purchase first so notifications can be tied to your wallet.' })
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
      if (r.status === 503) {
        const err = new Error('Push notifications are not configured on the server yet.')
        err.code = 'push_disabled'
        throw err
      }
      if (!r.ok) throw new Error(`Could not reach the notifications server (HTTP ${r.status}).`)
      const { publicKey } = await r.json()
      if (!publicKey) throw new Error('Notifications server returned an empty key.')

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
      if (!ack.ok) throw new Error(`Could not register the subscription (HTTP ${ack.status}).`)
      setState('subscribed')
      setError(null)
      return true
    } catch (err) {
      // surface a reasonable user-facing message
      const msg = err?.message || 'Something went wrong enabling notifications.'
      setError({ code: err?.code || 'unknown', message: msg })
      setState('error')
      // eslint-disable-next-line no-console
      console.warn('[push] subscribe failed:', msg)
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
