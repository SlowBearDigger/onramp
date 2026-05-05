import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'

// non-blocking font swap. index.html ships the font <link> tags with
// media="print" so browsers start fetching the CSS immediately (in
// parallel with the JS bundle) but don't render-block. once this
// bundle executes we flip media to "all" so the fonts apply.
//
// the prior approach (`onload="this.media='all'"`) used an inline
// event handler that violates strict `script-src 'self'`. doing the
// swap from a bundled script (this file) is CSP-clean.
//
// noscript fallback in index.html handles the (rare) no-JS case.
{
  const links = document.querySelectorAll('link[data-font-loader]')
  for (const link of links) link.media = 'all'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
