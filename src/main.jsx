import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'

// non-blocking font load. injecting <link rel="stylesheet"> at runtime
// (post-DOMContentLoaded) ensures the fonts don't render-block first
// paint, while the strict CSP `script-src 'self'` stays intact (the
// classic `media="print" onload="..."` trick uses an inline event
// handler that CSP correctly blocks). once a stylesheet href is added
// to <head> dynamically, the browser fetches it asynchronously without
// blocking. fonts themselves use `display=swap` so text renders in a
// fallback first and swaps when the webfont arrives.
//
// noscript fallback in index.html handles the (rare) no-JS case.
function loadFonts() {
  const stylesheets = [
    'https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap',
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap',
  ]
  for (const href of stylesheets) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadFonts, { once: true })
} else {
  loadFonts()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
