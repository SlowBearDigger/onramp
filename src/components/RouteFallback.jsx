import { CircleNotch } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

// Shared route-loading state for public, admin, and app-surface chunks.
export default function RouteFallback() {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[60vh] flex items-center justify-center text-secondary"
    >
      <CircleNotch size={20} weight="bold" className="animate-spin mr-2" aria-hidden="true" />
      <span>{t('common.loading')}</span>
    </div>
  )
}
