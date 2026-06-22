import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './BookConsult.css'

// ── TODO: Update these with your real EFT banking details before going live ──
const BANKING = {
  bank:          'First National Bank',   // ← update if different
  accountName:   'N Jhavary',            // ← update to your registered account name
  accountNumber: 'XXXXXXXXXX',           // ← ADD YOUR ACCOUNT NUMBER HERE
  branchCode:    '250655',               // ← FNB universal; update for other banks
  accountType:   'Cheque / Current',
}
// ──────────────────────────────────────────────────────────────────────────────

const SESSION_INCLUDES = [
  'Deep-dive into your spending using your bump. data',
  'A budget plan you can actually stick to',
  'Debt, savings, and investment priorities',
  'Written notes emailed to you after the session',
]

export default function BookConsult({ onBack }) {
  const { user, profile } = useAuth()

  const [form, setForm] = useState({
    fullName:      profile?.full_name || '',
    email:         user?.email || '',
    phone:         '',
    preferredTime: '',
    goal:          '',
  })
  const [status, setStatus]   = useState('idle')   // idle | submitting | success | error
  const [error, setError]     = useState('')
  const [bookingRef, setBookingRef] = useState('')

  function handle(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.phone.trim()) { setError('Please enter your phone number.'); return }
    if (!form.goal.trim())  { setError('Please tell us what you want to work on.'); return }
    setStatus('submitting'); setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/book-consult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone:         form.phone,
          preferredTime: form.preferredTime,
          goal:          form.goal,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed. Please try again.')
      setBookingRef(data.reference)
      setStatus('success')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  /* ── Confirmation screen ── */
  if (status === 'success') {
    return (
      <div className="book-shell">
        <div className="book-confirm-screen">
          <div className="confirm-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>Session requested!</h2>
          <p className="confirm-sub">
            Complete the EFT below to confirm your slot. We&apos;ll reach out within 24 hours.
          </p>

          <div className="book-eft-card">
            <p className="book-eft-title">EFT Payment Details</p>
            <div className="book-eft-row"><span>Bank</span><strong>{BANKING.bank}</strong></div>
            <div className="book-eft-row"><span>Account name</span><strong>{BANKING.accountName}</strong></div>
            <div className="book-eft-row"><span>Account no.</span><strong>{BANKING.accountNumber}</strong></div>
            <div className="book-eft-row"><span>Branch code</span><strong>{BANKING.branchCode}</strong></div>
            <div className="book-eft-row"><span>Account type</span><strong>{BANKING.accountType}</strong></div>
            <div className="book-eft-row book-eft-ref">
              <span>Reference</span>
              <strong>{bookingRef}</strong>
            </div>
            <div className="book-eft-amount">R500</div>
          </div>

          <p className="confirm-sub" style={{ fontSize: '0.82rem', marginTop: 4 }}>
            Use <strong>{bookingRef}</strong> as your EFT reference — it links your payment to your booking.
          </p>

          <button className="book-back-btn" onClick={onBack}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  /* ── Booking form ── */
  return (
    <div className="book-shell">
      <button className="book-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <div className="book-header">
        <h1>Book a session</h1>
        <p>60 minutes · R500 · Pay via EFT after submitting.</p>
      </div>

      <div className="book-session-card">
        <div className="book-session-top">
          <div>
            <div className="book-session-label">60-minute Expert Consultation</div>
            <div className="book-session-price">R500</div>
          </div>
          <div className="book-session-tick">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <ul className="book-session-includes">
          {SESSION_INCLUDES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <form className="book-form" onSubmit={handleSubmit}>
        <div className="book-field">
          <label htmlFor="bc-name">Full name</label>
          <input
            id="bc-name"
            value={form.fullName}
            onChange={e => handle('fullName', e.target.value)}
            placeholder="Your name"
            required
          />
        </div>
        <div className="book-field">
          <label htmlFor="bc-email">Email</label>
          <input
            id="bc-email"
            type="email"
            value={form.email}
            onChange={e => handle('email', e.target.value)}
            placeholder="you@email.com"
            required
          />
        </div>
        <div className="book-field">
          <label htmlFor="bc-phone">Phone number</label>
          <input
            id="bc-phone"
            value={form.phone}
            onChange={e => handle('phone', e.target.value)}
            placeholder="071 234 5678"
            required
          />
        </div>
        <div className="book-field">
          <label htmlFor="bc-time">Preferred day / time <span className="book-optional">(optional)</span></label>
          <input
            id="bc-time"
            value={form.preferredTime}
            onChange={e => handle('preferredTime', e.target.value)}
            placeholder="e.g. Weekday mornings, Saturday afternoons"
          />
        </div>
        <div className="book-field">
          <label htmlFor="bc-goal">What do you want to work on? <span className="book-optional">*</span></label>
          <textarea
            id="bc-goal"
            value={form.goal}
            onChange={e => handle('goal', e.target.value)}
            placeholder="e.g. I want to clear my debt and start saving for a deposit — I feel like my money disappears every month..."
            rows={4}
            required
          />
        </div>

        {error && <div className="book-error">{error}</div>}

        <button
          type="submit"
          className="book-pay-btn"
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? 'Submitting...' : 'Request booking →'}
        </button>
        <p className="book-trust">We&apos;ll confirm your slot within 24 hours of receiving your EFT payment.</p>
      </form>
    </div>
  )
}
