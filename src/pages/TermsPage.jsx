// terms of service.
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

export default function TermsPage() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'en').slice(0, 2)
  const showLangNotice = lang !== 'en'

  return (
    <>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-12" lang="en">
        <FadeIn>
          <header className="mb-10">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Terms of Service</h1>
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
              <h2 className="text-xl font-bold text-on-surface mb-3">1. Acceptance</h2>
              <p>
                These Terms of Service (the "Terms") govern your access to and use of the
                on-ramp aggregator at <span className="font-mono text-sm">{SITE_URL}</span> (the
                "Service") operated by {`{{COMPANY_NAME}}`} ("we", "us"). By using the Service
                you agree to these Terms. If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">2. What the Service is — and is not</h2>
              <p className="mb-2">
                The Service is a software interface that helps you compare and access
                independent cryptocurrency on-ramp providers (currently Transak, Mt Pelerin,
                and Topper).
              </p>
              <p className="mb-2"><strong>The Service is not:</strong></p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>a money transmitter, bank, or payment processor.</li>
                <li>a custodian — we never hold or have access to your cryptocurrency or fiat funds.</li>
                <li>a broker, dealer, or investment adviser.</li>
                <li>a counterparty to your purchase or sale of cryptocurrency.</li>
              </ul>
              <p className="mt-3">
                Each transaction is executed by the provider you select. Funds, identity
                verification, and the contractual relationship surrounding the purchase or
                sale all flow between you and that provider directly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">3. Eligibility</h2>
              <p>
                To use the Service you must be at least 18 years old (or the age of majority
                where you reside) and legally permitted to acquire or dispose of
                cryptocurrency in your jurisdiction. The provider you select will perform its
                own eligibility checks, which may further restrict who can transact.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">4. Provider terms govern each transaction</h2>
              <p className="mb-2">
                When you proceed past the comparison step into a provider's widget, you are
                contracting with that provider, subject to their own terms of service:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>
                  <strong>Transak</strong> — <a className="text-primary underline hover:opacity-80" href="https://transak.com/terms-of-service" target="_blank" rel="noopener noreferrer">transak.com/terms-of-service</a>
                </li>
                <li>
                  <strong>Mt Pelerin</strong> — <a className="text-primary underline hover:opacity-80" href="https://www.mtpelerin.com/terms-and-conditions" target="_blank" rel="noopener noreferrer">mtpelerin.com/terms-and-conditions</a>
                </li>
                <li>
                  <strong>Topper</strong> — <a className="text-primary underline hover:opacity-80" href="https://www.uphold.com/en/legal/topper/terms-of-service" target="_blank" rel="noopener noreferrer">uphold.com (Topper)</a>
                </li>
              </ul>
              <p className="mt-3">
                You are responsible for reading and accepting those terms as they apply to
                you. Quotes, fees, exchange rates, supported assets, supported regions, and
                processing times are determined by the provider, not by us. Any indicative
                figures shown in our comparison are estimates that may differ from the
                provider's final quote at the time of execution.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">5. Wallet addresses and your responsibility</h2>
              <p>
                You alone are responsible for entering a valid destination wallet address
                that you control on the correct blockchain network. <strong>Cryptocurrency
                sent to an incorrect, mistyped, or unsupported address is generally
                irretrievable.</strong> Neither we nor the provider can recover funds in those
                cases. Double-check the address and network before confirming any payment.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">6. Risks you accept</h2>
              <p className="mb-2">By using the Service, you acknowledge:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Cryptocurrency prices are highly volatile and can lose value rapidly.</li>
                <li>The legal status of cryptocurrency varies by jurisdiction and may change.</li>
                <li>Blockchain networks may experience congestion, forks, or downtime that delay or block transactions.</li>
                <li>Smart contracts and digital wallets carry technical risks including exploits, key loss, and phishing.</li>
                <li>Identity verification by providers may decline you or freeze a transaction for compliance reasons over which we have no control.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">7. Not investment advice</h2>
              <p>
                Nothing on the Service is investment, legal, tax, or financial advice. Any
                comparative information, badges, or quotes are informational only. You are
                solely responsible for your decisions; consider consulting a qualified
                professional before transacting.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">8. Fees</h2>
              <p>
                We do not charge you a fee directly. Provider fees, network gas fees, and any
                applicable taxes are charged by the provider or the underlying blockchain
                and disclosed inside the provider's flow before you confirm. We may receive
                referral or partnership compensation from providers when you complete a
                transaction; this does not influence the comparison ranking — quote ordering
                is driven by the data each provider returns.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">9. No warranties</h2>
              <p>
                The Service is provided <strong>"as is"</strong> and <strong>"as available"</strong>.
                We make no warranties — express, implied, statutory, or otherwise — including
                warranties of merchantability, fitness for a particular purpose, accuracy,
                non-infringement, uninterrupted operation, or availability in any specific
                jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">10. Limitation of liability</h2>
              <p>
                To the fullest extent permitted by applicable law, neither we nor our
                officers, employees, or contractors shall be liable for any indirect,
                incidental, special, consequential, exemplary, or punitive damages, or any
                loss of profits, revenue, data, goodwill, or cryptocurrency value, arising
                out of or related to your use of the Service or any third-party provider
                accessed through it. Our aggregate liability for any claim under these Terms
                shall not exceed the greater of (a) the fees you paid us directly in the
                twelve months preceding the claim (typically zero) or (b) the maximum
                permitted by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">11. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold us harmless from any claim, demand,
                loss, liability, or expense (including reasonable legal fees) arising from
                your breach of these Terms, your violation of any law, or your transactions
                with any third-party provider accessed through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">12. Suspension and termination</h2>
              <p>
                We may modify, suspend, or discontinue any part of the Service at any time,
                with or without notice. We may also block access from any IP, region, or
                wallet address that we reasonably believe is abusing the Service or
                violating applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">13. Governing law and disputes</h2>
              <p>
                These Terms are governed by the laws of {`{{JURISDICTION}}`}, without regard
                to its conflict-of-laws rules. Any dispute arising out of or relating to
                these Terms shall be brought exclusively in the courts of
                {' '}{`{{JURISDICTION}}`}, except where mandatory consumer-protection laws of
                your residence grant you a different forum that cannot be waived.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">14. Changes to these Terms</h2>
              <p>
                We may revise these Terms when our service or the regulatory environment
                changes. The "Last updated" date above will reflect the most recent version.
                Continuing to use the Service after a revision means you accept the revised
                Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">15. Contact</h2>
              <p>Questions about these Terms:</p>
              <p className="mt-2 font-mono text-sm">{CONTACT_EMAIL}</p>
              <p className="mt-3 text-sm text-secondary">
                See also our <Link to="/privacy" className="text-primary underline hover:opacity-80">Privacy Policy</Link>.
              </p>
            </section>

          </div>
        </FadeIn>
      </main>
      <Footer />
    </>
  )
}
