// ── Recurring transaction detection ─────────────────────────────────────────
// Client-side utility — no API calls needed.
// Analyses a set of transactions spanning multiple months to identify
// recurring obligations: subscriptions, debit orders, salary, rent, etc.

/**
 * Normalise a merchant name for grouping purposes.
 * Strips numbers, branch codes, and common noise so
 * "WOOLWORTHS KENILWORTH 12345" and "WOOLWORTHS CAVENDISH" group together.
 */
function normalizeMerchant(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\d{4,}/g, '')          // strip long numbers (branch codes, refs)
    .replace(/\b(pty|ltd|cc|inc)\b/g, '')  // strip entity suffixes
    .replace(/[*\/\\-]/g, ' ')       // normalize separators
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 40)                    // cap length for grouping
}

/**
 * Detect recurring transactions from a list of transactions.
 *
 * @param {Array<{id, name, amount, category, date}>} transactions
 *   Must span at least 2 months for meaningful detection.
 *   Amounts should be in rands (not cents).
 *
 * @returns {Array<RecurringItem>}
 *   Sorted by confidence descending.
 *
 * @typedef {Object} RecurringItem
 * @property {string}   merchant       Normalised merchant name
 * @property {string}   displayName    Most common raw name for display
 * @property {string}   category       Most common category
 * @property {number}   avgAmount      Average transaction amount (rands)
 * @property {number}   minAmount      Min observed amount
 * @property {number}   maxAmount      Max observed amount
 * @property {boolean}  fixedAmount    True if amount varies < 5%
 * @property {string}   frequency      'monthly' | 'weekly' | 'irregular'
 * @property {number}   avgDayOfMonth  Average day-of-month it appears
 * @property {number}   occurrences    How many times seen
 * @property {number}   monthsSpanned  How many distinct months seen
 * @property {number}   confidence     0–1 score
 * @property {string}   type           'subscription' | 'debit_order' | 'salary' | 'transfer' | 'recurring_spend'
 */
export function detectRecurring(transactions) {
  if (!transactions || transactions.length === 0) return []

  // Group transactions by normalised merchant
  const groups = {}
  for (const t of transactions) {
    const key = normalizeMerchant(t.name)
    if (!key) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }

  const results = []

  for (const [key, txns] of Object.entries(groups)) {
    // Need at least 2 occurrences to consider recurring
    if (txns.length < 2) continue

    const months = new Set(txns.map(t => t.date?.slice(0, 7)))
    if (months.size < 2) continue   // must appear in at least 2 different months

    const amounts = txns.map(t => Math.abs(t.amount))
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const minAmount = Math.min(...amounts)
    const maxAmount = Math.max(...amounts)
    const amountVariance = avgAmount > 0 ? (maxAmount - minAmount) / avgAmount : 0
    const fixedAmount = amountVariance < 0.05   // within 5%

    const days = txns.map(t => new Date(t.date + 'T12:00:00').getDate())
    const avgDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    const dayVariance = days.map(d => Math.abs(d - avgDay))
    const avgDayVariance = dayVariance.reduce((a, b) => a + b, 0) / dayVariance.length
    const consistentDay = avgDayVariance <= 5   // within 5 days

    // Most common category
    const catCounts = {}
    for (const t of txns) catCounts[t.category] = (catCounts[t.category] || 0) + 1
    const category = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Most common display name (raw)
    const nameCounts = {}
    for (const t of txns) nameCounts[t.name] = (nameCounts[t.name] || 0) + 1
    const displayName = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Infer frequency
    let frequency = 'irregular'
    if (months.size >= 2 && txns.length <= months.size * 1.5) {
      frequency = 'monthly'
    } else if (txns.length > months.size * 2) {
      frequency = 'weekly'
    }

    // Confidence score (0–1)
    let confidence = 0
    confidence += Math.min(0.4, months.size * 0.1)     // more months = more confident
    confidence += fixedAmount ? 0.25 : 0                // fixed amount is strong signal
    confidence += consistentDay ? 0.2 : 0               // consistent day
    confidence += frequency === 'monthly' ? 0.15 : 0    // monthly cadence
    confidence = Math.min(1, confidence)

    // Skip very low confidence
    if (confidence < 0.3) continue

    // Classify type
    let type = 'recurring_spend'
    if (category === 'Income') type = 'salary'
    else if (category === 'Transfer') type = 'transfer'
    else if (category === 'Subscriptions') type = 'subscription'
    else if (category === 'Insurance' || category === 'Housing' ||
             (fixedAmount && avgAmount > 500)) type = 'debit_order'

    results.push({
      merchant: key,
      displayName,
      category,
      avgAmount,
      minAmount,
      maxAmount,
      fixedAmount,
      frequency,
      avgDayOfMonth: avgDay,
      occurrences: txns.length,
      monthsSpanned: months.size,
      confidence,
      type,
    })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Calculate total monthly committed spend from recurring items.
 * Excludes income, transfers, and savings.
 */
export function committedMonthlySpend(recurringItems) {
  return recurringItems
    .filter(r => r.type !== 'salary' && r.type !== 'transfer')
    .filter(r => r.frequency === 'monthly')
    .reduce((sum, r) => sum + r.avgAmount, 0)
}

/**
 * Summarise recurring items for AI context.
 */
export function recurringToContext(recurringItems) {
  if (!recurringItems || recurringItems.length === 0) return ''
  const lines = recurringItems
    .filter(r => r.confidence >= 0.5)
    .slice(0, 10)
    .map(r => `${r.displayName}: R${Math.round(r.avgAmount)}/mo (${r.type}, ${Math.round(r.confidence * 100)}% confidence)`)
  if (lines.length === 0) return ''
  return 'Detected recurring obligations:\n' + lines.join('\n')
}
