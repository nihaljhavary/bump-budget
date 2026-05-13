/**
 * bump. -- Canonical Transaction Ledger
 * src/utils/ledger.js
 *
 * Single authoritative module for financial summaries across ALL tabs.
 * Every component must derive income, spend, net, and category totals
 * from buildLedgerSummary() -- never from ad-hoc inline calculations.
 *
 * Design principles:
 *   1. Period totals are always raw sums (never averages in disguise).
 *   2. Monthly averages are computed separately and clearly labelled.
 *   3. Declared salary is prorated to the period:
 *        - Calendar-month ranges: declared * monthCount
 *        - Custom date ranges (periodDays supplied): declared * 12/365 * days
 *   4. Transfer transactions are always excluded from spend and income.
 *   5. Tier date filtering is applied before any calculation.
 *   6. Deduplication is opt-in (needed at import time; not re-applied
 *      after data is already in Supabase).
 *
 * Unit conventions (same as financials.js):
 *   Transaction amounts  -> RANDS  (integers)
 *   Profile field values -> CENTS  (divide by 100 to get rands)
 */

import { isDateAllowed } from '../context/TierContext'
import {
  filterSpend, filterIncome, sumByCategory,
  groupByMonth, profileCentsToRands, resolveEffectiveIncome,
} from './financials'

export function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getCalendarMonthRange(month) {
  const [year, monthNum] = month.split('-').map(Number)
  const from = formatLocalDate(new Date(year, monthNum - 1, 1))
  const to = formatLocalDate(new Date(year, monthNum, 0))
  return { from, to }
}

function isLedgerDebugEnabled() {
  try {
    return typeof window !== 'undefined' && (
      window.localStorage?.getItem('bumpLedgerDebug') === '1' ||
      window.sessionStorage?.getItem('bumpLedgerDebug') === '1' ||
      window.location?.search?.includes('ledgerDebug=1')
    )
  } catch {
    return false
  }
}

// -- Deduplication --------------------------------------------------------------

/**
 * Build a stable fingerprint for a transaction.
 */
export function txnFingerprint(txn) {
  const desc = (txn.description || txn.raw_merchant || txn.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const amt = Math.round((txn.amount || 0) * 100) / 100
  return `${txn.date}|${amt}|${desc}`
}

/**
 * Remove duplicate transactions from an array.
 */
export function deduplicateTransactions(transactions) {
  const seen = new Set()
  return (transactions || []).filter(t => {
    const fp = txnFingerprint(t)
    if (seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

/**
 * Build a fingerprint Set from an existing array.
 */
export function buildFingerprintSet(existingTransactions) {
  const set = new Set()
  for (const t of (existingTransactions || [])) {
    if (t.transaction_hash) set.add(t.transaction_hash)
    set.add(txnFingerprint(t))
  }
  return set
}

// -- Tier filter ----------------------------------------------------------------

/**
 * Apply plan-based date restriction to a transaction set.
 */
export function applyTierFilter(transactions, tier) {
  if (!tier) return transactions || []
  return (transactions || []).filter(t => isDateAllowed(t.date, tier))
}

// -- Calendar month helpers -----------------------------------------------------

/**
 * Return the ISO start date of the calendar month N months ago.
 */
export function calendarMonthStart(monthsBack = 0) {
  const now = new Date()
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth() - monthsBack, 1))
}

/** Today's date as YYYY-MM-DD. */
export function today() {
  return formatLocalDate(new Date())
}

/** Return the ISO start date of the CURRENT calendar month. */
export function currentMonthStart() {
  return calendarMonthStart(0)
}

/**
 * Count inclusive calendar months between two ISO dates.
 */
export function countCalendarMonths(fromDate, toDate) {
  if (!fromDate || !toDate) return null
  const [fy, fm] = fromDate.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toDate.slice(0, 7).split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return null
  return Math.max((ty - fy) * 12 + (tm - fm) + 1, 1)
}

/**
 * Count calendar days (inclusive) between two ISO date strings.
 * Returns null if either date is missing.
 */
export function countCalendarDays(fromDate, toDate) {
  if (!fromDate || !toDate) return null
  const msPerDay = 24 * 60 * 60 * 1000
  const f = new Date(fromDate + 'T00:00:00')
  const t = new Date(toDate   + 'T00:00:00')
  if (isNaN(f) || isNaN(t)) return null
  return Math.max(Math.round((t - f) / msPerDay) + 1, 1)
}

// -- Monthly averages -----------------------------------------------------------

/**
 * Compute monthly averages from groupByMonth() output.
 */
export function buildMonthlyAverages(monthlyData) {
  const months = Object.values(monthlyData || {})
  if (months.length === 0) {
    return { avgMonthlySpend: 0, avgMonthlyIncome: 0, monthCount: 0, totalSpend: 0, totalIncome: 0 }
  }
  const totalSpend  = months.reduce((s, m) => s + (m.spend  || 0), 0)
  const totalIncome = months.reduce((s, m) => s + (m.income || 0), 0)
  return {
    avgMonthlySpend:  totalSpend  / months.length,
    avgMonthlyIncome: totalIncome / months.length,
    monthCount:       months.length,
    totalSpend,
    totalIncome,
  }
}

// -- Canonical ledger summary ---------------------------------------------------

/**
 * Build the authoritative financial summary for a transaction set.
 *
 * All tabs -- Overview, Analytics, IncomeStatement, Projections -- must
 * derive their displayed numbers from this function. It guarantees:
 *   - Consistent Transfer exclusion
 *   - Period-aware income resolution (declared salary prorated to period)
 *   - Clear separation of period totals vs monthly averages
 *   - Optional tier filtering and deduplication
 *   - incomeResolutionMode exposed for AI and debug use
 *
 * @param {Array}   transactions  - raw rows from Supabase (amounts in rands)
 * @param {Object}  profile       - user profile (amounts in cents)
 * @param {Object}  [opts]
 * @param {Object}  [opts.tier]              - TierContext; applies date filter if supplied
 * @param {boolean} [opts.dedup=false]       - deduplicate before calculating
 * @param {boolean} [opts.preferDeclared=true] - use declared salary as income source
 * @param {number}  [opts.monthCount]        - explicit inclusive calendar month count
 * @param {number}  [opts.periodDays]        - explicit calendar day count for custom ranges
 * @param {string}  [opts.debugLabel]        - label for forensic console logging
 * @param {string}  [opts.from]              - date range start (ISO)
 * @param {string}  [opts.to]               - date range end (ISO)
 *
 * @typedef {Object} LedgerSummary
 *
 * -- Transaction buckets --
 * @property {Array}   all                  - tier-filtered (+ optionally deduped) transactions
 * @property {Array}   spendTxns            - spend-only (no Income, no Transfer)
 * @property {Array}   incomeTxns           - Income-category only
 * @property {Array}   transferTxns         - Transfer-category only
 * @property {number}  txnCount             - count of spend transactions
 *
 * -- Period totals (always raw sums; use for "actual" figures) --
 * @property {number}  totalSpend           - sum of all spend in period
 * @property {number}  txnIncome            - sum of Income-category transactions
 * @property {number}  income               - resolved income for period
 * @property {string}  incomeSource         - 'declared' | 'transactions' | 'none'
 * @property {string}  incomeResolutionMode - 'declared_prorated' | 'transaction_derived' | 'blended'
 * @property {number}  net                  - income - totalSpend
 * @property {number}  monthCount           - number of distinct calendar months in period
 * @property {number|null} periodDays       - calendar days in period (null if not computed)
 *
 * -- Category and monthly breakdown --
 * @property {Object}  catTotals            - { category: totalRands } spend only
 * @property {Object}  monthlyData          - { 'YYYY-MM': { spend, income } }
 *
 * -- Monthly averages (always clearly separate from totals) --
 * @property {number}  avgMonthlySpend
 * @property {number}  avgMonthlyIncome
 * @property {number}  declaredMonthlyIncome - profile.net_income in rands (monthly)
 * @property {number}  resolvedMonthlyIncome - income / monthCount
 *
 * @returns {LedgerSummary}
 */
export function buildLedgerSummary(transactions, profile, opts = {}) {
  const {
    tier,
    dedup = false,
    preferDeclared = true,
    monthCount: explicitMonthCount,
    periodDays: explicitPeriodDays,
    debugLabel = '',
    from = '',
    to = '',
  } = opts

  // -- Step 1: Tier date filter --
  let txns = tier ? applyTierFilter(transactions, tier) : (transactions || [])

  // -- Step 2: Optional deduplication --
  if (dedup) txns = deduplicateTransactions(txns)

  // -- Step 3: Partition into buckets --
  const spendTxns    = filterSpend(txns)
  const incomeTxns   = filterIncome(txns)
  const transferTxns = txns.filter(t => t?.category === 'Transfer')

  // -- Step 4: Period totals --
  const totalSpend = spendTxns.reduce((s, t) => s + (t.amount || 0), 0)
  const txnIncome  = incomeTxns.reduce((s, t) => s + (t.amount || 0), 0)

  // -- Step 5: Category and monthly breakdown --
  const catTotals   = sumByCategory(txns)
  const monthlyData = groupByMonth(txns)
  const monthCount  = Math.max(explicitMonthCount || Object.keys(monthlyData).length, 1)

  // -- Step 6: Compute periodDays if possible --
  // Use explicit if provided; fall back to computing from from/to strings.
  let periodDays = explicitPeriodDays ?? null
  if (periodDays === null && from && to) {
    const msPerDay = 24 * 60 * 60 * 1000
    const f = new Date(from + 'T00:00:00')
    const t2 = new Date(to  + 'T00:00:00')
    if (!isNaN(f) && !isNaN(t2)) {
      periodDays = Math.max(Math.round((t2 - f) / msPerDay) + 1, 1)
    }
  }

  // -- Step 7: Period-aware income resolution via canonical resolver --
  const resolution = resolveEffectiveIncome(txns, profile, {
    preferDeclared,
    periodDays,
    monthCount,
  })
  const {
    income,
    incomeResolutionMode,
    incomeSource,
    declaredMonthlyIncome: declaredMonthly,
  } = resolution

  // -- Step 8: Net position --
  const net = income - totalSpend

  // -- Step 9: Monthly averages --
  const { avgMonthlySpend, avgMonthlyIncome } = buildMonthlyAverages(monthlyData)
  const resolvedMonthlyIncome = monthCount > 0 ? income / monthCount : income

  if (debugLabel && isLedgerDebugEnabled()) {
    const excludedTxns = txns.filter(t => t?.category === 'Income' || t?.category === 'Transfer' || t?.category === 'Savings')
    console.groupCollapsed(`[bump ledger] ${debugLabel}`)
    console.log({
      boundaries: { from, to },
      periodDays,
      monthCount,
      incomeResolutionMode,
      transactionCount: txns.length,
      income,
      txnIncome,
      totalSpend,
      transferTotal: transferTxns.reduce((s, t) => s + (t.amount || 0), 0),
      savingsTotal: txns.filter(t => t?.category === 'Savings').reduce((s, t) => s + (t.amount || 0), 0),
      excludedTotal: excludedTxns.reduce((s, t) => s + (t.amount || 0), 0),
      catTotals,
    })
    console.groupEnd()
  }

  return {
    // Transaction buckets
    all:           txns,
    spendTxns,
    incomeTxns,
    transferTxns,
    txnCount:      spendTxns.length,

    // Period totals -- use for "actual" and "income statement" views
    totalSpend,
    txnIncome,
    income,
    incomeSource,
    incomeResolutionMode,
    net,
    monthCount,
    periodDays,

    // Category and monthly breakdown
    catTotals,
    monthlyData,

    // Monthly averages -- use for projections, averages, forecasting
    // NEVER use these where period totals are expected (and vice versa)
    avgMonthlySpend,
    avgMonthlyIncome,
    declaredMonthlyIncome: declaredMonthly,
    resolvedMonthlyIncome,
  }
}
