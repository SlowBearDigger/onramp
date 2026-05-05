import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QuickPurchaseWidget from '../components/QuickPurchaseWidget'
import ReactiveBlobs from '../components/ReactiveBlobs'
import Footer from '../components/Footer'
import { CRYPTOS } from '../config/cryptos'
import { NoSignupDemo, InstantDemo, BestRatesDemo } from '../components/FeatureDemos'
import { usePwaDisplayMode } from '../hooks/usePwaDisplayMode'

// session flag: once we've auto-redirected an installed PWA user from /
// to /swap, don't do it again on the same session — they may have used
// the brand link to come back, and forcing them out would be hostile.
const PWA_REDIRECT_FLAG = 'offramp:pwa:landing-redirected'
import {
  FadeIn,
  BlurIn,
  Stagger,
  StaggerItem,
  HoverCard,
  MagneticButton,
} from '../components/Motion'

function Hero({ onCryptoChange, cryptoColor }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const chips = [
    { key: 'nonCustodial' },
    { key: 'noSignup' },
    { key: 'instantDelivery' },
  ]
  return (
    <section className="relative min-h-screen lg:min-h-[870px] flex items-center bg-surface dark:bg-surface px-4 sm:px-6 overflow-hidden pt-28 pb-12 lg:py-0 transition-colors duration-300">
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center relative z-10">
        <div className="text-left">
          <FadeIn delay={0.1}>
            <div className="inline-flex items-center px-3 py-1 rounded-lg bg-surface-container-lowest border border-primary/30 text-primary text-xs sm:text-sm font-bold mb-6">
              <span className="relative flex h-2 w-2 mr-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              {t('landing.trustBadge')}
            </div>
          </FadeIn>

          <BlurIn delay={0.2}>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-on-surface tracking-tighter leading-[1.1] mb-6 sm:mb-8 font-[family-name:var(--font-family-display)]">
              {t('landing.titlePart1')}<span className="text-primary">{t('landing.titlePart2')}</span>
            </h1>
          </BlurIn>

          <FadeIn delay={0.35}>
            <p className="text-base sm:text-xl text-secondary max-w-lg mb-8 sm:mb-10 leading-relaxed">
              {t('landing.subtitle')}
            </p>
          </FadeIn>

          <FadeIn delay={0.45}>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <MagneticButton onClick={() => navigate('/swap')} className="bg-primary text-on-primary px-8 py-4 rounded-xl font-bold font-[family-name:var(--font-family-display)] text-base sm:text-lg transition-colors hover:bg-primary/90 w-full sm:w-auto">
                {t('landing.buyNow')}
              </MagneticButton>
              {/* secondary CTA scrolls to features for new visitors. "View
                  History" was the previous label but new users have no
                  history — sending them there leads to an empty state. */}
              <MagneticButton
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="border border-outline-variant text-on-surface px-8 py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-surface-container-high w-full sm:w-auto transition-colors"
              >
                {t('landing.howItWorks')}
              </MagneticButton>
            </div>
          </FadeIn>

          <FadeIn delay={0.55}>
            <div className="mt-8 sm:mt-12 flex items-center gap-5 sm:gap-8">
              {chips.map((chip) => (
                <div key={chip.key} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {/* on-surface (not text-secondary) so contrast holds even when
                      a translucent crypto-color blob sits behind the hero. */}
                  <span className="text-xs sm:text-xs font-semibold tracking-wide text-on-surface/85">{t(`landing.chips.${chip.key}`)}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        <QuickPurchaseWidget onCryptoChange={onCryptoChange} />
      </div>

      <ReactiveBlobs color={cryptoColor} />
    </section>
  )
}

function Features() {
  const { t } = useTranslation()
  const items = [
    { key: 'noSignup', demo: <NoSignupDemo />, offset: false },
    { key: 'bestRates', demo: <BestRatesDemo />, offset: true },
    { key: 'instant', demo: <InstantDemo />, offset: false },
  ]

  return (
    <section id="features" className="max-w-7xl mx-auto py-16 sm:py-24 px-4 sm:px-6">
      <FadeIn className="text-center mb-12 sm:mb-20">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 font-[family-name:var(--font-family-display)]">{t('landing.features.heading')}</h2>
        <p className="text-secondary max-w-2xl mx-auto text-sm sm:text-base">
          {t('landing.features.subheading')}
        </p>
      </FadeIn>

      <Stagger stagger={0.15} className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        {items.map((item) => (
          <StaggerItem key={item.key} className={item.offset ? 'md:mt-12' : ''}>
            <HoverCard className="bg-surface-container-low dark:bg-surface-container-lowest p-8 sm:p-10 rounded-xl transition-colors duration-300 focus-within:ring-2 focus-within:ring-primary/20 h-full dark:border dark:border-white/5 relative overflow-hidden">
              {item.demo}
              <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">{t(`landing.features.${item.key}.title`)}</h3>
              <p className="text-secondary leading-relaxed text-sm sm:text-base">{t(`landing.features.${item.key}.desc`)}</p>
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}


export default function LandingPage() {
  const [activeCrypto, setActiveCrypto] = useState(CRYPTOS[0])
  const navigate = useNavigate()
  const { isStandalone } = usePwaDisplayMode()

  // when launched from the home-screen icon (installed PWA), skip the
  // marketing landing on first visit of the session and go straight to
  // the swap interface. once redirected, sessionStorage prevents the
  // bounce on return-to-landing, so the brand link still works.
  useEffect(() => {
    if (!isStandalone) return
    let already = false
    try { already = sessionStorage.getItem(PWA_REDIRECT_FLAG) === '1' } catch { /* private mode */ }
    if (already) return
    try { sessionStorage.setItem(PWA_REDIRECT_FLAG, '1') } catch { /* private mode */ }
    navigate('/swap', { replace: true })
  }, [isStandalone, navigate])

  return (
    <>
      <Hero onCryptoChange={setActiveCrypto} cryptoColor={activeCrypto.color} />
      <Features />
      <Footer />
    </>
  )
}
