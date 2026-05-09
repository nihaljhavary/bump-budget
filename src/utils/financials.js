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
export const NON_SPEND_CATS = new Set(['Income', 'Transfer'])

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
 * Excludes Income and Transfer.
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
 * Transfers excluded from spend. Income tracked separately.
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
    } else if (t.category !== 'Transfer') {
      months[m].spend += t.amount
    }
  }
  return months
}

// Income resolution -----------------------------------------------------------

/**
 * Resolve monthly income to a single canonical rands figure.
 *
 * Priority when preferDeclared=true:
 *   1. profile.net_income (cents -> rands)
 *   2. Sum of Income-category transactions
 *
 * Priority when preferDeclared=false:
 *   1. Sum of Income-category transactions
 *   2. profile.net_income (cents -> rands) as fallback
 *
 * @param {Array}   transactions   - transaction objects
 * @param {Object}  profile        - user profile (fields in cents)
 * @param {boolean} preferDeclared - use declared salary first (default true)
 * @returns {{ income: number, source: 'declared'|'transactions'|'none' }}
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

// Full summary ----------------------------------------------------------------

/**
 * Build a complete financial summary from a transaction set.
 *
 * @param {Array}   transactions
 * @param {Object}  profile
 * @param {Object}  opts
 * @param {boolean} opts.preferDeclared  - default true
 *
 * @typedef {Object} FinancialSummary
 * @property {number}  income        - resolved monthly income (rands)
 * @property {string}  incomeSource  - 'declared' | 'transactions' | 'none'
 * @property {number}  txnIncome     - raw sum of Income transactions (rands)
 * @property {number}  totalSpend    - sum of all spend transactions (rands)
 * @property {number}  net           - income - totalSpend
 * @property {Object}  catTotals     - { cat: rands }
 * @property {Array}   spendTxns     - spend-only transactions
 * @property {number}  txnCount      - number of spend transactions
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

// AI payload builder ----------------------------------------------------------

/**
 * Build the canonical AI analysis payload.
 *
 * - Filters Transfer transactions before sending (they inflate spend metrics)
 * - Always provides declaredIncome for AI context
 * - Provides consistent profileContext
 * - Optionally includes budgets, recurringContext, monthlyData, mode
 *
 * Use this for all calls to /.netlify/functions/analyse
 *
 * @param {Array}  transactions  - full transaction set
 * @param {Object} profile       - user profile
 * @param {number} [limit=200]   - max transactions to send
 * @param {Object} [opts]        - optional extra fields
 * @param {Object} [opts.budgets]         - { category: rands } user budgets
 * @param {string} [opts.recurringContext] - compact string from recurringToContext()
 * @param {Object} [opts.monthlyData]     - { 'YYYY-MM': { spend, income } }
 * @param {string} [opts.mode]            - 'overview' | 'analytics' | 'income_statement'
 * @returns payload object for /.netlify/functions/analyse
 */
export function buildAIPayload(transactions, profile, limit = 200, opts = {}) {
  const { budgets, recurringContext, monthlyData, mode } = opts

  const aiTxns = (transactions || [])
    .filter(t => t.category !== 'Transfer')
    .slice(0, limit)

  const declaredIncome = profileCentsToRands(profile?.net_income)

  const profileContext = {
    savings_goal:         profileCentsToRands(profile?.savings_goal),
    monthly_debit_orders: profileCentsToRands(profile?.monthly_debit_orders),
    usage_type:           profile?.usage_type || 'personal',
  }

  const payload = { transactions: aiTxns, declaredIncome, profileContext }

  if (budgets && Object.keys(budgets).length > 0) payload.budgets = budgets
  if (typeof recurringContext === 'string' && recurringContext.length > 0) payload.recurringContext = recurringContext
  if (monthlyData && Object.keys(monthlyData).length > 0) payload.monthlyData = monthlyData
  if (mode) payload.mode = mode

  return payload
}
