import { useAuth } from './context/AuthContext'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import { AuthProvider } from './context/AuthContext'

function AppInner() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888'
      }}>
        Loading…
      </div>
    )
  }

  return user ? <Dashboard /> : <Auth />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
