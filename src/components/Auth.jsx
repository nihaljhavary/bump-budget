import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

const TERMS_VERSION = '1.0'

const TERMS_TEXT = `By creating an account or signing in to bump. ("the App"), you agree to the following:

1. POPIA COMPLIANCE — bump. processes your personal and financial data in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA). Your data is used solely to provide budgeting insights and is never sold to third parties.

2. DATA SECURITY — While bump. implements reasonable security measures, no system is 100% secure. You accept that any transmission of data is at your own risk. bump. (Pty) Ltd shall not be held liable for any unauthorised access resulting from circumstances beyond our reasonable control.

3. FINANCIAL INFORMATION DISCLAIMER — The AI-generated insights and analysis provided by bump. are for informational and educational purposes only. They do not constitute financial advice. bump. is not a registered financial services provider (FSP) in terms of the Financial Advisory and Intermediary Services Act (FAIS). Always consult a qualified financial adviser before making financial decisions.

4. CONSULTANT SESSIONS — The financial consultation service connects you with an independent consultant. bump. facilitates the booking only and is not responsible for the advice given during sessions. The consultant and client relationship is independent of bump.

5. NO LIABILITY — To the fullest extent permitted by applicable South African law, bump. shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of the App or reliance on any information provided.

6. ACCEPTANCE — By ticking the checkbox and proceeding, you confirm that you have read, understood, and agree to these terms. This acceptance is recorded with a timestamp and your account details for compliance purposes.`

export default function Auth({ termsOnly = false }) {
  const { user, refreshProfile } = useAuth()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [mode, setMode]           = useState('magic')
  const [loading, setLoading]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [savingTerms, setSavingTerms] = useState(false)

  // ── T&C acceptance screen (shown after login if not yet accepted) ────────────
  async function acceptTerms() {
    if (!termsAccepted) { setError('You must accept the terms to continue'); return }
    setSavingTerms(true); setError('')
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
        .eq('id', user.id)
      if (err) throw err
      await refreshProfile()
    } catch (e) {
      setError('Could not save your acceptance. Please try again.')
    } finally {
      setSavingTerms(false)
    }
  }

  if (termsOnly) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-terms">
          <div className="auth-logo">bump<span className="logo-dot" /></div>
          <h2 className="auth-title">Before you continue</h2>
          <p className="auth-sub">Please read and accept our terms to use bump.</p>

          <div className="terms-box">{TERMS_TEXT}</div>

          {error && <div className="auth-error">{error}</div>}

          <label className="terms-check-row">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
            />
            <span>
              I have read and accept the <button className="terms-inline-link" onClick={() => setShowTerms(s => !s)}>Terms & Conditions</button>, including the POPIA data processing notice and the financial disclaimer. I accept all risks associated with use of this service.
            </span>
          </label>

          <button
            className="btn-primary"
            onClick={acceptTerms}
            disabled={savingTerms || !termsAccepted}
          >
            {savingTerms ? 'Saving...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    )
  }

  // ── Magic link sent screen ───────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo">bump<span className="logo-dot" /></div>
          <h2 className="auth-title">Check your inbox</h2>
          <p className="auth-sub">We sent a magic link to <strong>{email}</strong>. Click it to sign in.</p>
          <button className="btn-ghost" onClick={() => setSent(false)}>Use a different email</button>
        </div>
      </div>
    )
  }

  // ── Auth screen ──────────────────────────────────────────────────────────────
  async function sendMagicLink() {
    if (!email) { setError('Enter your email first'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({ email })
    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  async function signIn() {
    if (!email || !password) { setError('Fill in email and password'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  async function signUp() {
    if (!email || !password) { setError('Fill in email and password'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signUp({ email, password })
    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">bump<span className="logo-dot" /></div>
        <h2 className="auth-title">Understand your money</h2>
        <p className="auth-sub">Sign in or create a free account</p>

        {error && <div className="auth-error">{error}</div>}

        <input
          className="auth-input"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (mode === 'magic' ? sendMagicLink() : signIn())}
        />

        {mode === 'magic' && (
          <>
            <button className="btn-primary" onClick={sendMagicLink} disabled={loading}>
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
            <button className="btn-ghost" onClick={() => { setMode('password'); setError('') }}>
              Sign in with password instead
            </button>
          </>
        )}

        {mode === 'password' && (
          <>
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && signIn()}
            />
            <button className="btn-primary" onClick={signIn} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <button className="btn-ghost" onClick={signUp} disabled={loading}>
              Create account with this password
            </button>
            <button className="btn-ghost" onClick={() => { setMode('magic'); setError('') }} style={{ marginTop: '6px' }}>
              Back to magic link
            </button>
          </>
        )}

        <p className="auth-terms-note">
          By signing in you agree to our{' '}
          <button className="terms-inline-link" onClick={() => setShowTerms(s => !s)}>Terms & Conditions</button>
          {' '}and POPIA data processing notice.
        </p>

        {showTerms && (
          <div className="terms-box terms-box-small">{TERMS_TEXT}</div>
        )}
      </div>
    </div>
  )
}
