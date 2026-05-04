import { useState } from 'react'
import { supabase } from '../supabase'
import './Auth.css'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('magic') // magic | sent | password
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMagicLink() {
    if (!email) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    setLoading(false)
    if (error) setError(error.message)
    else setMode('sent')
  }

  async function signInWithPassword() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function signUp() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else setMode('sent')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">bump<span className="logo-dot" aria-hidden="true" /></div>
      <p className="auth-tagline">understand your money</p>

      <div className="auth-card">
        {mode === 'magic' && (
          <>
            <h2>Welcome</h2>
            <p>Enter your email and we'll send a magic link — no password needed.</p>
            <div className="field">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={e => e.key === 'Enter' && sendMagicLink()}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="btn-primary" onClick={sendMagicLink} disabled={loading}>
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
            <div className="auth-divider"><span>or</span></div>
            <button className="btn-ghost" onClick={() => setMode('password')}>
              Sign in with password
            </button>
          </>
        )}

        {mode === 'sent' && (
          <div className="magic-sent">
            <div className="sent-icon">
              <svg width="22" height="22" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h3>Check your inbox</h3>
            <p>We sent a magic link to <strong>{email}</strong>. Click it to sign in instantly.</p>
            <div className="auth-divider" style={{marginTop:'1.2rem'}}><span>didn't get it?</span></div>
            <button className="btn-ghost" style={{marginTop:'10px'}} onClick={() => setMode('password')}>
              Sign in with password instead
            </button>
          </div>
        )}

        {mode === 'password' && (
          <>
            <h2>Sign in</h2>
            <p>Use your password or <button className="link-btn" onClick={() => setMode('magic')}>get a magic link</button> instead.</p>
            <div className="field">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && signInWithPassword()}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="btn-primary" onClick={signInWithPassword} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <div className="auth-divider"><span>no account?</span></div>
            <button className="btn-ghost" onClick={signUp} disabled={loading}>
              Create account with this password
            </button>
            <button className="btn-ghost" onClick={() => { setMode('magic'); setError('') }} style={{marginTop:'6px'}}>
              Back to magic link
            </button>
          </>
        )}
      </div>

      <p className="auth-footer">Your financial data is encrypted and never sold. Ever.</p>
    </div>
  )
}
