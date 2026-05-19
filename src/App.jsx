import { useState, useEffect } from 'react'
import { useVersionCheck } from './hooks/useVersionCheck'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { supabase } from './supabase'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import BookConsult from './components/BookConsult'
import LandingPage from './components/LandingPage'
import Onboarding from './components/Onboarding'
import FAQ from './components/FAQ'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { TierProvider } from './context/TierContext'

const Loader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', fontFamily: 'DM Sans, sans-serif', color: 'var(--muted)',
    background: 'var(--bg)',
  }}>Loading</div>
)

// Rendered when onAuthStateChange fires PASSWORD_RECOVERY.
// User is temporarily authenticated — let them set a new password.
function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function validatePassword(pwd) {
    if (pwd.length < 8)            return 'At least 8 characters required'
    if (!/[A-Z]/.test(pwd))        return 'Must include an uppercase letter'
    if (!/[a-z]/.test(pwd))        return 'Must include a lowercase letter'
    if (!/[0-9]/.test(pwd))        return 'Must include a number'
    if (!/[^A-Za-z0-9]/.test(pwd)) return 'Must include a special character'
    return null
  }

  function pwdRules(pwd) {
    return [
      { ok: pwd.length >= 8,           label: '8+ characters' },
      { ok: /[A-Z]/.test(pwd),         label: 'Uppercase' },
      { ok: /[a-z]/.test(pwd),         label: 'Lowercase' },
      { ok: /[0-9]/.test(pwd),         label: 'Number' },
      { ok: /[^A-Za-z0-9]/.test(pwd),  label: 'Special character' },
    ]
  }

  async function handleReset() {
    const err = validatePassword(password)
    if (err) { setError(err); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSubmitting(true); setError('')
    const { error: supaErr } = await supabase.auth.updateUser({ password })
    if (supaErr) { setError(supaErr.message); setSubmitting(false); return }
    setDone(true)
    setTimeout(onDone, 1500)
  }

  const s = {
    shell:   { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'DM Sans, sans-serif' },
    card:    { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 32px', width: 360, boxShadow: 'var(--shadow)' },
    logo:    { fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 16, fontFamily: 'Syne, sans-serif' },
    logoDot: { color: 'var(--coral)' },
    h2:      { color: 'var(--text)', fontSize: 18, marginTop: 0, marginBottom: 8 },
    sub:     { color: 'var(--muted)', fontSize: 14, marginBottom: 24 },
    input:   { width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'DM Sans, sans-serif' },
    err:     { color: 'var(--red)', fontSize: 13, marginBottom: 12, background: 'var(--red-light)', padding: '8px 12px', borderRadius: 8 },
    rules:   { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', margin: '6px 0 14px', padding: '0 2px' },
    btn:     { width: '100%', padding: '12px', background: 'var(--coral)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' },
    ok:      { color: 'var(--success)', fontSize: 15, textAlign: 'center' },
  }

  return (
    <div style={s.shell}>
      <div style={s.card}>
        <div style={s.logo}>bump<span style={s.logoDot}>.</span></div>
        <h2 style={s.h2}>Set new password</h2>
        <p style={s.sub}>Choose a strong password for your account.</p>
        {done ? (
          <p style={s.ok}>Password updated. Taking you in...</p>
        ) : (
          <>
            {error && <div style={s.err}>{error}</div>}
            <div style={{ marginBottom: 4 }}>
              <input type="password" placeholder="New password" value={password}
                onChange={e => setPassword(e.target.value)} style={s.input} />
            </div>
            {password.length > 0 && (
              <div style={s.rules}>
                {pwdRules(password).map(r => (
                  <span key={r.label} style={{ fontSize: 12, color: r.ok ? 'var(--success)' : 'var(--muted)', fontWeight: r.ok ? 600 : 400 }}>
                    {r.ok ? '✓' : '·'} {r.label}
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <input type="password" placeholder="Confirm new password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()} style={s.input} />
            </div>
            <button onClick={handleReset} disabled={submitting} style={{ ...s.btn, opacity: submitting ? 0.65 : 1 }}>
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ProtectedApp() {
  const { user, profile, loading, recoveryMode, clearRecoveryMode, updateProfile } = useAuth()
  const [page, setPage] = useState('dashboard')

  const isAdmin = profile?.is_admin === true || profile?.role === 'admin'
  // Legacy user auto-heal: accounts created before onboarding_complete was tracked have
  // full_name + terms_accepted_at set but onboarding_complete = false. Treat them as done
  // and silently update the DB so they aren't stranded on the onboarding screen.
  // Legacy user: accepted terms + has ANY profile data = they've already set up their account.
  // full_name alone isn't reliable — some accounts were created before all fields were required.
  const hasProfileData = !!(profile?.full_name || profile?.bank || profile?.usage_type || profile?.gross_income || profile?.net_income)
  const isLegacyUser = !!(profile?.terms_accepted_at && !profile?.onboarding_complete && hasProfileData)
  useEffect(() => {
    if (isLegacyUser && user?.id) updateProfile({ onboarding_complete: true })
  }, [isLegacyUser, user?.id])

  if (loading) return <Loader />
  // Password recovery takes priority — user clicked reset link
  if (recoveryMode) return <ResetPassword onDone={clearRecoveryMode} />
  if (!user) return <Navigate to="/" replace />
  if (!profile?.terms_accepted_at) return <Auth termsOnly />

  if (profile && !profile.onboarding_complete && !isAdmin && !isLegacyUser) {
    return <Onboarding onComplete={() => {}} />
  }

  if (page === 'admin' && (profile?.role === 'admin' || profile?.is_admin)) {
    return <AdminDashboard onBack={() => setPage('dashboard')} />
  }

  if (page === 'book-consult') {
    return <BookConsult onBack={() => setPage('dashboard')} />
  }

  return <Dashboard onNavigate={setPage} />
}

function AuthRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return <Loader />
  if (user && profile?.terms_accepted_at) return <Navigate to="/app" replace />
  return <Auth />
}

function UpdateBanner() {
  const { updateAvailable } = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)
  if (!updateAvailable || dismissed) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--coral)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '12px', padding: '10px 16px',
      fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 500,
    }}>
      <span>A new version of bump. is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#fff', color: 'var(--coral)', border: 'none',
          borderRadius: 6, padding: '4px 12px', fontWeight: 700,
          fontSize: '13px', cursor: 'pointer',
        }}
      >Update now</button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent', color: 'rgba(255,255,255,0.7)',
          border: 'none', fontSize: '18px', cursor: 'pointer',
          lineHeight: 1, padding: '0 4px',
        }}
        aria-label="Dismiss"
      >&#x2715;</button>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TierProvider>
        <UpdateBanner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/"    element={<LandingPage />} />
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/app"  element={<ProtectedApp />} />
              <Route path="/faq"  element={<FAQ />} />
              <Route path="*"     element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TierProvider>
    </AuthProvider>
  )
}
