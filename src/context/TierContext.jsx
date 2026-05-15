import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

// ── Plan configuration ────────────────────────────────────────────────────────
export const PLANS = {
  free:    { label: 'Free',    price: 0,     days: 30,       rules: false, consult: false, analytics: false, projections: false, groceries: false },
  starter: { label: 'Starter', price: 4900,  days: 90,       rules: false, consult: false, analytics: true,  projections: false, groceries: false },
  growth:  { label: 'Growth',  price: 9900,  days: 365,      rules: true,  consult: false, analytics: true,  projections: true,  groceries: true  },
  pro:     { label: 'Pro',     price: 19900, days: Infinity,  rules: true,  consult: true,  analytics: true,  projections: true,  groceries: true  },
}

export const PLAN_PRICES = {
  starter: 'R49/mo',
  growth:  'R99/mo',
  pro:     'R199/mo',
}

// Which plan first unlocks a feature (for upgrade prompts)
export const FEATURE_UNLOCKED_BY = {
  rules:         'growth',
  consult:       'pro',
  extended_days: 'starter',
  unlimited:     'pro',
  analytics:     'starter',
  projections:   'growth',
  groceries:     'growth',
}

const TierContext = createContext({})

export function TierProvider({ children }) {
  const { profile } = useAuth()
  const [simulatedPlan, setSimulatedPlanState] = useState(() => {
    try { return localStorage.getItem('bumpSimPlan') || null } catch { return null }
  })

  const setSimulatedPlan = useCallback((plan) => {
    setSimulatedPlanState(plan)
    try {
      if (plan) localStorage.setItem('bumpSimPlan', plan)
      else localStorage.removeItem('bumpSimPlan')
    } catch {}
  }, [])

  const tier = useMemo(() => {
    if (!profile) return buildTier('free', false, null)

    const isAdmin = profile.is_admin === true || profile.role === 'admin'

    // Admin simulating a plan
    if (isAdmin && simulatedPlan) {
      return { ...buildTier(simulatedPlan, false, null), simulating: simulatedPlan }
    }

    if (isAdmin) return buildTier('admin', true, null)

    const plan = profile.subscription_plan || 'free'
    const status = profile.subscription_status || 'active'
    const effectivePlan = status === 'active' ? plan : 'free'
    return buildTier(effectivePlan, false, null)
  }, [profile, simulatedPlan])

  return (
    <TierContext.Provider value={{ ...tier, simulatedPlan, setSimulatedPlan }}>
      {children}
    </TierContext.Provider>
  )
}

function buildTier(plan, isAdmin) {
  if (isAdmin) {
    return {
      plan: 'admin',
      isAdmin: true,
      days: Infinity,
      canRules: true,
      canConsult: true,
      canAnalytics: true,
      canProjections: true,
      canGroceries: true,
      freeConsultUsed: false,
      cutoffDate: null,
      simulating: null,
      can: () => true,
      upgradeFor: () => null,
    }
  }

  const config = PLANS[plan] || PLANS.free
  const cutoffDate = config.days === Infinity
    ? null
    : new Date(Date.now() - config.days * 24 * 60 * 60 * 1000)

  return {
    plan,
    isAdmin: false,
    days: config.days,
    canRules: config.rules,
    canConsult: config.consult,
    canAnalytics: config.analytics,
    canProjections: config.projections,
    canGroceries: config.groceries,
    freeConsultUsed: false,
    cutoffDate,
    simulating: null,
    can(feature) {
      if (feature === 'rules')       return config.rules
      if (feature === 'consult')     return config.consult
      if (feature === 'analytics')   return config.analytics
      if (feature === 'projections') return config.projections
      if (feature === 'groceries')   return config.groceries
      if (feature === 'upload')      return true
      return true
    },
    upgradeFor(feature) {
      if (this.can(feature)) return null
      return FEATURE_UNLOCKED_BY[feature] || 'starter'
    },
  }
}

export function useTier() {
  return useContext(TierContext)
}

// Helper: is a date within the tier's allowed window?
export function isDateAllowed(date, tier) {
  if (tier.isAdmin || !tier.cutoffDate) return true
  return new Date(date) >= tier.cutoffDate
}
