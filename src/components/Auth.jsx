import { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { observe } from '../utils/observe'
import { TERMS_VERSION, PRIVACY_VERSION, TERMS_TEXT } from '../utils/legalText'
import './Auth.css'


// Map raw Supabase / network error messages to human-friendly strings.
// This prevents internal error codes from reaching the user.
function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.'
  const msg = (err.message || err.toString()).toLowerCase()
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account already exists with this email. Try signing in instead.'
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return 'Email or password is incorrect. Please check your details and try again.'
  if (msg.includes('email not confirmed') || msg.includes('email link is invalid or has expired'))
    return 'Check your inbox — you need to confirm your email before signing in.'
  if (msg.includes('over_email_send_rate_limit') || msg.includes('email rate limit') || msg.includes('rate limit'))
    return 'Too many attempts. Please wait a minute before trying again.'
  if (msg.includes('user not found') || msg.includes('no user found'))
    return 'No account found with this email. Create an account first.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Connection error. Check your internet and try again.'
  if (msg.includes('password') && msg.includes('weak'))
    return 'Password is too weak. Use a mix of letters, numbers, and symbols.'
  if (msg.includes('signup') && msg.includes('disabled'))
    return 'Account creation is temporarily disabled. Please try again later.'
  // Fall back to the raw message if no mapping found, but capitalise first letter
  const raw = err.message || err.toString()
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

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
      const acceptedAt = new Date().toISOString()
      // 1. Update profile with versioned acceptance
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          terms_accepted_at: acceptedAt,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        }, { onConflict: 'id' })
      if (profileErr) throw profileErr

      // 2. Insert immutable consent record (best-effort — never blocks acceptance)
      try {
        await supabase.from('consent_records').insert({
          user_id:         user.id,
          email:           user.email || null,
          terms_version:   TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          accepted_at:     acceptedAt,
          user_agent:      typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
          action:          'accept',
        })
      } catch { /* consent record failure must never block sign-in */ }

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
            <div className="auth-sent-icon">{sentType === 'reset' ? '\u{1f511}' : '\u2709\ufe0f'}</div>
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

  // Strong password rules — 8+ chars, upper, lower, digit, special
  function validatePassword(pwd) {
    if (pwd.length < 8)            return ['At least 8 characters required']
    if (!/[A-Z]/.test(pwd))        return ['Must include an uppercase letter']
    if (!/[a-z]/.test(pwd))        return ['Must include a lowercase letter']
    if (!/[0-9]/.test(pwd))        return ['Must include a number']
    if (!/[^A-Za-z0-9]/.test(pwd)) return ['Must include a special character (!@#$%^&* etc.)']
    return []
  }

  function pwdStrength(pwd) {
    return [
      { ok: pwd.length >= 8,            label: '8+ characters' },
      { ok: /[A-Z]/.test(pwd),          label: 'Uppercase letter' },
      { ok: /[a-z]/.test(pwd),          label: 'Lowercase letter' },
      { ok: /[0-9]/.test(pwd),          label: 'Number' },
      { ok: /[^A-Za-z0-9]/.test(pwd),   label: 'Special character' },
    ]
  }

  async function sendMagicLink() {
    if (!email) { setError('Enter your email first'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/app' }
      })
      if (err) {
        setError(friendlyError(err))
        observe.authError(err, { action: 'sendMagicLink', email })
      } else {
        setSentType('magic'); setSent(true)
      }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function signIn() {
    if (!email || !password) { setError('Fill in your email and password'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) {
        setError(friendlyError(err))
        observe.authError(err, { action: 'signIn', email })
      }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function signUp() {
    if (!email || !password) { setError('Fill in your email and password'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    const pwdErrors = validatePassword(password)
    if (pwdErrors.length > 0) { setError('Password: ' + pwdErrors[0]); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + '/app' }
      })
      if (err) {
        setError(friendlyError(err))
        observe.authError(err, { action: 'signUp', email })
      } else {
        setSentType('magic'); setSent(true)
      }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function sendForgotPassword() {
    if (!email) { setError('Enter your email address first'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/app'
      })
      if (err) {
        setError(friendlyError(err))
        observe.authError(err, { action: 'sendForgotPassword', email })
      } else {
        setSentType('reset'); setSent(true)
      }
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
              {loading ? 'Sending...' : '\u2728 Send magic link'}
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
                placeholder={authTab === 'signup' ? 'Choose a strong password' : 'Your password'}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (authTab === 'signin' ? signIn() : signUp())}
                autoComplete={authTab === 'signin' ? 'current-password' : 'new-password'} />
              {authTab === 'signup' && password.length > 0 && (
                <div className="auth-pwd-rules">
                  {pwdStrength(password).map(r => (
                    <span key={r.label} className={`auth-pwd-rule ${r.ok ? 'ok' : ''}`}>
                      {r.ok ? '\u2713' : '\u00b7'} {r.label}
                    </span>
                  ))}
                </div>
              )}
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
