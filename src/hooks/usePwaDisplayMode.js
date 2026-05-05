import { useEffect, useState } from 'react'

// detect whether the app is running as an installed PWA (standalone mode)
// vs a regular browser tab. used by LandingPage to redirect installed
// users straight into /swap so they don't have to scroll past marketing.
//
// detection sources (most reliable first):
//   1. CSS media query `(display-mode: standalone)` — modern browsers,
//      including chrome/edge installed-PWA, samsung internet, firefox.
//   2. window.navigator.standalone — legacy iOS Safari home-screen.
//   3. minimal-ui / fullscreen — less common but PWA-installed flavours.
//
// returns one of: 'browser' | 'standalone' | 'minimal-ui' | 'fullscreen'.
// also exposes a boolean `isStandalone` for the common case.
export function usePwaDisplayMode() {
  const [mode, setMode] = useState(() => readMode())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const queries = [
      ['(display-mode: standalone)', 'standalone'],
      ['(display-mode: minimal-ui)', 'minimal-ui'],
      ['(display-mode: fullscreen)', 'fullscreen'],
    ].map(([q, label]) => [window.matchMedia(q), label])

    const onChange = () => setMode(readMode())
    for (const [mq] of queries) {
      mq.addEventListener?.('change', onChange) ?? mq.addListener?.(onChange)
    }
    return () => {
      for (const [mq] of queries) {
        mq.removeEventListener?.('change', onChange) ?? mq.removeListener?.(onChange)
      }
    }
  }, [])

  return { mode, isStandalone: mode !== 'browser' }
}

function readMode() {
  if (typeof window === 'undefined') return 'browser'
  // ios safari home-screen exposes navigator.standalone (non-standard).
  if (window.navigator && window.navigator.standalone === true) return 'standalone'
  if (!window.matchMedia) return 'browser'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen'
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui'
  return 'browser'
}
