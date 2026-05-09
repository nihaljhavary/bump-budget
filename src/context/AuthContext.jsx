import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    // If the URL contains pending auth exchange params (PKCE code or hash token),
    // keep loading=true until onAuthStateChange delivers the resolved session.
    // This prevents the race where getSession() returns null before the exchange
    // completes, causing ProtectedApp to redirect to "/" before auth resolves.
    const url = window.location.href
    const hasAuthParams =
      url.includes('access_token') ||
      url.includes('?code=') ||
      url.includes('&code=') ||
      url.includes('type=recovery')

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else if (!hasAuthParams) {
        // No session and no pending token exchange — loading complete
        setLoading(false)
      }
      // If hasAuthParams and session is null: stay loading, wait for onAuthStateChange
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setUser(session?.user ?? null)
        setLoading(false)
        return
      }
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    // Safety valve: if the auth exchange hangs (expired/invalid link), unblock after 8s
    const timeout = hasAuthParams ? setTimeout(() => setLoading(false), 8000) : null

    return () => {
      subscription.unsubscribe()
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, subscription_plan, subscription_status, is_admin, terms_accepted_at, free_consult_used, next_billing_date')
        .eq('id', userId)
        .single()
      setProfile(data)
    } catch (err) {
      console.error('Profile fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  async function updateProfile(updates) {
    if (!user) return { error: new Error('Not authenticated') }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...updates }, { onConflict: 'id' })
    if (!error) await fetchProfile(user.id)
    return { error }
  }

  function clearRecoveryMode() {
    setRecoveryMode(false)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, updateProfile, recoveryMode, clearRecoveryMode }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
