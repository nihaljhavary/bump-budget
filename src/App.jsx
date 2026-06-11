import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import BookConsult from './components/BookConsult'
import LandingPage from './components/LandingPage'
import { AuthProvider } from './context/AuthContext'
import { TierProvider } from './context/TierContext'

function ProtectedApp() {
  const { user, profile, loading } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#888',
        background: '#110A08',
      }}>
        Loading
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  if (!profile?.terms_accepted_at) return <Auth termsOnly />

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

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#888',
        background: '#110A08',
      }}>
        Loading
      </div>
    )
  }

  if (user && profile?.terms_accepted_at) return <Navigate to="/app" replace />

  return <Auth />
}

export default function App() {
  return (
    <AuthProvider>
      <TierProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"     element={<LandingPage />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/app"  element={<ProtectedApp />} />
            <Route path="/terms"        element={<LegalPage page="terms" />} />
            <Route path="/privacy"     element={<LegalPage page="privacy" />} />
            <Route path="/refund"      element={<LegalPage page="refund" />} />
            <Route path="/cancellation" element={<LegalPage page="cancellation" />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TierProvider>
    </AuthProvider>
  )
}
