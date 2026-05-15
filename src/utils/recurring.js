/**
 * src/utils/recurring.js
 * Recurring obligation detection for bump.
 *
 * detectRecurring(transactions)
 *   - Groups transactions by normalized merchant name
 *   - Flags merchants that appear in 2+ distinct calendar months
 *     with a consistent amount (within ±25% of the median)
 *   - Prioritises obligation categories (Housing, Insurance, Utilities,
 *     Subscriptions, Fees & Charges) — any recurrence there is flagged
 *
 * recurringToContext(recurring, options)
 *   - Converts detected recurring obligations to a compact context string
 *     suitable for injecting into buildInsightContext() as `recurringContext`
 */

// Categories where recurring transactions are almost always obligations
const OBLIGATION_CATS = new Set([
  'Housing', 'Insurance', 'Utilities', 'Fees & Charges', 'Subscriptions'
])

// Categories where recurrence can be habitual but not always a committed obligation
const HABITUAL_CATS = new Set([
  'Groceries', 'Fuel', 'Transport', 'Education', 'Health'
])

/**
 * Normalise a merchant name for grouping purposes.
 * Strips store numbers, dates, trailing noise — keeps the brand name.
 */
function normaliseMerchant(name) {
  if (!name) return 'unknown'
  return name
    .toLowerCase()
    .replace(/[#*|/\\]+/g, ' ')
    .replace(/\b\d{4,}\b/g, '')           // strip long numbers
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-–,]+$/, '')
    .trim()
}

/**
 * Compute the median of an array of numbers.
 */
function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Detect recurring transactions from a flat list.
 *
 * @param {Array<{ name: string, amount: number, category: string, date: string }>} transactions
 * @param {Object} [opts]
 * @param {number} [opts.minMonths=2]         - minimum distinct calendar months to flag
 * @param {number} [opts.amountVariance=0.25] - max allowed fraction deviation from median
 * @returns {Array<{
 *   merchant: string,
 *   category: string,
 *   medianAmount: number,
 *   avgAmount: number,
 *   months: string[],
 *   count: number,
 *   isFixed: boolean,   // true if amount variance < 5%
 *   isObligation: boolean,
 * }>}
 */
export function detectRecurring(transactions, opts = {}) {
  const { minMonths = 2, amountVariance = 0.25 } = opts
  if (!transactions || transactions.length === 0) return []

  // Group by normalised merchant + category
  const groups = {}
  for (const t of transactions) {
    // Skip income/transfer/savings
    const cat = t.category || 'Other'
    if (cat === 'Income' || cat === 'Transfer' || cat === 'Savings') continue
    if (!t.amount || t.amount <= 0) continue
    if (!t.date) continue

    const key = normaliseMerchant(t.name || '')
    if (!key || key === 'unknown') continue

    const month = String(t.date).slice(0, 7) // 'YYYY-MM'

    if (!groups[key]) {
      groups[key] = { merchant: t.name || key, category: cat, amounts: [], months: new Set() }
    }
    groups[key].amounts.push(t.amount)
    groups[key].months.add(month)
    // If we've seen this merchant under multiple categories, keep the most common
  }

  const results = []
  for (const [, g] of Object.entries(groups)) {
    const distinctMonths = [...g.months].sort()
    if (distinctMonths.length < minMonths) continue

    const med = median(g.amounts)
    if (med <= 0) continue

    // Check amount consistency — within ±amountVariance of median
    const consistent = g.amounts.every(a => Math.abs(a - med) / med <= amountVariance)
    if (!consistent && !OBLIGATION_CATS.has(g.category)) continue

    const avg = Math.round(g.amounts.reduce((s, v) => s + v, 0) / g.amounts.length)
    const maxDev = g.amounts.reduce((d, a) => Math.max(d, Math.abs(a - med) / med), 0)
    const isFixed = maxDev < 0.05

    results.push({
      merchant:    g.merchant,
      category:    g.category,
      medianAmount: Math.round(med),
      avgAmount:   avg,
      months:      distinctMonths,
      count:       g.amounts.length,
      isFixed,
      isObligation: OBLIGATION_CATS.has(g.category),
    })
  }

  // Sort: obligations first, then by median amount descending
  results.sort((a, b) => {
    if (a.isObligation !== b.isObligation) return a.isObligation ? -1 : 1
    return b.medianAmount - a.medianAmount
  })

  return results
}

/**
 * Convert a detectRecurring() result array into a compact context string
 * for the AI insight prompt.
 *
 * @param {Array}  recurring  - output of detectRecurring()
 * @param {Object} [opts]
 * @param {number} [opts.income]  - monthly income in rands (for burden %)
 * @param {number} [opts.limit]   - max obligations to list (default 15)
 * @returns {string}
 */
export function recurringToContext(recurring, opts = {}) {
  if (!recurring || recurring.length === 0) return ''
  const { income = 0, limit = 15 } = opts

  const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

  // Separate obligations vs habitual
  const obligations = recurring.filter(r => r.isObligation)
  const habitual    = recurring.filter(r => !r.isObligation && HABITUAL_CATS.has(r.category))

  const lines = []

  if (obligations.length > 0) {
    lines.push('RECURRING FIXED OBLIGATIONS (detected from statement patterns):')
    const totalObligation = obligations.reduce((s, r) => s + r.medianAmount, 0)
    for (const r of obligations.slice(0, limit)) {
      const fixedTag = r.isFixed ? 'fixed' : 'approx'
      lines.push(`  [${r.category}] ${r.merchant}: ${fmt(r.medianAmount)}/mo (${fixedTag}, ${r.months.length} months seen)`)
    }
    if (income > 0) {
      const burdenPct = Math.round(totalObligation / income * 100)
      lines.push(`  Total obligation burden: ${fmt(totalObligation)}/mo (${burdenPct}% of income)`)
    } else {
      lines.push(`  Total obligation burden: ${fmt(totalObligation)}/mo`)
    }
  }

  if (habitual.length > 0) {
    lines.push('RECURRING HABITUAL SPEND (regular but variable):')
    for (const r of habitual.slice(0, Math.min(5, limit))) {
      lines.push(`  [${r.category}] ${r.merchant}: avg ${fmt(r.avgAmount)}/mo (${r.months.length} months)`)
    }
  }

  return lines.join('\n')
}
