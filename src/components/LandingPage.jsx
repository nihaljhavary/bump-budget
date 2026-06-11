import { Link } from 'react-router-dom'
import './LandingPage.css'

const FEATURES = [
  {
    icon: 'lightning',
    title: 'Smart Transaction Parsing',
    desc: 'Paste any bank SMS or email and Claude reads it instantly — no manual entry, no category guessing.',
  },
  {
    icon: 'bank',
    title: 'Bank Statement Import',
    desc: 'Upload PDFs or CSVs from Absa, Capitec, FNB, Nedbank, Standard Bank, TymeBank and more. Every transaction auto-categorised.',
  },
  {
    icon: 'chat',
    title: 'AI Budget Q&A',
    desc: 'Ask "How much did I spend on food in March?" or "Can I afford a R3,000 holiday?" and get a straight answer.',
  },
  {
    icon: 'cart',
    title: 'Grocery Price Comparison',
    desc: 'See whether Checkers, Pick n Pay, Woolworths or Shoprite is cheaper for your actual shopping list this week.',
  },
  {
    icon: 'chart',
    title: 'Personal Financial Projections',
    desc: 'Model your savings, debt payoff, or investment growth over 1, 5 or 10 years — based on your real numbers.',
  },
  {
    icon: 'people',
    title: 'Expert Consultations',
    desc: 'Book a 30 or 60-minute session with a human financial consultant when you need more than an AI answer.',
  },
]

const ICONS = {
  lightning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  bank: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="18" height="11" rx="1" /><path d="M3 10l9-7 9 7"/><line x1="12" y1="10" x2="12" y2="21"/>
    </svg>
  ),
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  cart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  people: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
}

const PRICING = [
  {
    tier: 'Free',
    price: 'R0',
    priceSuffix: ' / month',
    desc: 'Everything you need to understand your money.',
    items: [
      'Transaction parsing via SMS or email',
      'Bank statement import (all SA banks)',
      'AI budget questions — up to 50/month',
      'Spending categories & monthly overview',
    ],
    cta: 'Get started free',
    featured: false,
  },
  {
    tier: 'Budget Coach',
    price: 'R199',
    priceSuffix: ' / month',
    desc: 'Unlimited AI, projections, and grocery price tracking.',
    items: [
      'Everything in Free',
      'Unlimited AI budget Q&A',
      'Personal financial projections',
      'Grocery price comparison',
      'Priority support',
    ],
    cta: 'Start coaching',
    featured: true,
  },
  {
    tier: 'Consultations',
    price: 'R150+',
    priceSuffix: ' / session',
    desc: 'One-on-one time with a certified human financial consultant.',
    items: [
      '30-min session — R150',
      '60-min session — R400',
      'Debt strategy, investments, tax',
      'Booking via the app in seconds',
    ],
    cta: 'Book a session',
    featured: false,
  },
]

export default function LandingPage() {
  return (
    <div className="lp">

      {/* NAV */}
      <nav className="lp-nav">
        <span className="lp-nav-logo">bump<span>.</span></span>
        <div className="lp-nav-actions">
          <Link to="/auth" className="btn-ghost">Login</Link>
          <Link to="/auth" className="btn-coral">Get Started</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <span className="lp-hero-eyebrow">AI-powered budgeting for South Africa</span>
        <h1>Your money, finally making sense.</h1>
        <p className="lp-hero-sub">
          Ask questions. Import statements. Track groceries. Book a real consultant.
          bump. brings everything you need to take control of your finances — in plain English.
        </p>
        <div className="lp-hero-actions">
          <Link to="/auth" className="btn-coral-lg">Get Started Free</Link>
          <Link to="/auth" className="btn-ghost-lg">Log in</Link>
        </div>
      </section>

      <hr className="lp-divider" />

      {/* FEATURES */}
      <section className="lp-section">
        <p className="lp-section-label">What bump. does</p>
        <h2 className="lp-section-title">Everything 22seven doesn&apos;t.</h2>
        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <div className="lp-feature-card" key={f.title}>
              <div className="lp-feature-icon">{ICONS[f.icon]}</div>
              <div className="lp-feature-title">{f.title}</div>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="lp-divider" />

      {/* PRICING */}
      <section className="lp-section">
        <p className="lp-section-label">Pricing</p>
        <h2 className="lp-section-title">Simple. Transparent. South African.</h2>
        <div className="lp-pricing-grid">
          {PRICING.map((p) => (
            <div className={`lp-pricing-card${p.featured ? ' featured' : ''}`} key={p.tier}>
              <p className="lp-pricing-tier">{p.tier}</p>
              <p className="lp-pricing-price">
                {p.price}<span>{p.priceSuffix}</span>
              </p>
              <p className="lp-pricing-desc">{p.desc}</p>
              <ul className="lp-pricing-list">
                {p.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="lp-pricing-cta">
                <Link to="/auth" className="btn-coral">{p.cta}</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TAGLINE */}
      <div className="lp-tagline">
        <h2>Say it. <span className="coral">Send it.</span> Done.</h2>
        <p className="lp-tagline-sub">
          No spreadsheets. No jargon. Just you, your budget, and an AI that actually understands South African money.
        </p>
        <Link to="/auth" className="btn-coral-lg">Start for free</Link>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="lp-footer">
          <div className="lp-footer-logo">bump<span>.</span></div>
          <div className="lp-footer-links">
            <a href="https://bumppay.co.za" target="_blank" rel="noreferrer">bumppay.co.za</a>
            <a href="mailto:njhavary@bumppay.co.za">njhavary@bumppay.co.za</a>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/refund">Refund Policy</Link>
            <Link to="/cancellation">Cancellation Policy</Link>
          </div>

          <p className="lp-footer-copy">
            &copy; {new Date().getFullYear()} bump. (Pty) Ltd. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  )
}
