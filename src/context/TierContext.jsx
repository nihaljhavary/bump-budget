import { createContext, useContext, useMemo } from 'react'
import { useAuth } from './AuthContext'

// ── Plan configuration ────────────────────────────────────────────────────────
export const PLANS = {
  free:    { label: 'Free',    price: 0,     days: 30,       rules: false, consult: false },
  starter: { label: 'Starter', price: 4900,  days: 90,       rules: false, consult: false },
  growth:  { label: 'Growth',  price: 9900,  days: 365,      rules: true,  consult: false },
  pro:     { label: 'Pro',     price: 19900, days: Infinity,  rules: true,  consult: true  },
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
}

const TierContext = createContext({})

export function TierProvider({ children }) {
  const { profile } = useAuth()

  const tier = useMemo(() => {
    if (!profile) return buildTier('free', false)

    const isAdmin = profile.is_admin === true || profile.role === 'admin'
    if (isAdmin) return buildTier('admin', true)

    const plan = profile.subscription_plan || 'free'
    const status = profile.subscription_status || 'active'
    // If subscription lapsed, treat as free
    const effectivePlan = status === 'active' ? plan : 'free'
    return buildTier(effectivePlan, false)
  }, [profile])

  return (
    <TierContext.Provider value={tier}>
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
      freeConsultUsed: false,
      cutoffDate: null,
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
    freeConsultUsed: false, // overridden by profile.free_consult_used in component
    cutoffDate,
    can(feature) {
      if (feature === 'rules')   return config.rules
      if (feature === 'consult') return config.consult
      if (feature === 'upload')  return true // all tiers
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
