import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './BookConsult.css'

// ── Budget Coach subscription tier (recurring) ─────────────────────────────
const SUBSCRIPTION_TIER = {
  id:           'budget-coach',
  name:         'Budget Coach',
  price:        199,
  amount:       19900,   // cents
  duration:     'Monthly subscription',
  description:  'Unlimited Claude-powered parsing plus priority access to discounted consultations.',
  features: [
    '500 AI transaction parses/month',
    'Priority consultation booking',
    'Discounted sessions — R200 (save R50)',
    'Cancel anytime'
  ],
  highlight:      true,
  isSubscription: true
}

// ── One-time consultation tiers ────────────────────────────────────────────
const CONSULT_TIERS = [
  {
    id:       'quick-review',
    name:     'Quick Review',
    price:    150,
    amount:   15000,
    duration: '30 min',
    description: 'A focused look at your biggest spending areas with clear, actionable recommendations.',
    features: ['Budget health check', 'Top 3 savings opportunities', 'Live Q&A']
  },
  {
    id:       'full-session',
    name:     'Full Session',
    price:    250,
    amount:   25000,
    duration: '1 hour',
    description: 'A comprehensive review of every category plus a personalised savings plan.',
    features: ['Full category deep dive', 'Savings plan creation', 'Debt strategy', 'Live Q&A']
  },
  {
    id:       'deep-dive',
    name:     'Deep Dive',
    price:    400,
    amount:   40000,
    duration: '1 hour + written summary',
    description: 'The complete package — detailed analysis, live session, and a written action plan to keep.',
    features: ['Everything in Full Session', 'Written budget summary', 'Action plan document', '30-day follow-up email']
  }
]

const ALL_TIERS = [SUBSCRIPTION_TIER, ...CONSULT_TIERS]

export default function BookConsult({ onBack }) {
  const { user } = useAuth()
  const [selected, setSelected]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [confirmed, setConfirmed]     = useState(null)
  const [error, setError]             = useState('')
  const [scriptReady, setScriptReady] = useState(false)

  // Load Paystack inline script once
  useEffect(() => {
    if (window.PaystackPop) { setScriptReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://js.paystack.co/v1/inline.js'
    s.async = true
    s.onload = () => setScriptReady(true)
    s.onerror = () => setError('Failed to load payment provider. Please refresh and try again.')
    document.head.appendChild(s)
  }, [])

  // ── Subscription flow ──────────────────────────────────────────────────────
  async function handleSubscribe() {
    if (!scriptReady || loading) return
    setError('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      // Get (or create) Paystack plan code from our function
      const planRes = await fetch('/.netlify/functions/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      const planData = await planRes.json()
      if (!planRes.ok || !planData.planCode) {
        throw new Error(planData.error || 'Could not initialise subscription')
      }

      setLoading(false)

      const reference = `bb_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const handler = window.PaystackPop.setup({
        key:      import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email:    user.email,
        amount:   SUBSCRIPTION_TIER.amount,
        currency: 'ZAR',
        ref:      reference,
        plan:     planData.planCode,
        metadata: {
          custom_fields: [
            { display_name: 'Tier',    variable_name: 'tier',    value: 'budget-coach' },
            { display_name: 'User ID', variable_name: 'user_id', value: user.id }
          ]
        },
        callback: (response) => onSubscriptionSuccess(response.reference),
        onClose:  () => { /* dismissed */ }
      })
      handler.openIframe()
    } catch (err) {
      setLoading(false)
      setError(err.message || 'Something went wrong. Please try again.')
    }
  }

  async function onSubscriptionSuccess(reference) {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/.netlify/functions/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`
        },
        body: JSON.stringify({ reference })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Subscription activation failed')

      setConfirmed({ ...SUBSCRIPTION_TIER, isSubscription: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please contact us directly.')
    }
    setLoading(false)
  }

  // ── One-time consultation flow ─────────────────────────────────────────────
  async function handlePay() {
    if (!selected || selected.isSubscription || !scriptReady || loading) return
    setError('')

    const reference = `bb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const handler = window.PaystackPop.setup({
      key:      import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
      email:    user.email,
      amount:   selected.amount,
      currency: 'ZAR',
      ref:      reference,
      metadata: {
        custom_fields: [
          { display_name: 'Tier',    variable_name: 'tier',    value: selected.name },
          { display_name: 'User ID', variable_name: 'user_id', value: user.id }
        ]
      },
      callback: (response) => onPaymentSuccess(response.reference),
      onClose:  () => { /* dismissed */ }
    })
    handler.openIframe()
  }

  async function onPaymentSuccess(reference) {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/.netlify/functions/create-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`
        },
        body: JSON.stringify({
          reference,
          tier:   selected.id,
          amount: selected.amount
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Booking creation failed')

      setConfirmed(selected)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please contact us directly.')
    }
    setLoading(false)
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="book-shell">
        <nav className="nav">
          <div className="nav-logo">bump<span className="logo-dot" aria-hidden="true" /></div>
        </nav>
        <div className="book-confirm-screen">
          <div className="confirm-circle">✓</div>
          <h2>{confirmed.isSubscription ? 'You\'re subscribed!' : 'You\'re booked!'}</h2>
          {confirmed.isSubscription ? (
            <>
              <p className="confirm-sub">
                Your <strong>Budget Coach</strong> subscription is active. R199/month, cancel anytime.
              </p>
              <div className="confirm-subscription-badge">
                ✦ Budget Coach · Active
              </div>
              <div className="confirm-steps">
                <div className="confirm-step">
                  <span className="step-num">1</span>
                  <span>You now have 500 AI transaction parses per month — already unlocked.</span>
                </div>
                <div className="confirm-step">
                  <span className="step-num">2</span>
                  <span>Book priority consultations at the discounted rate of R200.</span>
                </div>
                <div className="confirm-step">
                  <span className="step-num">3</span>
                  <span>Manage or cancel your subscription via your Paystack subscription portal.</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="confirm-sub">
                Your <strong>{confirmed.name}</strong> consultation is confirmed.
              </p>
              <div className="confirm-steps">
                <div className="confirm-step">
                  <span className="step-num">1</span>
                  <span>You'll receive a calendar invite via email within 24 hours.</span>
                </div>
                <div className="confirm-step">
                  <span className="step-num">2</span>
                  <span>Your consultant will review your budget data before the call.</span>
                </div>
                <div className="confirm-step">
                  <span className="step-num">3</span>
                  <span>Check your dashboard — you'll see an access request to approve.</span>
                </div>
              </div>
            </>
          )}
          <button className="book-back-btn" onClick={onBack}>← Back to dashboard</button>
        </div>
      </div>
    )
  }

  // ── Booking screen ─────────────────────────────────────────────────────────
  const isSubscriptionSelected = selected?.isSubscription

  return (
    <div className="book-shell">
      <nav className="nav">
        <div className="nav-logo">bump<span className="logo-dot" aria-hidden="true" /></div>
        <div className="nav-right">
          <button className="btn-ghost-sm" onClick={onBack}>← Back</button>
        </div>
      </nav>

      <div className="book-body">
        <div className="book-hero">
          <h1 className="book-title">Book a Consultation</h1>
          <p className="book-sub">
            Get personalised financial guidance from a professional — reviewed against your real budget data.
          </p>
        </div>

        <div className="tier-list">
          {ALL_TIERS.map(tier => (
            <div
              key={tier.id}
              className={[
                'tier-card',
                selected?.id === tier.id ? 'selected' : '',
                tier.isSubscription ? 'subscription' : '',
                !tier.isSubscription && tier.highlight ? 'highlight' : ''
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(tier)}
            >
              {tier.isSubscription && <div className="tier-popular">Most Popular</div>}
              <div className="tier-header">
                <div>
                  <div className="tier-name">{tier.name}</div>
                  <div className="tier-duration">{tier.duration}</div>
                </div>
                <div>
                  <div className="tier-price">R{tier.price}</div>
                  {tier.isSubscription && <div className="tier-price-sub">per month · recurring</div>}
                </div>
              </div>
              <p className="tier-desc">{tier.description}</p>
              <ul className="tier-features">
                {tier.features.map((f, i) => (
                  <li key={i}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <div className={`tier-radio ${selected?.id === tier.id ? 'active' : ''}`}>
                {selected?.id === tier.id ? '● Selected' : '○ Select this tier'}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="book-error">{error}</div>}

        <button
          className="book-pay-btn"
          onClick={isSubscriptionSelected ? handleSubscribe : handlePay}
          disabled={!selected || loading || !scriptReady}
        >
          {loading
            ? 'Processing…'
            : !selected
              ? 'Select a tier to continue'
              : isSubscriptionSelected
                ? `Subscribe · R${selected.price}/month with Paystack →`
                : `Pay R${selected.price} with Paystack →`}
        </button>

        <div className="book-trust">
          🔒 Secured by Paystack · ZAR · {isSubscriptionSelected ? 'Cancel anytime' : 'No card details stored'}
        </div>
      </div>
    </div>
  )
}
