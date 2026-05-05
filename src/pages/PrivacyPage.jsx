// privacy policy.
//
// IMPORTANT: this is a starting template tuned for an on-ramp aggregator
// that does NOT process payments or custody crypto. it must be reviewed by
// legal counsel before going live in any jurisdiction. fields wrapped in
// {{...}} are deliberate placeholders that need real values.

import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Info } from '@phosphor-icons/react'
import { FadeIn } from '../components/Motion'
import Footer from '../components/Footer'

const LAST_UPDATED = '2026-05-03'
const CONTACT_EMAIL = 'slowbeardigger@proton.me'
const SITE_URL = 'https://slowbeardigger.dev/ramp'

export default function PrivacyPage() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'en').slice(0, 2)
  const showLangNotice = lang !== 'en'

  return (
    <>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-12" lang="en">
        <FadeIn>
          <header className="mb-10">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-secondary mt-2">Last updated: {LAST_UPDATED}</p>
            {showLangNotice && (
              <div
                role="note"
                lang={lang}
                className="mt-6 flex items-start gap-2 text-xs text-on-surface bg-warning/5 border border-warning/30 rounded-lg p-3"
              >
                <Info size={14} weight="bold" className="shrink-0 mt-0.5 text-warning" aria-hidden="true" />
                <span>{t('legal.noticeNotInLanguage')}</span>
              </div>
            )}
          </header>

          <div className="space-y-8 text-on-surface/90 leading-relaxed text-[15px]">

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">1. Who we are</h2>
              <p>
                {`{{COMPANY_NAME}}`} ("we", "us", "our") operates the on-ramp aggregator
                accessible at <span className="font-mono text-sm">{SITE_URL}</span> (the
                "Service"). The Service lets you compare and use third-party cryptocurrency
                on-ramp providers (Transak, Mt Pelerin, Topper) without creating an account
                with us. This Privacy Policy explains what limited data we handle when you
                use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">2. What we collect</h2>
              <p className="mb-2">
                We are designed for data minimisation. The Service does not require an
                account, and we never ask for your name, email, phone number, government
                identification, or payment-card details.
              </p>
              <p className="mb-2"><strong>Data we collect on the server:</strong></p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>
                  <strong>Transaction records</strong>: the wallet address you provide as the
                  destination, the fiat and crypto currency codes, the amounts, the network,
                  the order status, and timestamps. These are received from the provider's
                  signed webhook (Transak, Topper) or relayed from your browser as a
                  best-effort event marked unverified (Mt Pelerin).
                </li>
                <li>
                  <strong>Anonymous identifiers</strong>: an internal partner-order UUID we
                  generate per session to correlate webhooks back to the originating session.
                  We use the destination wallet address as the customer identifier — wallet
                  addresses are pseudonymous public-key data.
                </li>
                <li>
                  <strong>Server logs</strong>: standard request metadata (timestamp, status
                  code, IP address as seen by the rate limiter). Logs are retained for a
                  short rolling window for abuse detection.
                </li>
              </ul>
              <p className="mt-3 mb-2"><strong>Data stored only in your browser:</strong></p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>
                  Your most recently used wallet address (in <span className="font-mono text-sm">localStorage</span>),
                  so the History view can fetch your transactions without asking you to retype it.
                </li>
                <li>Your theme preference (light/dark).</li>
              </ul>
              <p className="mt-3"><strong>What we do not collect:</strong> emails, names, phone numbers,
                postal addresses, government identification, payment card or bank account details, or
                biometric data. These never reach our servers — they are collected directly by the
                provider you choose, under their own privacy policies (see § 4).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">3. How we use the data we hold</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>To display your own transaction history when you return to the Service.</li>
                <li>To produce aggregated, anonymous analytics (total volume per provider, daily and monthly trends) for service operations.</li>
                <li>To detect abuse and enforce rate limits.</li>
                <li>To comply with legal obligations if validly compelled.</li>
              </ul>
              <p className="mt-3">
                We do not sell, rent, or trade your data. We do not use it for advertising
                or profiling. We do not run third-party analytics scripts on the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">4. Third-party providers</h2>
              <p className="mb-3">
                When you select a provider in the comparison step, you are redirected into
                that provider's hosted widget. The provider — not us — collects every piece
                of personal data needed to perform identity verification (KYC) and process
                your payment. That data is governed by the provider's own privacy policy:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>
                  <strong>Transak</strong> — see their privacy policy at <a className="text-primary underline hover:opacity-80" href="https://transak.com/privacy-policy" target="_blank" rel="noopener noreferrer">transak.com/privacy-policy</a>.
                </li>
                <li>
                  <strong>Mt Pelerin</strong> — see their privacy policy at <a className="text-primary underline hover:opacity-80" href="https://www.mtpelerin.com/privacy-policy" target="_blank" rel="noopener noreferrer">mtpelerin.com/privacy-policy</a>.
                </li>
                <li>
                  <strong>Topper</strong> — see their privacy policy at <a className="text-primary underline hover:opacity-80" href="https://www.uphold.com/en/legal/topper/privacy-notice" target="_blank" rel="noopener noreferrer">uphold.com (Topper)</a>.
                </li>
              </ul>
              <p className="mt-3">
                We receive only the limited transaction-record fields described in § 2 from
                these providers via webhook. We never receive identity documents, selfies,
                payment-card numbers, or any other KYC data they collect from you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">5. How long we keep data</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li><strong>Transaction records:</strong> retained for {`{{RETENTION_PERIOD}}`} from the date of the order, then deleted or aggregated beyond linkage.</li>
                <li><strong>Server logs:</strong> rotating window of 14 days unless tied to an active abuse investigation.</li>
                <li><strong>Browser localStorage:</strong> persists until you clear your browser storage or revisit on a new device.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">6. Your rights</h2>
              <p className="mb-2">
                If your jurisdiction grants you data-protection rights (including the EU/EEA
                GDPR, the UK GDPR, and similar frameworks), you may have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Access the data we hold about you.</li>
                <li>Request rectification of inaccurate data.</li>
                <li>Request erasure of data we hold (subject to lawful retention obligations).</li>
                <li>Object to or restrict certain processing.</li>
                <li>Receive your data in a portable machine-readable format.</li>
                <li>Lodge a complaint with your supervisory authority.</li>
              </ul>
              <p className="mt-3">
                Because we do not collect direct identifiers, the only practical way to identify
                "your" data is through the destination wallet addresses you have used. To
                exercise any right, contact us at <a className="text-primary underline hover:opacity-80" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from
                an address you control and provide the wallet addresses involved. Rights
                related to KYC documents and payment data must be exercised directly with the
                provider that collected them (see § 4).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">7. Cookies and local storage</h2>
              <p>
                The Service does not set cookies and does not use third-party analytics or
                advertising trackers. We do use browser <span className="font-mono text-sm">localStorage</span> for
                the limited preferences described in § 2. You can clear it from your browser
                settings at any time without breaking the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">8. Security</h2>
              <p>
                We serve the Service over HTTPS, enforce a strict Content Security Policy,
                rate-limit public endpoints, and verify all webhook payloads cryptographically
                (HS256 JWT for Transak, ES256 detached JWS for Topper). Admin access is
                protected by scrypt-hashed passwords and short-lived session tokens. No system
                is invulnerable; we will notify affected users of any incident as required by
                applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">9. Children</h2>
              <p>
                The Service is not directed to children under 18 (or under the age of legal
                majority in your jurisdiction). We do not knowingly process data of minors.
                If you believe a minor has used the Service, please contact us so we can
                remove related records.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">10. Changes to this policy</h2>
              <p>
                We may update this Privacy Policy when our practices change. The "Last
                updated" date above will reflect the most recent revision. Material changes
                will be highlighted on the Service for a reasonable period before they take
                effect.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">11. Contact</h2>
              <p>
                Questions about this Privacy Policy or how we handle data:
              </p>
              <p className="mt-2 font-mono text-sm">
                {CONTACT_EMAIL}
              </p>
              <p className="mt-3 text-sm text-secondary">
                See also our <Link to="/terms" className="text-primary underline hover:opacity-80">Terms of Service</Link>.
              </p>
            </section>

          </div>
        </FadeIn>
      </main>
      <Footer />
    </>
  )
}
