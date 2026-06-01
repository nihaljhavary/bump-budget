/**
 * bump. — src/components/LegalPage.jsx
 *
 * Public-facing Terms & Privacy page. No auth required.
 * Routes: /terms, /privacy
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TERMS_TEXT, PRIVACY_SUMMARY, TERMS_VERSION, PRIVACY_VERSION } from '../utils/legalText'

const PRIVACY_FULL = `BUMP PRIVACY POLICY — v${PRIVACY_VERSION}
Effective: 2026

1. WHO WE ARE
bump. (operated by Bump Money (Pty) Ltd) is a personal financial planning platform. We are the responsible party for your personal information under the Protection of Personal Information Act 4 of 2013 (POPIA).

Contact: support@bump.money

2. WHAT WE COLLECT
We collect only what is necessary to provide the service:
- Name and email address (for account creation and communication)
- Financial profile data you choose to enter: income, savings goal, debit orders, bank name
- Transaction data you import from bank statements (processed locally and stored on our secure servers)
- Usage analytics (anonymous — page views, feature usage, error logs)
- Technical data: IP address (logged by our hosting provider, Netlify), browser type, device type

We do NOT collect: payment card details (processed by Paystack directly), passwords (we use magic links and Supabase Auth), biometric data, location data, or government ID numbers.

3. HOW WE USE YOUR DATA
- To provide, personalise, and improve the bump. service
- To run AI-powered financial analysis via Anthropic's Claude API (your data is sent to Anthropic's servers in the USA for processing; Anthropic does not use your data to train their models)
- To process subscription payments via Paystack
- To send transactional emails (magic links, receipts) — never marketing without consent
- To comply with legal obligations

4. WHERE YOUR DATA IS STORED
- User accounts and financial data: Supabase (Postgres database, hosted in the EU or USA depending on your region setting)
- File hosting and serverless functions: Netlify (USA)
- AI processing: Anthropic (USA)
- Payment processing: Paystack (South Africa / Ireland)

5. YOUR RIGHTS UNDER POPIA
You have the right to:
- Access your personal information
- Correct inaccurate information
- Request deletion of your data (use Account Centre > Data & Account > Delete Account)
- Object to processing
- Lodge a complaint with the Information Regulator of South Africa (www.justice.gov.za/inforeg)

To exercise these rights, email: support@bump.money

6. DATA RETENTION
We retain your data for as long as your account is active. On account deletion, all personal data is permanently and irreversibly deleted within 30 days.

7. COOKIES
We use strictly necessary cookies only (Supabase Auth session tokens). We do not use advertising, tracking, or third-party analytics cookies. See our Cookie Policy below.

8. COOKIE POLICY
bump. uses the following cookies:
- sb-access-token / sb-refresh-token: Supabase authentication session (essential — cannot be disabled)
- bumpCookieConsent: Records your cookie consent preference (essential)
- bumpSimPlan / bumpScenario_*: Your app preferences stored in localStorage (not cookies; no personal data)

We do not use Google Analytics, Facebook Pixel, or any advertising network cookies.

9. THIRD-PARTY PROCESSORS
- Anthropic (AI analysis): https://www.anthropic.com/privacy
- Supabase (database): https://supabase.com/privacy
- Netlify (hosting): https://www.netlify.com/privacy
- Paystack (payments): https://paystack.com/za/privacy

10. CHANGES TO THIS POLICY
We will notify you of material changes via email and in-app notice. Continued use after changes constitutes acceptance.

11. CONTACT
Bump Money (Pty) Ltd
support@bump.money`

export default function LegalPage({ page }) {
  const isPrivacy = page === 'privacy'

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = isPrivacy ? 'Privacy Policy — bump.' : 'Terms & Conditions — bump.'
  }, [isPrivacy])

  const title   = isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'
  const version = isPrivacy ? PRIVACY_VERSION   : TERMS_VERSION
  const content = isPrivacy ? PRIVACY_FULL      : TERMS_TEXT

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #F8F5F0)', color: 'var(--text, #1A1410)', fontFamily: 'Arial, sans-serif' }}>
      {/* Nav */}
      <div style={{ borderBottom: '1px solid var(--border, #E4DDD6)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--surface, #fff)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--coral, #C0766B)', fontWeight: 700, fontSize: '18px' }}>bump.</Link>
        <span style={{ color: 'var(--muted, #8C7E76)', fontSize: '14px' }}>/</span>
        <span style={{ color: 'var(--muted, #8C7E76)', fontSize: '14px' }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
          <Link to="/terms"   style={{ fontSize: '13px', color: !isPrivacy ? 'var(--coral, #C0766B)' : 'var(--muted, #8C7E76)', textDecoration: 'none', fontWeight: !isPrivacy ? 600 : 400 }}>Terms</Link>
          <Link to="/privacy" style={{ fontSize: '13px', color:  isPrivacy ? 'var(--coral, #C0766B)' : 'var(--muted, #8C7E76)', textDecoration: 'none', fontWeight:  isPrivacy ? 600 : 400 }}>Privacy</Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px 96px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>{title}</h1>
        <p style={{ color: 'var(--muted, #8C7E76)', fontSize: '13px', marginBottom: '40px' }}>Version {version} · Effective 2026</p>
        <pre style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          lineHeight: '1.75',
          color: 'var(--text, #1A1410)',
          background: 'none',
          border: 'none',
          margin: 0,
          padding: 0,
        }}>{content}</pre>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border, #E4DDD6)', padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--muted, #8C7E76)' }}>
        <Link to="/" style={{ color: 'var(--coral, #C0766B)', textDecoration: 'none', marginRight: '16px' }}>← Back to bump.</Link>
        <Link to="/terms"   style={{ color: 'var(--muted, #8C7E76)', textDecoration: 'none', marginRight: '12px' }}>Terms</Link>
        <Link to="/privacy" style={{ color: 'var(--muted, #8C7E76)', textDecoration: 'none' }}>Privacy</Link>
      </div>
    </div>
  )
}
