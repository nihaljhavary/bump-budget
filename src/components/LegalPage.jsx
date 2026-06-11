/**
 * bump. — src/components/LegalPage.jsx
 *
 * Public-facing legal pages. No auth required.
 * Routes: /terms  /privacy  /refund  /cancellation
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TERMS_TEXT, PRIVACY_SUMMARY, TERMS_VERSION, PRIVACY_VERSION } from '../utils/legalText'

// ── Full Privacy Policy ───────────────────────────────────────────────────────
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
- To run AI-powered financial analysis via Anthropic's Claude API (your data is sent to Anthropic's servers for processing; Anthropic does not use your data to train their models)
- To process subscription payments via Paystack
- To send transactional emails (magic links, receipts) — never marketing without consent
- To comply with legal obligations

4. WHERE YOUR DATA IS STORED
- User accounts and financial data: Supabase (Postgres database, hosted in the EU or USA)
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

7. COOKIES & LOCAL STORAGE
We use strictly necessary cookies only (Supabase Auth session tokens). We do not use advertising, tracking, or third-party analytics cookies.

bump. uses the following cookies and local storage:
- sb-access-token / sb-refresh-token: Supabase authentication session (essential)
- bumpCookieConsent: Records your cookie consent preference (essential)
- bumpScenario_* / bump_rec_*: Your in-app planning preferences (localStorage; no personal data)

We do not use Google Analytics, Facebook Pixel, or any advertising network cookies.

8. THIRD-PARTY PROCESSORS
- Anthropic (AI analysis): https://www.anthropic.com/privacy
- Supabase (database): https://supabase.com/privacy
- Netlify (hosting): https://www.netlify.com/privacy
- Paystack (payments): https://paystack.com/za/privacy

9. CHANGES TO THIS POLICY
We will notify you of material changes via email and in-app notice. Continued use after changes constitutes acceptance.

10. CONTACT
Bump Money (Pty) Ltd
support@bump.money`

// ── Refund Policy ─────────────────────────────────────────────────────────────
const REFUND_TEXT = `BUMP REFUND POLICY
Effective: 2026

1. FREE TRIAL
New subscribers are offered a 30-day free trial on paid plans (Starter, Growth, Pro). No charge is made during the trial period. Your card is only billed after the trial expires. You may cancel at any time before the trial ends without incurring any charge.

2. SUBSCRIPTION FEES
bump. subscriptions are billed monthly in advance via Paystack. All fees are quoted and charged in South African Rand (ZAR).

Plan pricing:
- Starter: R49/month
- Growth: R99/month
- Pro: R199/month

3. REFUND ELIGIBILITY
As a general principle, subscription fees for a billing cycle already commenced are non-refundable. However, we will consider refund requests on a case-by-case basis in the following circumstances:

a) Billing error: If you were charged an incorrect amount due to a platform or Paystack error, we will issue a full refund of the overcharged amount within 7 business days of the error being confirmed.

b) Duplicate charge: If you were billed twice for the same billing period, we will refund the duplicate charge in full within 7 business days.

c) Service unavailability: If the bump. platform was materially unavailable for more than 72 consecutive hours in a billing month due to our fault (not third-party outages), you may request a pro-rata credit for the affected days.

d) Cooling-off under the Consumer Protection Act: If you subscribed for the first time and request a refund within 5 business days of your first paid charge (not trial), we will process a refund less any direct costs incurred, in accordance with section 16 of the Consumer Protection Act 68 of 2008.

4. HOW TO REQUEST A REFUND
To request a refund, contact us at support@bump.money with:
- Your account email address
- The date and amount of the charge
- The reason for your refund request

We will respond within 2 business days and resolve eligible refund requests within 7 business days of confirmation.

5. REFUND METHOD
Approved refunds are processed back to the original payment method (card) via Paystack. Processing times depend on your card issuer (typically 3–10 business days).

6. DOWNGRADES AND PLAN CHANGES
Downgrading your plan takes effect at the end of your current billing cycle. You retain access to your current plan's features until that date. No partial refunds are issued for unused days when downgrading mid-cycle.

7. ACCOUNT DELETION
Deleting your account cancels your subscription immediately. No refund is issued for the remaining days of the current billing cycle unless a billing error occurred.

8. CHARGEBACKS
If you initiate a chargeback with your bank without first contacting us, we reserve the right to suspend your account pending investigation. We encourage you to contact support@bump.money first — we resolve legitimate billing issues promptly.

9. CONTACT
For any billing or refund queries:
Email: support@bump.money
Response time: within 2 business days`

// ── Cancellation Policy ───────────────────────────────────────────────────────
const CANCELLATION_TEXT = `BUMP CANCELLATION POLICY
Effective: 2026

1. YOUR RIGHT TO CANCEL
You may cancel your bump. subscription at any time. There are no cancellation fees, penalties, or minimum commitment periods.

2. HOW TO CANCEL
You can cancel your subscription directly from within the app:

Step 1: Log in to your bump. account at bumpbudget.co.za
Step 2: Click your profile avatar (top-left on mobile, bottom of sidebar on desktop)
Step 3: Select "My Profile" to open Account Centre
Step 4: Go to the "Subscription" tab
Step 5: Click "Cancel subscription" and confirm

Alternatively, email support@bump.money with your account email and we will process the cancellation within 1 business day.

3. WHEN CANCELLATION TAKES EFFECT
Cancellation takes effect at the end of your current billing cycle. You retain full access to all features of your current plan until that date. You will not be charged again after cancellation is confirmed.

Example: If your billing date is the 15th of each month and you cancel on the 3rd, you retain access until the 14th and are not charged on the 15th.

4. FREE TRIAL CANCELLATION
If you are in your 30-day free trial, you may cancel at any time with no charge. Simply cancel before the trial period ends (you will receive an email reminder 3 days before your trial expires).

5. DOWNGRADING (NOT FULL CANCELLATION)
Instead of cancelling, you may downgrade to a lower plan or to the free tier:
- Go to Account Centre > Subscription
- Select your desired plan
- The downgrade takes effect at the end of your current billing cycle
- You retain access to your current plan's features until then
- The free tier is available to all users indefinitely at no charge

6. REACTIVATION
If you cancel and later wish to resubscribe, you may do so at any time from the Account Centre. A new 30-day free trial is not available on resubscription — you will be charged from the first billing date.

7. YOUR DATA AFTER CANCELLATION
After cancellation, your account and data remain accessible on the free tier (with free-tier feature limits applied). If you wish to permanently delete your account and all associated data, go to Account Centre > Data & Account > Delete Account.

8. SUBSCRIPTION MANAGEMENT BY PAYSTACK
Recurring billing is managed by Paystack. By subscribing, you authorise Paystack to charge your card on a recurring monthly basis. You can revoke this authorisation at any time by cancelling through the steps above.

9. CONTACT
For any cancellation queries:
Email: support@bump.money
Response time: within 1 business day`

// ── Nav links config ─────────────────────────────────────────────────────────
const NAV_LINKS = [
  { path: '/terms',        label: 'Terms' },
  { path: '/privacy',      label: 'Privacy' },
  { path: '/refund',       label: 'Refund policy' },
  { path: '/cancellation', label: 'Cancellation' },
]

export default function LegalPage({ page }) {
  const isPrivacy      = page === 'privacy'
  const isRefund       = page === 'refund'
  const isCancellation = page === 'cancellation'

  const meta = {
    terms:        { title: 'Terms & Conditions',   version: TERMS_VERSION,   content: TERMS_TEXT },
    privacy:      { title: 'Privacy Policy',        version: PRIVACY_VERSION, content: PRIVACY_FULL },
    refund:       { title: 'Refund Policy',         version: '1.0',           content: REFUND_TEXT },
    cancellation: { title: 'Cancellation Policy',   version: '1.0',           content: CANCELLATION_TEXT },
  }[page] || { title: 'Terms & Conditions', version: TERMS_VERSION, content: TERMS_TEXT }

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${meta.title} — bump.`
  }, [page])

  const s = {
    page:    { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' },
    nav:     { borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', flexWrap: 'wrap' },
    logo:    { textDecoration: 'none', color: 'var(--coral)', fontWeight: 800, fontSize: '18px', fontFamily: 'var(--font-display)', letterSpacing: '-0.04em', marginRight: '4px' },
    sep:     { color: 'var(--faint)', fontSize: '14px' },
    crumb:   { color: 'var(--muted)', fontSize: '14px' },
    navLink: (active) => ({ fontSize: '13px', color: active ? 'var(--coral)' : 'var(--muted)', textDecoration: 'none', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }),
    body:    { maxWidth: '720px', margin: '0 auto', padding: '48px 24px 96px' },
    h1:      { fontSize: '28px', fontWeight: 700, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', marginBottom: '4px' },
    sub:     { color: 'var(--muted)', fontSize: '13px', marginBottom: '40px' },
    pre:     { whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: '1.8', color: 'var(--text)', background: 'none', border: 'none', margin: 0, padding: 0 },
    foot:    { borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' },
  }

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <Link to="/" style={s.logo}>bump.</Link>
        <span style={s.sep}>/</span>
        <span style={s.crumb}>{meta.title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {NAV_LINKS.map(({ path, label }) => (
            <Link key={path} to={path} style={s.navLink(page === path.replace('/', ''))}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div style={s.body}>
        <h1 style={s.h1}>{meta.title}</h1>
        <p style={s.sub}>Version {meta.version} · Effective 2026 · Bump Money (Pty) Ltd</p>
        <pre style={s.pre}>{meta.content}</pre>
      </div>

      <div style={s.foot}>
        <Link to="/" style={{ color: 'var(--coral)', textDecoration: 'none' }}>← Back to bump.</Link>
        {NAV_LINKS.map(({ path, label }) => (
          <Link key={path} to={path} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{label}</Link>
        ))}
      </div>
    </div>
  )
}
