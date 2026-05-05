import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FadeIn, motion } from './Motion'

export default function Footer() {
  const { t } = useTranslation()

  const links = [
    { key: 'privacyPolicy', to: '/privacy' },
    { key: 'termsOfService', to: '/terms' },
  ]

  return (
    <FadeIn>
      <footer className="w-full py-8 sm:py-12 px-4 sm:px-6 mt-12 sm:mt-20 bg-surface-container-low dark:bg-surface-container-low border-t border-outline-variant/15 dark:border-white/5 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-6 max-w-7xl mx-auto">
          <div>
            <div className="text-lg font-bold text-on-surface mb-2 font-[family-name:var(--font-family-display)]">OnRamp</div>
            <p className="text-sm text-secondary">
              {t('footer.tagline', { year: new Date().getFullYear() })}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 sm:gap-8">
            {links.map((link) => (
              <motion.span key={link.to} whileHover={{ y: -1 }} className="inline-block">
                <Link
                  to={link.to}
                  className="text-sm text-secondary hover:text-primary transition-colors"
                >
                  {t(`footer.${link.key}`)}
                </Link>
              </motion.span>
            ))}
          </div>
        </div>
      </footer>
    </FadeIn>
  )
}
