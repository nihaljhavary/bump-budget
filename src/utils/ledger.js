/**
 * bump. — Canonical Transaction Ledger
 * src/utils/ledger.js
 *
 * Single authoritative module for financial summaries across ALL tabs.
 * Every component must derive income, spend, net, and category totals
 * from buildLedgerSummary() — never from ad-hoc inline calculations.
 *
 * Design principles:
 *   1. Period totals are always raw sums (never averages in disguise).
 *   2. Monthly averages are computed separately and clearly labelled.
 *   3. Declared salary is scaled to the period (×monthCount) when used
 *      as a fallback — so a 3-month view shows R35k×3=R105k, not R35k.
 *   4. Transfer transactions are always excluded from spend and income.
 *   5. Tier date filtering is applied before any calculation.
 *   6. Deduplication is opt-in (needed at import time; not re-applied
 *      after data is already in Supabase).
 *
 * Unit conventions (same as financials.js):
 *   Transaction amounts  → RANDS  (integers)
 *   Profile field values → CENTS  (divide by 100 to get rands)
 */

import { isDateAllowed } from '../context/TierContext'
import {
  filterSpend, filterIncome, sumByCategory,
  groupByMonth, profileCentsToRands,
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

// ── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Build a stable fingerprint for a transaction.
 * Two rows with the same fingerprint are considered duplicates.
 * Used both at import time and to check against existing rows.
 *
 * @param {{ date, amount, description, name }} txn
 * @returns {string}
 */
export function txnFingerprint(txn) {
  // Align with ImportTransactions + DB rows: raw_merchant is the canonical statement text
  const desc = (txn.description || txn.raw_merchant || txn.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  // Round amount to 2dp to avoid floating-point key collisions
  const amt = Math.round((txn.amount || 0) * 100) / 100
  return `${txn.date}|${amt}|${desc}`
}

/**
 * Remove duplicate transactions from an array.
 * Keeps the first occurrence of each fingerprint.
 * Safe to run on both pre-insert and post-fetch data.
 *
 * @param {Array} transactions
 * @returns {Array}
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
 * Used to check incoming rows against already-stored data.
 *
 * @param {Array} existingTransactions
 * @returns {Set<string>}
 */
export function buildFingerprintSet(existingTransactions) {
  const set = new Set()
  for (const t of (existingTransactions || [])) {
    if (t.transaction_hash) set.add(t.transaction_hash)
    set.add(txnFingerprint(t))
  }
  return set
}

// ── Tier filter ────────────────────────────────────────────────────────────────

/**
 * Apply plan-based date restriction to a transaction set.
 * Mirrors the filter applied in Dashboard.jsx allowedTransactions.
 * Must be applied consistently across Analytics, Projections, IncomeStatement.
 *
 * @param {Array}   transactions
 * @param {Object}  tier  - from useTier()
 * @returns {Array}
 */
export function applyTierFilter(transactions, tier) {
  if (!tier) return transactions || []
  return (transactions || []).filter(t => isDateAllowed(t.date, tier))
}

// ── Calendar month helpers ─────────────────────────────────────────────────────

/**
 * Return the ISO start date of the calendar month N months ago.
 * Used to build clean month-boundary date ranges (not rolling windows).
 *
 * @param {number} monthsBack  - 0 = current month, 1 = previous, etc.
 * @returns {string}  YYYY-MM-DD
 */
export function calendarMonthStart(monthsBack = 0) {
  const now = new Date()
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth() - monthsBack, 1))
}

/**
 * Today's date as YYYY-MM-DD.
 */
export function today() {
  return formatLocalDate(new Date())
}

/**
 * Return the ISO start date of the CURRENT calendar month.
 * Anchors "1 month" views so they match the Dashboard month picker.
 */
export function currentMonthStart() {
  return calendarMonthStart(0)
}

/**
 * Count inclusive calendar months between two ISO dates.
 * Used for averaging over a selected period, including months with no rows.
 */
export function countCalendarMonths(fromDate, toDate) {
  if (!fromDate || !toDate) return null
  const [fy, fm] = fromDate.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toDate.slice(0, 7).split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return null
  return Math.max((ty - fy) * 12 + (tm - fm) + 1, 1)
}

// ── Monthly averages (separate from totals) ────────────────────────────────────

/**
 * Compute monthly averages from groupByMonth() output.
 * These are AVERAGES — never mix with period totals.
 *
 * @param {Object} monthlyData  - { 'YYYY-MM': { spend, income } }
 * @returns {{ avgMonthlySpend, avgMonthlyIncome, monthCount, totalSpend, totalIncome }}
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

// ── Canonical ledger summary ───────────────────────────────────────────────────

/**
 * Build the authoritative financial summary for a transaction set.
 *
 * All tabs — Overview, Analytics, IncomeStatement, Projections — must
 * derive their displayed numbers from this function. It guarantees:
 *   - Consistent Transfer exclusion
 *   - Period-aware income resolution (declared salary × monthCount)
 *   - Clear separation of period totals vs monthly averages
 *   - Optional tier filtering and deduplication
 *
 * @param {Array}   transactions  - raw rows from Supabase (amounts in rands)
 * @param {Object}  profile       - user profile (amounts in cents)
 * @param {Object}  [opts]
 * @param {Object}  [opts.tier]           - TierContext object; applies date filter if supplied
 * @param {boolean} [opts.dedup=false]    - deduplicate before calculating
 * @param {boolean} [opts.preferDeclared=true] - use declared salary as income source
 * @param {number}  [opts.monthCount]     - explicit inclusive calendar month count for averages
 * @param {string}  [opts.debugLabel]     - label for temporary forensic console logging
 * @param {string}  [opts.from]           - date range start for debug logging
 * @param {string}  [opts.to]             - date range end for debug logging
 *
 * @typedef {Object} LedgerSummary
 * @property {Array}   all                  - tier-filtered (+ optionally deduped) transactions
 * @property {Array}   spendTxns            - spend-only (no Income, no Transfer)
 * @property {Array}   incomeTxns           - Income-category only
 * @property {Array}   transferTxns         - Transfer-category only
 * @property {number}  txnCount             - count of spend transactions
 *
 * — Period totals (always raw sums; use for "actual" figures) —
 * @property {number}  totalSpend           - sum of all spend in period
 * @property {number}  txnIncome            - sum of Income-category transactions
 * @property {number}  income               - resolved income for period
 * @property {string}  incomeSource         - 'declared' | 'transactions' | 'none'
 * @property {number}  net                  - income − totalSpend
 * @property {number}  monthCount           - number of distinct calendar months in period
 *
 * — Category breakdown —
 * @property {Object}  catTotals            - { category: totalRands } spend only
 * @property {Object}  monthlyData          - { 'YYYY-MM': { spend, income } }
 *
 * — Monthly averages (always clearly separate from totals) —
 * @property {number}  avgMonthlySpend      - totalSpend / monthCount
 * @property {number}  avgMonthlyIncome     - txnIncome / monthCount
 * @property {number}  declaredMonthlyIncome- profile.net_income in rands (monthly)
 * @property {number}  resolvedMonthlyIncome- income / monthCount (for display in avg context)
 *
 * @returns {LedgerSummary}
 */
export function buildLedgerSummary(transactions, profile, opts = {}) {
  const {
    tier,
    dedup = false,
    preferDeclared = true,
    monthCount: explicitMonthCount,
    debugLabel = '',
    from = '',
    to = '',
  } = opts

  // ── Step 1: Tier date filter ───────────────────────────────────────────────
  let txns = tier ? applyTierFilter(transactions, tier) : (transactions || [])

  // ── Step 2: Optional deduplication ────────────────────────────────────────
  if (dedup) txns = deduplicateTransactions(txns)

  // ── Step 3: Partition into buckets ─────────────────────────────────────────
  const spendTxns    = filterSpend(txns)
  const incomeTxns   = filterIncome(txns)
  const transferTxns = txns.filter(t => t?.category === 'Transfer')

  // ── Step 4: Period totals ──────────────────────────────────────────────────
  const totalSpend = spendTxns.reduce((s, t) => s + (t.amount || 0), 0)
  const txnIncome  = incomeTxns.reduce((s, t) => s + (t.amount || 0), 0)

  // ── Step 5: Category and monthly breakdown ─────────────────────────────────
  const catTotals   = sumByCategory(txns)
  const monthlyData = groupByMonth(txns)
  const monthCount  = Math.max(explicitMonthCount || Object.keys(monthlyData).length, 1)

  // ── Step 6: Period-aware income resolution ─────────────────────────────────
  // KEY FIX: declared salary is a MONTHLY figure and must be scaled by months.
  // Example: declared R35k/mo × 3 months = R105k period income.
  // This matches what transaction income would show (3 × R35k salary credits).
  const declaredMonthly = profileCentsToRands(profile?.net_income)

  let income, incomeSource
  if (preferDeclared && declaredMonthly > 0) {
    // Scale declared monthly salary to cover the full period
    income       = declaredMonthly * monthCount
    incomeSource = 'declared'
  } else if (txnIncome > 0) {
    // Use the actual logged income (already a period total, not monthly)
    income       = txnIncome
    incomeSource = 'transactions'
  } else if (declaredMonthly > 0) {
    // Fallback: scale declared
    income       = declaredMonthly * monthCount
    incomeSource = 'declared'
  } else {
    income       = 0
    incomeSource = 'none'
  }

  // ── Step 7: Net position ───────────────────────────────────────────────────
  const net = income - totalSpend

  // ── Step 8: Monthly averages (clearly separate from totals) ───────────────
  const { avgMonthlySpend, avgMonthlyIncome } = buildMonthlyAverages(monthlyData)
  const resolvedMonthlyIncome = monthCount > 0 ? income / monthCount : income

  if (debugLabel && isLedgerDebugEnabled()) {
    const excludedTxns = txns.filter(t => t?.category === 'Income' || t?.category === 'Transfer' || t?.category === 'Savings')
    const categoryInputs = spendTxns.map(t => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      category: t.category,
      name: t.name,
    }))
    console.groupCollapsed(`[bump ledger] ${debugLabel}`)
    console.log({
      boundaries: { from, to },
      transactionCount: txns.length,
      income: txnIncome,
      totalSpend,
      transferTotal: transferTxns.reduce((s, t) => s + (t.amount || 0), 0),
      savingsTotal: txns.filter(t => t?.category === 'Savings').reduce((s, t) => s + (t.amount || 0), 0),
      excludedTotal: excludedTxns.reduce((s, t) => s + (t.amount || 0), 0),
      allIds: txns.map(t => t.id),
      spendIds: spendTxns.map(t => t.id),
      incomeIds: incomeTxns.map(t => t.id),
      transferIds: transferTxns.map(t => t.id),
      savingsIds: txns.filter(t => t?.category === 'Savings').map(t => t.id),
      excludedIds: excludedTxns.map(t => t.id),
      catTotals,
      categoryInputs,
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

    // Period totals — use for "actual" and "income statement" views
    totalSpend,
    txnIncome,
    income,
    incomeSource,
    net,
    monthCount,

    // Category and monthly breakdown
    catTotals,
    monthlyData,

    // Monthly averages — use for projections, averages, forecasting
    // NEVER use these where period totals are expected (and vice versa)
    avgMonthlySpend,
    avgMonthlyIncome,
    declaredMonthlyIncome: declaredMonthly,
    resolvedMonthlyIncome,
  }
}
