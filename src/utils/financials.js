/**
 * bump. -- Shared Financial Calculation Layer
 * src/utils/financials.js
 *
 * Single source of truth for all financial calculations across the app.
 * Import from here instead of duplicating logic in components.
 *
 * Unit conventions:
 *   Transaction amounts   -> RANDS  (integer, e.g. 340 for R340)
 *   Profile field values  -> CENTS  (integer, e.g. 3500000 for R35 000)
 *                           Use profileCentsToRands() to convert.
 *
 * All functions accept and return RANDS unless noted.
 */

// Category sets ----------------------------------------------------------------

/** Categories that are NEVER lifestyle spend */
export const NON_SPEND_CATS = new Set(['Income', 'Transfer', 'Savings'])

/** All recognised spend categories */
export const SPEND_CATEGORIES = [
  'Housing', 'Groceries', 'Eating out', 'Transport', 'Entertainment',
  'Health', 'Clothing', 'Subscriptions', 'Education', 'Insurance',
  'Savings', 'Fuel', 'ATM / Cash', 'Fees & Charges', 'Utilities',
  'Travel', 'Gifts', 'Home & Garden', 'Other',
]

// Unit helpers -----------------------------------------------------------------

/**
 * Convert a profile cents field to rands.
 * Profile fields (net_income, savings_goal, monthly_debit_orders) are stored
 * as integer cents in Supabase.
 */
export function profileCentsToRands(cents) {
  return cents ? Math.round(cents / 100) : 0
}

/** Format rands for display -- e.g. 15000 -> "R15 000" */
export function fmtRands(n) {
  return 'R' + Math.round(n).toLocaleString('en-ZA')
}

/** Format a profile cents field for display -- e.g. 1500000 -> "R15 000" */
export function fmtCents(n) {
  return fmtRands(profileCentsToRands(n))
}

// Transaction filters ----------------------------------------------------------

/** True if a transaction counts as lifestyle spend (not Income, not Transfer) */
export function isSpend(txn) {
  return !NON_SPEND_CATS.has(txn?.category)
}

/** Filter to spend-only transactions (excludes Income + Transfer) */
export function filterSpend(transactions) {
  return (transactions || []).filter(isSpend)
}

/** Filter to income-only transactions */
export function filterIncome(transactions) {
  return (transactions || []).filter(t => t?.category === 'Income')
}

// Summation helpers ------------------------------------------------------------

/** Sum of all spend transaction amounts (rands). Excludes Income + Transfer. */
export function sumSpend(transactions) {
  return filterSpend(transactions).reduce((s, t) => s + t.amount, 0)
}

/** Sum of all income transaction amounts (rands). */
export function sumTxnIncome(transactions) {
  return filterIncome(transactions).reduce((s, t) => s + t.amount, 0)
}

/**
 * Build category totals from transactions.
 * Excludes Income, Transfer, and Savings.
 * @returns {Object} { categoryName: totalRands }
 */
export function sumByCategory(transactions) {
  const cats = {}
  for (const t of filterSpend(transactions)) {
    cats[t.category] = (cats[t.category] || 0) + t.amount
  }
  return cats
}

/**
 * Group transactions by calendar month.
 * Transfers and savings excluded from spend. Income tracked separately.
 * @returns {Object} { 'YYYY-MM': { spend: number, income: number } }
 */
export function groupByMonth(transactions) {
  const months = {}
  for (const t of (transactions || [])) {
    const m = t.date?.slice(0, 7)
    if (!m) continue
    if (!months[m]) months[m] = { spend: 0, income: 0 }
    if (t.category === 'Income') {
      months[m].income += t.amount
    } else if (isSpend(t)) {
      months[m].spend += t.amount
    }
  }
  return months
}

// Income resolution -----------------------------------------------------------

/**
 * Resolve monthly income to a single canonical rands figure.
 * (Legacy helper -- prefer resolveEffectiveIncome for new code.)
 */
export function resolveIncome(transactions, profile, preferDeclared = true) {
  const declared = profileCentsToRands(profile?.net_income)
  const fromTxns  = sumTxnIncome(transactions)

  if (preferDeclared && declared > 0) {
    return { income: declared, source: 'declared' }
  }
  if (fromTxns > 0) {
    return { income: fromTxns, source: 'transactions' }
  }
  if (declared > 0) {
    return { income: declared, source: 'declared' }
  }
  return { income: 0, source: 'none' }
}

/**
 * Canonical effective income resolver for a selected period.
 *
 * Supports three resolution modes:
 *   declared_prorated  -- declared monthly salary, prorated to the period
 *   transaction_derived -- sum of Income-category transactions in period
 *   blended            -- declared income used as reference; txn income present but declared preferred
 *
 * Custom-date proration (when periodDays supplied):
 *   dailyIncome    = (declaredMonthly * 12) / 365
 *   effectiveIncome = dailyIncome * periodDays
 *
 * Calendar-month proration (when monthCount supplied, no periodDays):
 *   effectiveIncome = declaredMonthly * monthCount
 *
 * @param {Array}   transactions
 * @param {Object}  profile             - user profile (amounts in cents)
 * @param {Object}  opts
 * @param {boolean} [opts.preferDeclared=true]
 * @param {number}  [opts.periodDays]   - precise calendar days (for custom ranges)
 * @param {number}  [opts.monthCount=1] - months in period (fallback)
 *
 * @returns {{
 *   income: number,
 *   incomeResolutionMode: 'declared_prorated'|'transaction_derived'|'blended',
 *   incomeSource: 'declared'|'transactions'|'none',
 *   declaredMonthlyIncome: number,
 *   txnIncome: number,
 * }}
 */
export function resolveEffectiveIncome(transactions, profile, opts = {}) {
  const { preferDeclared = true, periodDays = null, monthCount = 1 } = opts

  const declaredMonthly = profileCentsToRands(profile?.net_income)
  const txnIncome       = sumTxnIncome(transactions)

  // Compute declared amount scaled to period
  let declaredPeriod = 0
  if (declaredMonthly > 0) {
    if (periodDays != null && periodDays > 0) {
      // Day-precise annual proration: avoids month-boundary rounding errors for custom ranges
      declaredPeriod = Math.round((declaredMonthly * 12 / 365) * periodDays)
    } else {
      // Calendar-month scale: correct for 1m/3m/6m/12m buttons
      declaredPeriod = declaredMonthly * Math.max(monthCount, 1)
    }
  }

  // Resolve mode
  if (preferDeclared && declaredPeriod > 0 && txnIncome > 0) {
    // Both present: prefer declared, note blended
    return {
      income: declaredPeriod,
      incomeResolutionMode: 'blended',
      incomeSource: 'declared',
      declaredMonthlyIncome: declaredMonthly,
      txnIncome,
    }
  }

  if (preferDeclared && declaredPeriod > 0) {
    return {
      income: declaredPeriod,
      incomeResolutionMode: 'declared_prorated',
      incomeSource: 'declared',
      declaredMonthlyIncome: declaredMonthly,
      txnIncome,
    }
  }

  if (txnIncome > 0) {
    return {
      income: txnIncome,
      incomeResolutionMode: 'transaction_derived',
      incomeSource: 'transactions',
      declaredMonthlyIncome: declaredMonthly,
      txnIncome,
    }
  }

  if (declaredPeriod > 0) {
    // Fallback: declared even when preferDeclared=false (no txn income)
    return {
      income: declaredPeriod,
      incomeResolutionMode: 'declared_prorated',
      incomeSource: 'declared',
      declaredMonthlyIncome: declaredMonthly,
      txnIncome: 0,
    }
  }

  return {
    income: 0,
    incomeResolutionMode: 'transaction_derived',
    incomeSource: 'none',
    declaredMonthlyIncome: 0,
    txnIncome: 0,
  }
}

// Full summary ----------------------------------------------------------------

/**
 * Build a complete financial summary from a transaction set.
 * (Thin wrapper -- prefer buildLedgerSummary from ledger.js for full output.)
 */
export function buildFinancialSummary(transactions, profile, opts = {}) {
  const { preferDeclared = true } = opts
  const spendTxns  = filterSpend(transactions)
  const catTotals  = sumByCategory(transactions)
  const totalSpend = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const txnIncome  = sumTxnIncome(transactions)
  const { income, source: incomeSource } = resolveIncome(transactions, profile, preferDeclared)
  const net = income - totalSpend

  return {
    income,
    incomeSource,
    txnIncome,
    totalSpend,
    net,
    catTotals,
    spendTxns,
    txnCount: spendTxns.length,
  }
}

// Merchant intelligence -------------------------------------------------------

/**
 * Build a top-merchants array from spend transactions.
 * Groups by merchant name, sums totals, counts occurrences.
 * Suitable for direct inclusion in AI payloads.
 *
 * @param {Array}  spendTxns  - spend-only transactions (no Income/Transfer)
 * @param {number} [limit=15] - max merchants to return
 * @returns {Array<{ name, category, total, count, pctOfSpend }>}
 */
export function buildTopMerchants(spendTxns, limit = 15) {
  const totalSpend = spendTxns.reduce((s, t) => s + (t.amount || 0), 0)
  const map = {}
  for (const t of spendTxns) {
    const key = (t.name || t.description || 'Unknown').trim()
    if (!map[key]) map[key] = { name: key, category: t.category, total: 0, count: 0 }
    map[key].total += t.amount || 0
    map[key].count++
    // Keep category of largest transaction for this merchant
    if ((t.amount || 0) > (map[key]._maxAmt || 0)) {
      map[key]._maxAmt = t.amount
      map[key].category = t.category
    }
  }
  return Object.values(map)
    .map(m => ({
      name:       m.name,
      category:   m.category,
      total:      Math.round(m.total),
      count:      m.count,
      pctOfSpend: totalSpend > 0 ? Math.round((m.total / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/**
 * Build per-category merchant breakdowns for AI context.
 * Returns the top N merchants per category with their share of that category.
 *
 * @param {Array}  spendTxns
 * @param {number} [topN=3]    - merchants per category
 * @returns {Object} { 'Eating out': [{ name, total, count, pctOfCategory }], ... }
 */
export function buildCategoryMerchantMap(spendTxns, topN = 3) {
  const catMap = {}
  for (const t of spendTxns) {
    const cat = t.category || 'Other'
    if (!catMap[cat]) catMap[cat] = {}
    const key = (t.name || t.description || 'Unknown').trim()
    if (!catMap[cat][key]) catMap[cat][key] = { name: key, total: 0, count: 0 }
    catMap[cat][key].total += t.amount || 0
    catMap[cat][key].count++
  }

  const result = {}
  for (const [cat, merchants] of Object.entries(catMap)) {
    const catTotal = Object.values(merchants).reduce((s, m) => s + m.total, 0)
    result[cat] = Object.values(merchants)
      .sort((a, b) => b.total - a.total)
      .slice(0, topN)
      .map(m => ({
        name:          m.name,
        total:         Math.round(m.total),
        count:         m.count,
        pctOfCategory: catTotal > 0 ? Math.round((m.total / catTotal) * 100) : 0,
      }))
  }
  return result
}

// AI payload builder ----------------------------------------------------------

/**
 * Build the canonical AI analysis payload.
 *
 * - Filters non-spend transactions before sending (they inflate spend metrics)
 * - Always provides declaredIncome for AI context
 * - Provides consistent profileContext
 * - Optionally includes budgets, recurringContext, monthlyData, mode,
 *   topMerchants, incomeResolutionMode, effectiveIncome, periodDays, periodLabel
 *
 * Use this for all calls to /.netlify/functions/analyse
 *
 * @param {Array}  transactions  - full transaction set (spend + income)
 * @param {Object} profile       - user profile
 * @param {number} [limit=200]   - max spend transactions to send
 * @param {Object} [opts]        - optional extra fields
 * @param {Object} [opts.budgets]              - { category: rands }
 * @param {string} [opts.recurringContext]     - from recurringToContext()
 * @param {Object} [opts.monthlyData]          - { 'YYYY-MM': { spend, income } }
 * @param {string} [opts.mode]                 - 'overview'|'analytics'|'income_statement'
 * @param {Array}  [opts.topMerchants]         - from buildTopMerchants()
 * @param {string} [opts.incomeResolutionMode] - from resolveEffectiveIncome()
 * @param {number} [opts.effectiveIncome]      - resolved period income (rands)
 * @param {number} [opts.periodDays]           - days in period (for custom ranges)
 * @param {string} [opts.periodLabel]          - human-readable period label
 * @returns payload object for /.netlify/functions/analyse
 */
export function buildAIPayload(transactions, profile, limit = 200, opts = {}) {
  const {
    budgets, recurringContext, monthlyData, mode,
    topMerchants, incomeResolutionMode, effectiveIncome, periodDays, periodLabel,
  } = opts

  const aiTxns = (transactions || [])
    .filter(isSpend)
    .slice(0, limit)

  const declaredIncome = profileCentsToRands(profile?.net_income)

  const profileContext = {
    savings_goal:         profileCentsToRands(profile?.savings_goal),
    monthly_debit_orders: profileCentsToRands(profile?.monthly_debit_orders),
    usage_type:           profile?.usage_type || 'personal',
    additional_income:    profileCentsToRands(profile?.additional_income),
    savings_balance:      profileCentsToRands(profile?.savings_balance),
  }

  const payload = { transactions: aiTxns, declaredIncome, profileContext }

  if (budgets && Object.keys(budgets).length > 0) payload.budgets = budgets
  if (typeof recurringContext === 'string' && recurringContext.length > 0) payload.recurringContext = recurringContext
  if (monthlyData && Object.keys(monthlyData).length > 0) payload.monthlyData = monthlyData
  if (mode) payload.mode = mode

  // Enhanced AI context fields
  if (topMerchants && topMerchants.length > 0) payload.topMerchants = topMerchants.slice(0, 15)
  if (incomeResolutionMode) payload.incomeResolutionMode = incomeResolutionMode
  if (effectiveIncome != null) payload.effectiveIncome = effectiveIncome
  if (periodDays != null) payload.periodDays = periodDays
  if (periodLabel) payload.periodLabel = periodLabel

  return payload
}
