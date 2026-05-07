import { createContext, useContext, useMemo } from 'react'
import { useAuth } from './AuthContext'

// ── Plan configuration ────────────────────────────────────────────────────────
export const PLANS = {
  free:         { label: 'Free',          price: 0,     days: 30,      rules: false, consult: false, aiQA: 10 },
  starter:      { label: 'Starter',       price: 4900,  days: 90,      rules: false, consult: false, aiQA: 50 },
  budget_coach: { label: 'Budget Coach',  price: 9900,  days: 365,     rules: true,  consult: false, aiQA: Infinity },
  growth:       { label: 'Growth',        price: 9900,  days: 365,     rules: true,  consult: false, aiQA: Infinity },
  pro:          { label: 'Pro',           price: 19900, days: Infinity, rules: true,  consult: true,  aiQA: Infinity },
}

export const PLAN_PRICES = {
  starter:      'R49/mo',
  budget_coach: 'R99/mo',
  growth:       'R99/mo',
  pro:          'R199/mo',
}

// Feature access matrix
const FEATURE_MAP = {
  upload:            ['free', 'starter', 'budget_coach', 'growth', 'pro', 'admin'],
  overview_tab:      ['free', 'starter', 'budget_coach', 'growth', 'pro', 'admin'],
  consult_booking:   ['free', 'starter', 'budget_coach', 'growth', 'pro', 'admin'],
  analytics_full:    ['budget_coach', 'growth', 'pro', 'admin'],
  income_statement_full: ['budget_coach', 'growth', 'pro', 'admin'],
  grocery_compare:   ['budget_coach', 'growth', 'pro', 'admin'],
  projections:       ['budget_coach', 'growth', 'pro', 'admin'],
  rules:             ['budget_coach', 'growth', 'pro', 'admin'],
  ai_unlimited:      ['budget_coach', 'growth', 'pro', 'admin'],
  consult:           ['pro', 'admin'],
}

export const FEATURE_UNLOCKED_BY = {
  analytics_full:           'budget_coach',
  income_statement_full:    'budget_coach',
  grocery_compare:          'budget_coach',
  projections:              'budget_coach',
  rules:                    'budget_coach',
  ai_unlimited:             'budget_coach',
  consult:                  'pro',
}

const TierContext = createContext({})

export function TierProvider({ children }) {
  const { profile } = useAuth()

  const tier = useMemo(() => {
    if (!profile) return buildTier('free', false)

    const isAdmin = profile.is_admin === true || profile.role === 'admin'
    if (isAdmin) return buildTier('admin', true)

    const plan = profile.subscription_plan || profile.subscription_tier || 'free'
    const status = profile.subscription_status || 'active'
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
      label: 'Admin',
      isAdmin: true,
      isPaid: true,
      days: Infinity,
      canRules: true,
      canConsult: true,
      aiQALimit: Infinity,
      cutoffDate: null,
      can: () => true,
      upgradeFor: () => null,
    }
  }

  const config = PLANS[plan] || PLANS.free
  const cutoffDate = config.days === Infinity
    ? null
    : new Date(Date.now() - config.days * 24 * 60 * 60 * 1000)

  const allowedFeatures = new Set(
    Object.entries(FEATURE_MAP)
      .filter(([, plans]) => plans.includes(plan))
      .map(([feature]) => feature)
  )

  const isPaid = plan !== 'free'

  return {
    plan,
    label: config.label,
    isAdmin: false,
    isPaid,
    days: config.days,
    canRules: config.rules,
    canConsult: config.consult,
    aiQALimit: config.aiQA,
    cutoffDate,
    can(feature) {
      if (feature === 'upload') return true
      if (feature === 'overview_tab') return true
      return allowedFeatures.has(feature)
    },
    upgradeFor(feature) {
      if (this.can(feature)) return null
      return FEATURE_UNLOCKED_BY[feature] || 'budget_coach'
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
