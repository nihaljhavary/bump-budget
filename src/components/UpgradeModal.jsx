/**
 * UpgradeModal — handles the full subscription upgrade / trial-start flow.
 *
 * Flow:
 *  1. User selects a plan (starter / growth / pro)
 *  2. "Start 30-day free trial" → server initialises a Paystack transaction with
 *     start_date = 30 days from now → no charge today
 *  3. PaystackPop opens with the access_code — user enters card details
 *  4. On Paystack success → server verifies reference → sets status: 'trialing'
 *  5. Profile refreshes → TierContext unlocks paid features immediately
 *
 * Props:
 *   isOpen        boolean     — show/hide the modal
 *   onClose       fn          — called when modal should close
 *   defaultPlan   string      — which plan tab to pre-select ('starter'|'growth'|'pro')
 *   onSuccess     fn          — called after successful activation (before close)
 *   simulating    string|null — if admin is simulating a tier, block real checkout
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './UpgradeModal.css'

const TRIAL_DAYS = 30

const PLANS = [
  {
    id:       'starter',
    label:    'Starter',
    price:    'R49',
    suffix:   '/mo',
    tagline:  '90 days · AI analytics',
    features: [
      '90 days transaction history',
      'AI spending analytics',
      'Budget recommendations',
      'Up to 50 AI questions/month',
    ],
  },
  {
    id:       'growth',
    label:    'Growth',
    price:    'R99',
    suffix:   '/mo',
    tagline:  '1 year · projections · grocery tracker',
    featured: true,
    features: [
      'Everything in Starter',
      '1 year transaction history',
      'AI financial projections (5–15 yr)',
      'Grocery price comparison',
      'Unlimited AI budget questions',
    ],
  },
  {
    id:       'pro',
    label:    'Pro',
    price:    'R199',
    suffix:   '/mo',
    tagline:  'Full history · expert consultations',
    features: [
      'Everything in Growth',
      'Full transaction history',
      'Expert financial consultations',
      'Priority support',
    ],
  },
]

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return }
    const existing = document.getElementById('paystack-script')
    if (existing) {
      existing.addEventListener('load', resolve)
      existing.addEventListener('error', () => reject(new Error('Failed to load payment provider')))
      return
    }
    const script = document.createElement('script')
    script.id  = 'paystack-script'
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload  = resolve
    script.onerror = () => reject(new Error('Failed to load payment provider. Check your connection.'))
    document.head.appendChild(script)
  })
}

export default function UpgradeModal({ isOpen, onClose, defaultPlan = 'growth', onSuccess, simulating }) {
  const { refreshProfile } = useAuth()
  const [plan,     setPlan]     = useState(defaultPlan)
  const [step,     setStep]     = useState('select')   // 'select' | 'processing' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  // Prevents double-tapping "Start trial" from firing two server requests
  const submittingRef = useRef(false)

  // Reset whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setPlan(defaultPlan)
      setStep('select')
      setErrorMsg('')
    }
  }, [isOpen, defaultPlan])

  if (!isOpen) return null

  const selectedPlan = PLANS.find(p => p.id === plan) || PLANS[1]

  // ── Simulation guard ──────────────────────────────────────────────────────
  if (simulating) {
    return (
      <div className="upm-overlay" onClick={onClose}>
        <div className="upm-modal" onClick={e => e.stopPropagation()}>
          <button className="upm-close" onClick={onClose}>&#x2715;</button>
          <div className="upm-sim-notice">
            <div className="upm-sim-icon">🧪</div>
            <h3>Simulation mode active</h3>
            <p>
              You&apos;re simulating the <strong>{simulating}</strong> tier as an admin.
              Real checkout is blocked in simulation mode to avoid accidental charges.
            </p>
            <p className="upm-sim-hint">
              Switch the tier dropdown to &ldquo;Admin (default)&rdquo; and use a test account to run through the actual checkout flow.
            </p>
            <button className="upm-btn-primary" onClick={onClose}>Got it</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Trial checkout ────────────────────────────────────────────────────────
  async function handleStartTrial() {
    // Prevent double-submission
    if (submittingRef.current) return
    submittingRef.current = true

    // Validate Paystack public key is configured
    const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
    if (!paystackKey || paystackKey === 'undefined' || paystackKey.length < 10) {
      setStep('error')
      setErrorMsg('Payment is not yet configured. Please contact support to upgrade your account.')
      submittingRef.current = false
      return
    }

    setStep('processing')
    setErrorMsg('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Please sign in again — your session has expired.')

      // Step 1: Server initialises a Paystack transaction with start_date 30 days out
      const initRes = await fetch('/.netlify/functions/create-subscription', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ plan, action: 'initialize', trial: true }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) throw new Error(initData.error || 'Could not initialise checkout. Try again.')

      const { access_code, reference, email } = initData

      // Step 2: Load Paystack inline JS
      await loadPaystackScript()

      // Step 3: Open PaystackPop using the server-generated access_code
      const handler = window.PaystackPop.setup({
        key:         paystackKey,
        email,
        access_code,
        ref:         reference,
        onSuccess: async (response) => {
          setStep('processing')
          try {
            const token2 = await getToken()
            const activateRes = await fetch('/.netlify/functions/create-subscription', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
              body:    JSON.stringify({ plan, reference: response.reference, trial: true }),
            })
            const activateData = await activateRes.json()
            if (!activateRes.ok) throw new Error(activateData.error || 'Activation failed. Contact support.')

            await refreshProfile()
            setStep('success')
            setTimeout(() => { onSuccess?.(); onClose() }, 2500)
          } catch (err) {
            setStep('error')
            setErrorMsg(err.message)
          }
        },
        onCancel: () => {
          // User closed Paystack popup — return to plan selection
          setStep('select')
        },
      })
      handler.openIframe()

      // While popup is open we show a lighter processing indicator
      // Revert to 'select' if popup was closed without success (handled by onCancel)
      setStep('select')
    } catch (err) {
      setStep('error')
      setErrorMsg(err.message)
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <div className="upm-overlay" onClick={onClose}>
      <div className="upm-modal" onClick={e => e.stopPropagation()}>
        <button className="upm-close" onClick={onClose}>&#x2715;</button>

        {/* ── Success ── */}
        {step === 'success' && (
          <div className="upm-success">
            <div className="upm-success-icon">🎉</div>
            <h3>Your {TRIAL_DAYS}-day free trial has started!</h3>
            <p>
              All <strong>{selectedPlan.label}</strong> features are now unlocked.
              Your first payment is due in {TRIAL_DAYS} days — cancel anytime before then for no charge.
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="upm-error-view">
            <div className="upm-error-icon">⚠️</div>
            <p className="upm-error-msg">{errorMsg}</p>
            <button className="upm-btn-primary" onClick={() => setStep('select')}>Try again</button>
          </div>
        )}

        {/* ── Processing ── */}
        {step === 'processing' && (
          <div className="upm-processing">
            <div className="upm-spinner" />
            <p>Setting up your trial...</p>
          </div>
        )}

        {/* ── Plan selection ── */}
        {(step === 'select') && (
          <>
            <div className="upm-header">
              <h2 className="upm-title">Start your {TRIAL_DAYS}-day free trial</h2>
              <p className="upm-subtitle">
                Enter your card details to unlock all features. No charge today — your first payment is in {TRIAL_DAYS} days. Cancel anytime.
              </p>
            </div>

            <div className="upm-plans">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  className={`upm-plan-card ${plan === p.id ? 'selected' : ''} ${p.featured ? 'featured' : ''}`}
                  onClick={() => setPlan(p.id)}
                >
                  {p.featured && <div className="upm-plan-badge">Most popular</div>}
                  <div className="upm-plan-top">
                    <span className="upm-plan-label">{p.label}</span>
                    <span className="upm-plan-price">{p.price}<span className="upm-plan-suffix">{p.suffix}</span></span>
                  </div>
                  <div className="upm-plan-tagline">{p.tagline}</div>
                  <ul className="upm-plan-features">
                    {p.features.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </button>
              ))}
            </div>

            <div className="upm-cta-wrap">
              <button className="upm-btn-primary upm-btn-lg" onClick={handleStartTrial}>
                Start {TRIAL_DAYS}-day free trial &rarr;
              </button>
              <p className="upm-cta-note">
                {selectedPlan.price}/mo after {TRIAL_DAYS} days &middot; cancel anytime &middot; no charge today
              </p>
            </div>

            <div className="upm-trust">
              <span>🔒 Secured by Paystack</span>
              <span>·</span>
              <span>Cancel anytime in Account Centre</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
