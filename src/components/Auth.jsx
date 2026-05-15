import { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

const TERMS_VERSION = '1.0'

const TERMS_TEXT = `By creating an account or signing in to bump. you agree to the following:

1. POPIA COMPLIANCE - bump. processes your personal and financial data in accordance with POPIA. Your data is used solely to provide budgeting insights and is never sold to third parties.

2. DATA SECURITY - While bump. implements reasonable security measures, no system is 100% secure. You accept that any transmission of data is at your own risk.

3. FINANCIAL INFORMATION DISCLAIMER - The AI-generated insights provided by bump. are for informational purposes only. They do not constitute financial advice. bump. is not a registered FSP. Always consult a qualified financial adviser before making financial decisions.

4. CONSULTANT SESSIONS - The consultation service connects you with an independent consultant. bump. facilitates the booking only and is not responsible for advice given.

5. NO LIABILITY - To the fullest extent permitted by South African law, bump. shall not be liable for any direct, indirect, or consequential damages.

6. ACCEPTANCE - By ticking the checkbox and proceeding, you confirm you have read and agree to these terms.`

export default function Auth({ termsOnly = false }) {
  const { user, refreshProfile } = useAuth()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [mode, setMode]           = useState('magic')   // 'magic' | 'password' | 'forgot'
  const [authTab, setAuthTab]     = useState('signin')
  const [loading, setLoading]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [sentType, setSentType]   = useState('magic')   // 'magic' | 'reset'
  const [error, setError]         = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [savingTerms, setSavingTerms] = useState(false)

  // Synchronous in-flight guard — prevents duplicate submissions between the first
  // click and React re-rendering the button as disabled. useRef is not tied to the
  // render cycle, so it blocks re-entry immediately, unlike useState(loading).
  const submittingRef = useRef(false)

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
    } catch {
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
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
            <span>I have read and accept the Terms &amp; Conditions, including the POPIA data processing notice and the financial disclaimer.</span>
          </label>
          <button className="btn-primary" onClick={acceptTerms} disabled={savingTerms || !termsAccepted}>
            {savingTerms ? 'Saving...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    )
  }

  // Sent screen — used for both magic link and password reset emails
  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo">bump<span className="logo-dot" /></div>
          <div className="auth-sent">
            <div className="auth-sent-icon">{sentType === 'reset' ? '🔑' : '✉️'}</div>
            <h2>Check your inbox</h2>
            <p>
              {sentType === 'reset'
                ? <span>We sent a password reset link to <strong>{email}</strong>. Click it to set a new password.</span>
                : <span>We sent a magic link to <strong>{email}</strong>. Click it to sign in.</span>
              }
            </p>
            <button className="btn-ghost" onClick={() => { setSent(false); setMode(sentType === 'reset' ? 'password' : 'magic') }}>
              {sentType === 'reset' ? 'Back to sign in' : 'Use a different email'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  async function sendMagicLink() {
    if (!email) { setError('Enter your email first'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/app' }
      })
      if (err) setError(err.message)
      else { setSentType('magic'); setSent(true) }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function signIn() {
    if (!email || !password) { setError('Fill in your email and password'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function signUp() {
    if (!email || !password) { setError('Fill in your email and password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + '/app' }
      })
      if (err) setError(err.message)
      else { setSentType('magic'); setSent(true) }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function sendForgotPassword() {
    if (!email) { setError('Enter your email address first'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/app'
      })
      if (err) setError(err.message)
      else { setSentType('reset'); setSent(true) }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  function switchMode(m) { setMode(m); setError('') }
  function switchTab(t) { setAuthTab(t); setError('') }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">bump<span className="logo-dot" /></div>
        <h2 className="auth-title">Understand your money</h2>
        <p className="auth-sub">South Africa's smartest personal finance app</p>

        {mode !== 'forgot' && (
          <div className="auth-mode-toggle">
            <button className={`auth-mode-btn ${authTab === 'signin' ? 'active' : ''}`} onClick={() => switchTab('signin')}>Sign in</button>
            <button className={`auth-mode-btn ${authTab === 'signup' ? 'active' : ''}`} onClick={() => switchTab('signup')}>Create account</button>
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        {mode === 'magic' && (
          <>
            <div className="auth-field">
              <label className="auth-field-label">Email</label>
              <input className="auth-input" type="email" placeholder="your@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMagicLink()} autoComplete="email" />
            </div>
            <button className="btn-primary" onClick={sendMagicLink} disabled={loading}>
              {loading ? 'Sending...' : '✨ Send magic link'}
            </button>
            <div className="auth-divider">or</div>
            <button className="btn-ghost" onClick={() => switchMode('password')}>Use password instead</button>
          </>
        )}

        {mode === 'password' && (
          <>
            <div className="auth-field">
              <label className="auth-field-label">Email</label>
              <input className="auth-input" type="email" placeholder="your@email.com"
                value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="auth-field">
              <label className="auth-field-label">Password</label>
              <input className="auth-input" type="password"
                placeholder={authTab === 'signup' ? 'Choose a password (6+ chars)' : 'Your password'}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (authTab === 'signin' ? signIn() : signUp())}
                autoComplete={authTab === 'signin' ? 'current-password' : 'new-password'} />
            </div>
            {authTab === 'signin'
              ? <button className="btn-primary" onClick={signIn} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
              : <button className="btn-primary" onClick={signUp} disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
            }
            {authTab === 'signin' && (
              <button className="btn-ghost" onClick={() => switchMode('forgot')} style={{ fontSize: 13, opacity: 0.75 }}>
                Forgot password?
              </button>
            )}
            <div className="auth-divider">or</div>
            <button className="btn-ghost" onClick={() => switchMode('magic')}>Use magic link instead</button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className="auth-sub" style={{ marginBottom: 20 }}>Enter your email and we\'ll send you a reset link.</p>
            <div className="auth-field">
              <label className="auth-field-label">Email</label>
              <input className="auth-input" type="email" placeholder="your@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendForgotPassword()} autoComplete="email" />
            </div>
            <button className="btn-primary" onClick={sendForgotPassword} disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
            <div className="auth-divider">or</div>
            <button className="btn-ghost" onClick={() => switchMode('password')}>Back to sign in</button>
          </>
        )}

        <p className="auth-terms-note">
          By signing in you agree to our{' '}
          <button className="terms-inline-link" onClick={() => setShowTerms(s => !s)}>Terms &amp; Conditions</button>{' '}
          and POPIA data processing notice.
        </p>
        {showTerms && <div className="terms-box terms-box-small">{TERMS_TEXT}</div>}
      </div>
    </div>
  )
}
