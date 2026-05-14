import { useState } from 'react'
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
import { AuthProvider } from './context/AuthContext'
import { TierProvider } from './context/TierContext'

const Loader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#888',
    background: '#110A08',
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

  async function handleReset() {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSubmitting(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setSubmitting(false); return }
    setDone(true)
    setTimeout(onDone, 1500)
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    background: '#231816', border: '1px solid #3a2e2a', borderRadius: 8,
    color: '#e8d5c4', fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#110A08' }}>
      <div style={{ background: '#1a1210', borderRadius: 16, padding: '40px 32px', width: 360, fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#e8d5c4', marginBottom: 16 }}>
          bump<span style={{ color: '#e85d26' }}>.</span>
        </div>
        <h2 style={{ color: '#e8d5c4', fontSize: 18, marginTop: 0, marginBottom: 8 }}>Set new password</h2>
        <p style={{ color: '#999', fontSize: 14, marginBottom: 24 }}>Choose a new password for your account.</p>
        {done ? (
          <p style={{ color: '#4ade80', textAlign: 'center', fontSize: 15 }}>Password updated. Taking you in...</p>
        ) : (
          <>
            {error && <div style={{ color: '#e85d26', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
              <input type="password" placeholder="New password (6+ chars)" value={password}
                onChange={e => setPassword(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <input type="password" placeholder="Confirm new password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()} style={inputStyle} />
            </div>
            <button onClick={handleReset} disabled={submitting} style={{
              width: '100%', padding: '12px', background: '#e85d26', border: 'none',
              borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 15,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ProtectedApp() {
  const { user, profile, loading, recoveryMode, clearRecoveryMode } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (loading) return <Loader />
  // Password recovery takes priority — user clicked reset link
  if (recoveryMode) return <ResetPassword onDone={clearRecoveryMode} />
  if (!user) return <Navigate to="/" replace />
  if (!profile?.terms_accepted_at) return <Auth termsOnly />

  const isAdmin = profile?.is_admin === true || profile?.role === 'admin'
  if (profile && !profile.onboarding_complete && !isAdmin) {
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
      background: '#e85d26', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '12px', padding: '10px 16px',
      fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 500,
    }}>
      <span>A new version of bump. is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#fff', color: '#e85d26', border: 'none',
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
          <Routes>
            <Route path="/"    element={<LandingPage />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/app"  element={<ProtectedApp />} />
            <Route path="*"     element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TierProvider>
    </AuthProvider>
  )
}
