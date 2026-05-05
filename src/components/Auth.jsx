import { useState } from 'react'
import { supabase } from '../supabase'
import './Auth.css'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('magic') // 'magic' | 'password'
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
            <button className="btn-ghost" onClick={() => { setMode('magic'); setError('') }} style={{marginTop:'6px'}}>
              Back to magic link
            </button>
          </>
        )}
      </div>
    </div>
  )
}
