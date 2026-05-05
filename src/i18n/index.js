import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en/translation.json'
import es from './locales/es/translation.json'
import fr from './locales/fr/translation.json'
import de from './locales/de/translation.json'

// supported languages — translations for non-EN locales were produced as a
// first machine-assisted pass and need a native-speaker review before going
// live, especially for marketing copy in landing/swap. update by editing
// the JSON files in src/i18n/locales/<lang>/translation.json.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
]
export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

const STORAGE_KEY = 'offramp:lang'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGE_CODES,
    nonExplicitSupportedLngs: true,    // 'es-MX' picks 'es', 'de-AT' picks 'de'
    detection: {
      // try the explicit user choice first, then the browser language.
      // localStorage uses our own key (not the default i18nextLng) so we own it.
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: STORAGE_KEY,
    },
    interpolation: {
      escapeValue: false,              // react already escapes
    },
    react: {
      useSuspense: false,              // resources are bundled, init is sync — no suspense needed
    },
  })

// keep <html lang> in sync so screen readers and CSS :lang() selectors
// pick up the active language without manual wiring everywhere.
function syncHtmlLang(lng) {
  const code = (lng || 'en').slice(0, 2)
  document.documentElement.lang = code
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
