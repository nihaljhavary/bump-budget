import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './BookConsult.css'

const TIERS = [
  {
    id: 'budget_coach',
    label: 'Budget Coach',
    price: 199,
    duration: 'Monthly',
    isSubscription: true,
    badge: 'Most Popular',
    description: 'Ongoing AI-powered budget coaching with unlimited imports and analysis.',
    features: [
      '500 Claude AI calls/month',
      'Bulk bank statement import',
      'Merchant categorisation rules',
      'Monthly spending dashboard',
      'Priority support',
    ],
  },
  {
    id: 'session_30',
    label: '30-min Session',
    price: 750,
    duration: 'One-time',
    isSubscription: false,
    badge: null,
    description: 'A focused 30-minute video call with a certified financial coach.',
    features: [
      'Video call via Google Meet',
      'Budget review & feedback',
      'Actionable savings plan',
      'Post-session notes',
    ],
  },
  {
    id: 'session_60',
    label: '60-min Session',
    price: 1200,
    duration: 'One-time',
    isSubscription: false,
    badge: null,
    description: 'Deep-dive 60-minute session to tackle complex financial goals.',
    features: [
      'Everything in 30-min session',
      'Debt restructuring advice',
      'Investment readiness check',
      'Monthly check-in follow-up',
    ],
  },
]

export default function BookConsult({ onBack }) {
  const { user, profile } = useAuth()
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scriptReady, setScriptReady] = useState(false)

  const isSubscriptionSelected = selected?.isSubscription === true

  useEffect(() => {
    if (document.getElementById('paystack-script')) { setScriptReady(true); return }
    const script = document.createElement('script')
    script.id = 'paystack-script'
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload = () => setScriptReady(true)
    script.onerror = () => setError('Could not load payment processor. Check your connection.')
    document.head.appendChild(script)
  }, [])

  async function handlePay() {
    if (!selected || !scriptReady) return
    setLoading(true)
    setError('')
    try {
      const handler = window.PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: user.email,
        amount: selected.price * 100,
        currency: 'ZAR',
        metadata: { tier: selected.id, user_id: user.id },
        callback: async (response) => {
          await supabase.from('bookings').insert({
            user_id: user.id,
            tier: selected.id,
            paystack_reference: response.reference,
            amount: selected.price,
            status: 'pending',
          })
          onBack()
        },
        onClose: () => setLoading(false),
      })
      handler.openIframe()
    } catch (err) {
      setError(err.message || 'Payment failed. Try again.')
      setLoading(false)
    }
  }

  async function handleSubscribe() {
    if (!selected || !scriptReady) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: user.email, tier: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription setup failed')
      if (data.authorization_url) window.location.href = data.authorization_url
    } catch (err) {
      setError(err.message || 'Subscription failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="book-shell">
      <button className="book-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <div className="book-header">
        <h1>Work with a coach</h1>
        <p>Choose a session or subscribe to Budget Coach for ongoing AI-powered support.</p>
      </div>

      <div className="tiers">
        {TIERS.map(tier => (
          <div
            key={tier.id}
            className={`tier-card ${selected?.id === tier.id ? 'selected' : ''} ${tier.badge ? 'featured' : ''}`}
            onClick={() => setSelected(tier)}
          >
            {tier.badge && <div className="tier-badge">{tier.badge}</div>}
            <div className="tier-top">
              <div>
                <div className="tier-label">{tier.label}</div>
                <div className="tier-duration">{tier.duration}</div>
              </div>
              <div>
                <div className="tier-price">R{tier.price}</div>
                {tier.isSubscription && <div className="tier-price-sub">per month</div>}
              </div>
            </div>
            <p className="tier-desc">{tier.description}</p>
            <ul className="tier-features">
              {tier.features.map((f, i) => (
                <li key={i}><span className="check">checkmark</span>{f}</li>
              ))}
            </ul>
            <div className={`tier-radio ${selected?.id === tier.id ? 'active' : ''}`}>
              {selected?.id === tier.id ? 'Selected' : 'Select this tier'}
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
          ? 'Processing...'
          : !selected
            ? 'Select a tier to continue'
            : isSubscriptionSelected
              ? 'Subscribe to Budget Coach (R199/month)'
              : `Pay R${selected.price} for ${selected.label}`}
      </button>

      <p className="book-secure">Secure payment via Paystack. Cancel anytime.</p>
    </div>
  )
}
