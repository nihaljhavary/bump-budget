import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await ensureProfile(session.user)
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function ensureProfile(authUser) {
    try {
      await supabase.from('profiles').upsert(
        { id: authUser.id, email: authUser.email },
        { onConflict: 'id', ignoreDuplicates: true }
      )
    } catch (err) {
      console.error('Profile ensure error:', err)
    }
  }

  async function fetchProfile(userId) {
    try {
      const SELECT = 'id, email, full_name, subscription_plan, subscription_tier, ' +
        'subscription_status, is_admin, role, terms_accepted_at, terms_version, ' +
        'free_consult_used, next_billing_date, onboarding_complete, gross_income, ' +
        'net_income, monthly_debit_orders, savings_goal, bank, has_discovery_vitality, ' +
        'vitality_cashback_pct, usage_type'
      const { data, error } = await supabase
        .from('profiles')
        .select(SELECT)
        .eq('id', userId)
        .single()

      if (error && error.code === 'PGRST116') {
        const { data: newProfile } = await supabase
          .from('profiles')
          .upsert({ id: userId }, { onConflict: 'id' })
          .select()
          .single()
        setProfile(newProfile)
      } else if (data) {
        setProfile(data)
      }
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
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      return { data, error: null }
    } catch (err) {
      console.error('Profile update error:', err)
      return { data: null, error: err }
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
