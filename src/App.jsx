import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import BookConsult from './components/BookConsult'
import { AuthProvider } from './context/AuthContext'
import { TierProvider } from './context/TierContext'

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888'
      }}>
        Loading...
      </div>
    )
  }

  if (!user) return <Auth />

  // Block access until T&Cs accepted — show Auth in terms-pending mode
  if (!profile?.terms_accepted_at) return <Auth termsOnly />

  if (page === 'admin' && (profile?.role === 'admin' || profile?.is_admin)) {
    return <AdminDashboard onBack={() => setPage('dashboard')} />
  }

  if (page === 'book-consult') {
    return <BookConsult onBack={() => setPage('dashboard')} />
  }

  return <Dashboard onNavigate={setPage} />
}

export default function App() {
  return (
    <AuthProvider>
      <TierProvider>
        <AppInner />
      </TierProvider>
    </AuthProvider>
  )
}
