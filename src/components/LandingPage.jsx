import { Link } from 'react-router-dom'
import RentCheck from './RentCheck'
import './LandingPage.css'

const FEATURES = [
  {
    icon: 'lightning',
    title: 'Smart Transaction Parsing',
    desc: 'Paste any bank SMS or email — Claude reads it instantly. No manual entry, no category guessing.',
  },
  {
    icon: 'bank',
    title: 'Bank Statement Import',
    desc: 'Upload CSVs from Absa, Capitec, FNB, Nedbank, Standard Bank, TymeBank and more. Every transaction auto-categorised.',
  },
  {
    icon: 'chat',
    title: 'AI Budget Q&A',
    desc: 'Ask "How much did I spend on food in March?" or "Can I afford a R3,000 holiday?" and get a straight answer.',
  },
  {
    icon: 'chart',
    title: 'Financial Projections',
    desc: 'Model your savings, debt payoff, or investment growth over 5 or 10 years — built on your real spend data.',
  },
  {
    icon: 'cart',
    title: 'Grocery Price Comparison',
    desc: 'See whether Checkers, Pick n Pay, Woolworths or Shoprite is cheapest for your actual shopping list.',
  },
  {
    icon: 'people',
    title: 'Expert Consultations',
    desc: 'Book a 60-minute session with a human financial consultant when you need more than an AI answer.',
  },
]

const ICONS = {
  lightning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  bank: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="18" height="11" rx="1" /><path d="M3 10l9-7 9 7"/><line x1="12" y1="10" x2="12" y2="21"/>
    </svg>
  ),
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  cart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  people: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  house: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A49A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
}

const BUDGET_INCLUDES = [
  'Deep-dive into your spending using your bump. data',
  'A budget you can actually stick to',
  'Debt, savings, and investment priorities',
  'Written notes emailed to you after the session',
]

const PROPERTY_INCLUDES = [
  'An independent view on whether the asking price is fair',
  'Property data report & area price-trend data included',
  'House, sectional title, or land — individuals & SMEs',
  'A clear written summary emailed after the session',
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Sign up free',
    desc: 'Create your account in under a minute. No card required.',
  },
  {
    step: '02',
    title: 'Import your statements',
    desc: 'Upload your bank CSV or paste an SMS. bump. categorises everything automatically.',
  },
  {
    step: '03',
    title: 'Book a consult',
    desc: 'No account needed to book — pick a slot, pay via EFT, and we confirm within 24 hours.',
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
          <Link to="/book" className="btn-coral">Book a session</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <span className="lp-hero-eyebrow">AI-powered budgeting &amp; expert consulting — South Africa</span>
        <h1>Stop wondering where it all went.</h1>
        <p className="lp-hero-sub">
          bump. reads your bank statements, tracks every rand, and when you&apos;re ready to go deeper
          — book a 60-minute session with a real financial expert who&apos;ll help you build a plan that sticks.
        </p>
        <div className="lp-hero-actions">
          <Link to="/auth" className="btn-coral-lg">Get started free</Link>
          <Link to="/book" className="btn-ghost-lg">Book a consult</Link>
        </div>
      </section>

      <hr className="lp-divider" />

      {/* FEATURES */}
      <section className="lp-section">
        <p className="lp-section-label">What bump. does</p>
        <h2 className="lp-section-title">One platform. Every financial decision.</h2>
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

      {/* CONSULT SPOTLIGHT */}
      <section className="lp-section">
        <p className="lp-section-label">Expert consultations</p>
        <h2 className="lp-section-title">Real numbers. A real expert. No account needed.</h2>
        <div className="lp-consult-grid">

          <div className="lp-consult-card">
            <div className="lp-consult-top">
              <div>
                <p className="lp-consult-tier">Personal Financial Audit</p>
                <p className="lp-consult-price">R500 <span>once-off</span></p>
                <p className="lp-consult-desc">
                  One-on-one with a financial expert. No scripts, no product pitches
                  — just your numbers and a plan built around your life.
                </p>
              </div>
              <div className="lp-consult-badge">Most Popular</div>
            </div>
            <ul className="lp-consult-list">
              {BUDGET_INCLUDES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="lp-consult-cta">
              <Link to="/book?type=budget" className="btn-coral">Book your session &rarr;</Link>
              <p className="lp-consult-sub">60 minutes &middot; Pay via EFT after booking. Confirmed within 24 hours.</p>
            </div>
          </div>

          <div className="lp-consult-card">
            <div className="lp-consult-top">
              <div>
                <p className="lp-consult-tier">Property Purchase Consult</p>
                <p className="lp-consult-price">R650 <span>once-off</span></p>
                <p className="lp-consult-desc">
                  Buying a home or premises? A Chartered Accountant CA(SA) reviews the
                  property&apos;s data and tells you whether it&apos;s worth what they&apos;re asking.
                </p>
              </div>
              <div className="lp-consult-badge">New</div>
            </div>
            <ul className="lp-consult-list">
              {PROPERTY_INCLUDES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="lp-consult-cta">
              <Link to="/book?type=property" className="btn-coral">Book a property consult &rarr;</Link>
              <p className="lp-consult-sub">Pay via EFT after booking. Confirmed within 24 hours.</p>
            </div>
          </div>

        </div>

        <div className="lp-consult-side lp-consult-side-wide">
          <div className="lp-consult-quote">
            &ldquo;Most South Africans earning a good salary still feel like money disappears.
            A single focused session changes that.&rdquo;
          </div>
          <div className="lp-consult-who">
            <div className="lp-consult-avatar">N</div>
            <div>
              <p className="lp-consult-name">Nihal Jhavary</p>
              <p className="lp-consult-role">Founder, bump. &middot; CA(SA)</p>
            </div>
          </div>
        </div>

        <p className="lp-disclaimer">
          Consultations are independent, informational opinions from a Chartered Accountant CA(SA).
          bump. is not an authorised financial services provider — sessions are not regulated financial
          advice and a property consult is not a formal valuation.
        </p>
      </section>

      <hr className="lp-divider" />

      {/* HOW IT WORKS */}
      <section className="lp-section">
        <p className="lp-section-label">How it works</p>
        <h2 className="lp-section-title">Three steps to knowing your money.</h2>
        <div className="lp-steps">
          {HOW_IT_WORKS.map((s) => (
            <div className="lp-step" key={s.step}>
              <div className="lp-step-num">{s.step}</div>
              <div className="lp-step-title">{s.title}</div>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="lp-divider" />

      {/* RENT CHECK — free public tool */}
      <RentCheck />

      {/* TAGLINE */}
      <div className="lp-tagline">
        <h2>Know it. <span className="coral">Own it.</span></h2>
        <p className="lp-tagline-sub">
          No spreadsheets. No jargon. Just your real numbers — and an expert ready to help you do something about them.
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
