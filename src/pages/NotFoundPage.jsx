import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Compass, House } from '@phosphor-icons/react'
import { FadeIn, MagneticButton } from '../components/Motion'

// catch-all 404. lands users with a clear message and one obvious way back.
// rendered inside the public layout (Header is mounted by App.jsx for any
// non-/swap, non-/admin path).
export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 pt-28 pb-12">
      <FadeIn className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6" aria-hidden="true">
          <Compass size={28} weight="bold" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter mb-3 font-[family-name:var(--font-family-display)]">
          {t('notFound.title')}
        </h1>
        <p className="text-base text-secondary leading-relaxed mb-8">
          {t('notFound.subtitle')}
        </p>
        <Link to="/">
          <MagneticButton className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-base hover:opacity-90 transition-opacity">
            <House size={16} weight="bold" aria-hidden="true" />
            {t('notFound.backHome')}
          </MagneticButton>
        </Link>
      </FadeIn>
    </main>
  )
}
