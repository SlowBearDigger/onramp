import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCodeStyling from 'qr-code-styling'
import { DownloadSimple } from '@phosphor-icons/react'

// styled QR for payment links — same qr-code-styling engine as the goxmr
// generator, restyled to the onramp palette: near-black rounded dots on
// white (max scanner contrast) with primary-green extra-rounded corner
// anchors as the brand touch. white quiet zone comes from the wrapper
// padding, not the svg, so downloads stay tight.
//
// this component is the default export of a lazily-imported chunk — the
// ~50KB library only loads when the user actually opens the QR panel.

const QR_SIZE = 240

function makeQr(url) {
  return new QRCodeStyling({
    width: QR_SIZE,
    height: QR_SIZE,
    type: 'svg',
    data: url,
    margin: 0,
    qrOptions: { errorCorrectionLevel: 'M' },
    dotsOptions: { color: '#0a0a0a', type: 'rounded' },
    backgroundOptions: { color: '#ffffff' },
    cornersSquareOptions: { type: 'extra-rounded', color: '#047857' },
    cornersDotOptions: { type: 'dot', color: '#047857' },
  })
}

export default function PayQr({ url, footerText }) {
  const { t } = useTranslation()
  const mountRef = useRef(null)
  const qrRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!mountRef.current) return
    if (!qrRef.current) {
      qrRef.current = makeQr(url)
      qrRef.current.append(mountRef.current)
    } else {
      qrRef.current.update({ data: url })
    }
    setReady(true)
  }, [url])

  const download = (extension) => {
    // filename hints at what the code is without leaking the address.
    qrRef.current?.download({ name: 'onramp-payment', extension })
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* white tile = guaranteed quiet zone for scanners in dark mode too */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-outline-variant/15 dark:border-white/10">
        <div ref={mountRef} className={`w-[240px] h-[240px] transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      {footerText && (
        <p className="text-xs text-secondary text-center max-w-[260px] leading-relaxed">{footerText}</p>
      )}
      <div className="grid grid-cols-2 gap-2 w-full max-w-[260px]">
        <button
          type="button"
          onClick={() => download('png')}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <DownloadSimple size={14} weight="bold" aria-hidden="true" /> PNG
        </button>
        <button
          type="button"
          onClick={() => download('svg')}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface-container-low dark:bg-surface-container-high/40 text-on-surface text-xs font-bold hover:bg-surface-container dark:hover:bg-surface-container-high/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <DownloadSimple size={14} weight="bold" aria-hidden="true" /> SVG
        </button>
      </div>
      <p className="sr-only">{t('pay.qr.aria')}</p>
    </div>
  )
}
