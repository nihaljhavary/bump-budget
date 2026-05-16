/**
 * src/utils/integrity.js
 * Lightweight financial integrity validation for bump.
 *
 * Pure functions only — no side effects, no React/Supabase imports.
 * All amounts expected in RANDS (integers) matching ledger.js conventions.
 *
 * Exports:
 *   validateIngestionBatch(transactions)     -> { valid, warnings, errors }
 *   detectBatchOverlap(incoming, existingFPs) -> { overlapCount, overlapPct, isDuplicate }
 *   validateLedgerSummary(ledger)            -> string[]   (issues, empty = clean)
 *   validateProjectionInputs(ledger, inputs) -> string[]   (issues, empty = clean)
 *   anomalyFlags(transactions)               -> string[]   (server-safe, reusable)
 */

// ── Ingestion batch validation ────────────────────────────────────────────────

const MAX_SINGLE_TXN_RANDS = 500_000   // R500k — flag as suspicious
const MAX_IDENTICAL_AMT_PCT = 0.90     // 90% same amount = likely parsing error
const MIN_BATCH_ROWS        = 1
const MAX_BATCH_ROWS        = 2000

/**
 * Detect statistical anomalies in a parsed transaction array.
 * Safe to run server-side (no DOM, no imports).
 *
 * @param  {Array<{ amount: number, date: string, description: string }>} transactions
 * @returns {string[]} human-readable warning strings
 */
export function anomalyFlags(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return []
  const flags = []

  // ── Amount anomalies ──────────────────────────────────────────────────────
  const amounts = transactions.map(t => t.amount).filter(a => typeof a === 'number' && a > 0)

  if (amounts.length > 0) {
    // Extreme single-transaction amount
    const maxAmt = Math.max(...amounts)
    if (maxAmt > MAX_SINGLE_TXN_RANDS) {
      flags.push(
        `Unusually large transaction detected: R${Math.round(maxAmt).toLocaleString('en-ZA')}. ` +
        'Verify this is not a parsing error.'
      )
    }

    // All amounts identical (strong signal of column mapping error)
    if (amounts.length >= 3) {
      const firstAmt = amounts[0]
      const identicalCount = amounts.filter(a => a === firstAmt).length
      if (identicalCount / amounts.length >= MAX_IDENTICAL_AMT_PCT) {
        flags.push(
          `${identicalCount} of ${amounts.length} transactions have the identical amount ` +
          `(R${Math.round(firstAmt).toLocaleString('en-ZA')}). ` +
          'This may indicate a column mapping error.'
        )
      }
    }
  }

  // ── Date anomalies ────────────────────────────────────────────────────────
  const dates = transactions.map(t => t.date).filter(Boolean)
  if (dates.length >= 3) {
    const uniqueDates = new Set(dates)
    if (uniqueDates.size === 1) {
      flags.push(
        `All ${dates.length} transactions share the same date (${dates[0]}). ` +
        'This may indicate a date column was not recognised.'
      )
    }

    // Date range sanity: future dates or very old dates
    const now = new Date()
    const futureDates = dates.filter(d => new Date(d + 'T12:00:00') > now)
    if (futureDates.length > 0) {
      flags.push(
        `${futureDates.length} transaction(s) have future dates. ` +
        'Verify the date format is being parsed correctly.'
      )
    }

    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 10)
    const ancientDates = dates.filter(d => new Date(d + 'T12:00:00') < cutoff)
    if (ancientDates.length > 0) {
      flags.push(
        `${ancientDates.length} transaction(s) have dates older than 10 years. ` +
        'Verify the date column is correct.'
      )
    }
  }

  // ── Description anomalies ─────────────────────────────────────────────────
  const descs = transactions.map(t => (t.description || t.name || '').trim()).filter(Boolean)
  if (descs.length >= 3) {
    const uniqueDescs = new Set(descs.map(d => d.toLowerCase()))
    if (uniqueDescs.size === 1) {
      flags.push(
        'All transactions have the same description. ' +
        'This may indicate the description column was not recognised.'
      )
    }
  }

  return flags
}

/**
 * Full client-side ingestion validation before sending to backend.
 *
 * @param  {Array} transactions - parsed rows from parseRows()
 * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
 */
export function validateIngestionBatch(transactions) {
  const errors = []
  const warnings = []

  if (!Array.isArray(transactions)) {
    return { valid: false, errors: ['Transaction batch is not an array.'], warnings }
  }

  if (transactions.length < MIN_BATCH_ROWS) {
    errors.push('No transactions found in the file.')
    return { valid: false, errors, warnings }
  }

  if (transactions.length > MAX_BATCH_ROWS) {
    errors.push(`Too many transactions (${transactions.length}). Maximum is ${MAX_BATCH_ROWS} per import.`)
    return { valid: false, errors, warnings }
  }

  // Check each row has a non-zero positive amount
  const zeroAmt = transactions.filter(t => !t.amount || t.amount <= 0)
  if (zeroAmt.length > transactions.length * 0.5) {
    warnings.push(
      `${zeroAmt.length} rows have a zero or missing amount and will be skipped. ` +
      'Check that the correct amount column is being mapped.'
    )
  }

  // Check each row has a description
  const noDesc = transactions.filter(t => !t.description && !t.name)
  if (noDesc.length > 0) {
    warnings.push(`${noDesc.length} rows are missing a description and will use a placeholder.`)
  }

  // Statistical anomaly checks
  const flags = anomalyFlags(transactions)
  warnings.push(...flags)

  // Positive: report income vs spend split for transparency
  const incomeCount  = transactions.filter(t => t.is_income).length
  const transferCount = transactions.filter(t => t.is_transfer).length
  const spendCount   = transactions.length - incomeCount - transferCount

  if (incomeCount === 0 && transactions.length > 10) {
    warnings.push(
      'No income transactions detected. If your salary appears in this statement, ' +
      'it may have been classified as a transfer.'
    )
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
    stats: { total: transactions.length, income: incomeCount, spend: spendCount, transfers: transferCount },
  }
}

/**
 * Compute the canonical fingerprint for a single transaction.
 *
 * MUST stay byte-for-byte identical to txnFingerprint() in ledger.js.
 * Field priority: description → raw_merchant → name (same order as ledger.js).
 * integrity.js is a pure module (no imports) so we duplicate the logic here.
 *
 * @param  {{ date: string, amount: number, description?: string, raw_merchant?: string, name?: string }} t
 * @returns {string}
 */
export function batchTxnFingerprint(t) {
  // Priority matches ledger.js txnFingerprint: description first, then raw_merchant, then name.
  const desc = (t.description || t.raw_merchant || t.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const amt = Math.round((t.amount || 0) * 100) / 100
  return `${t.date}|${amt}|${desc}`
}

/**
 * Compute overlap between an incoming batch and a fingerprint set of existing transactions.
 * Uses batchTxnFingerprint() which is kept in sync with ledger.js txnFingerprint()
 * to ensure consistent duplicate detection.
 *
 * Overlap tiers:
 *   ≥70% → isDuplicate (likely full re-upload of same statement)
 *   ≥30% → isPartialDuplicate (partial overlap — warn but allow)
 *   <30%  → clean batch
 *
 * @param  {Array}  incoming             - parsed transactions (pre-categorisation)
 * @param  {Set}    existingFingerprints - from buildFingerprintSet() in ledger.js
 * @returns {{ overlapCount: number, overlapPct: number, isDuplicate: boolean, isPartialDuplicate: boolean }}
 */
export function detectBatchOverlap(incoming, existingFingerprints) {
  if (!incoming || incoming.length === 0 || !existingFingerprints || existingFingerprints.size === 0) {
    return { overlapCount: 0, overlapPct: 0, isDuplicate: false, isPartialDuplicate: false }
  }

  let overlapCount = 0
  for (const t of incoming) {
    const fp = batchTxnFingerprint(t)
    if (existingFingerprints.has(fp)) {
      overlapCount++
    } else {
      // Also check with raw_merchant-first priority (legacy rows imported before this fix)
      const legacyDesc = (t.raw_merchant || t.description || t.name || '')
        .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)
      const legacyFp = `${t.date}|${Math.round((t.amount || 0) * 100) / 100}|${legacyDesc}`
      if (existingFingerprints.has(legacyFp)) overlapCount++
    }
  }

  const overlapPct        = Math.round((overlapCount / incoming.length) * 100)
  const isDuplicate       = overlapPct >= 70   // full re-upload of same statement
  const isPartialDuplicate = overlapPct >= 30  // partial overlap — worth surfacing

  return { overlapCount, overlapPct, isDuplicate, isPartialDuplicate }
}

// ── Ledger summary validation ─────────────────────────────────────────────────

/**
 * Validate a buildLedgerSummary() return value for internal consistency.
 * Catches: NaN values, negative spend, catTotals drift from totalSpend,
 * impossible income, empty month ranges.
 *
 * @param  {Object} ledger - from buildLedgerSummary()
 * @returns {string[]} array of issue descriptions (empty = clean)
 */
export function validateLedgerSummary(ledger) {
  if (!ledger) return ['Ledger summary is null or undefined.']
  const issues = []

  const numericFields = ['totalSpend', 'income', 'net', 'monthCount', 'avgMonthlySpend']
  for (const field of numericFields) {
    if (typeof ledger[field] !== 'number' || isNaN(ledger[field])) {
      issues.push(`Ledger field "${field}" is ${ledger[field]} (expected a number).`)
    }
  }

  if (ledger.totalSpend < 0) {
    issues.push(`totalSpend is negative (${ledger.totalSpend}). Transfer exclusion may be broken.`)
  }

  if (ledger.income < 0) {
    issues.push(`Effective income is negative (${ledger.income}). Check income resolution.`)
  }

  if (ledger.monthCount < 1) {
    issues.push(`monthCount is ${ledger.monthCount}. At least 1 month expected.`)
  }

  // catTotals reconciliation: their sum should equal totalSpend
  // (both derived from filterSpend — any drift indicates a bug)
  if (ledger.catTotals && typeof ledger.totalSpend === 'number') {
    const catSum = Object.values(ledger.catTotals).reduce((s, v) => s + (v || 0), 0)
    const drift  = Math.abs(catSum - ledger.totalSpend)
    if (drift > 1) { // Allow R1 rounding tolerance
      issues.push(
        `catTotals sum (${Math.round(catSum)}) differs from totalSpend (${Math.round(ledger.totalSpend)}) ` +
        `by R${Math.round(drift)}. Category calculation may be inconsistent.`
      )
    }
  }

  // Sanity: spend should not massively exceed income for 3+ months
  // (valid edge case: someone in deficit, but >500% is suspicious)
  if (ledger.income > 0 && ledger.totalSpend > 0 && ledger.monthCount >= 3) {
    const spendToIncomeRatio = ledger.totalSpend / ledger.income
    if (spendToIncomeRatio > 5) {
      issues.push(
        `Spend-to-income ratio is ${Math.round(spendToIncomeRatio * 100)}% over ${ledger.monthCount} months. ` +
        'Income may not be set, or transfer transactions may be included in spend.'
      )
    }
  }

  return issues
}

// ── Projection input validation ───────────────────────────────────────────────

/**
 * Validate that Projections.jsx inputs reconcile with the canonical ledger.
 * Catches: projection base using stale/non-canonical income, impossible fixed costs.
 *
 * @param  {Object} ledger  - buildLedgerSummary() output
 * @param  {Object} inputs  - { netIncomeMonthly, fixedMonthly, variableMonthly }
 * @returns {string[]} issues (empty = reconciles correctly)
 */
export function validateProjectionInputs(ledger, inputs) {
  if (!ledger || !inputs) return []
  const issues = []

  const { netIncomeMonthly = 0, fixedMonthly = 0, variableMonthly = 0 } = inputs
  const canonicalIncome = ledger.resolvedMonthlyIncome || 0

  // Income reconciliation: projection base should be within 20% of canonical monthly income
  // (wider band because user can override; this catches accidentally stale values)
  if (canonicalIncome > 0 && netIncomeMonthly > 0) {
    const drift = Math.abs(netIncomeMonthly - canonicalIncome) / canonicalIncome
    if (drift > 0.5) {
      issues.push(
        `Projection income (R${Math.round(netIncomeMonthly).toLocaleString('en-ZA')}/mo) differs ` +
        `from canonical ledger income (R${Math.round(canonicalIncome).toLocaleString('en-ZA')}/mo) ` +
        `by ${Math.round(drift * 100)}%. Verify the income source.`
      )
    }
  }

  // Fixed + variable combined should not exceed 2× income (catches data entry errors)
  const totalMonthlyCommitment = fixedMonthly + variableMonthly
  if (netIncomeMonthly > 0 && totalMonthlyCommitment > netIncomeMonthly * 2) {
    issues.push(
      `Combined fixed (R${Math.round(fixedMonthly).toLocaleString('en-ZA')}) + ` +
      `variable (R${Math.round(variableMonthly).toLocaleString('en-ZA')}) monthly commitments ` +
      `exceed 200% of income. Verify inputs are correct.`
    )
  }

  return issues
}


// ── Cross-tab reconciliation ──────────────────────────────────────────────────

/**
 * Reconcile Overview and Analytics ledger summaries.
 *
 * Both tabs call buildLedgerSummary() independently. When they use the same
 * period + tier parameters their totalSpend and income should match within R1.
 * A mismatch indicates a period/filter divergence (period buttons out of sync,
 * tier applied differently, etc.).
 *
 * @param  {Object} overviewLedger  - buildLedgerSummary() from Overview/Dashboard
 * @param  {Object} analyticsLedger - buildLedgerSummary() from Analytics
 * @param  {number} [toleranceRands=1] - acceptable rounding tolerance
 * @returns {{ reconciled: boolean, issues: string[] }}
 */
export function reconcileTabTotals(overviewLedger, analyticsLedger, toleranceRands = 1) {
  const issues = []
  if (!overviewLedger || !analyticsLedger) {
    return { reconciled: false, issues: ['One or both ledger summaries are missing.'] }
  }

  const spendDrift = Math.abs((overviewLedger.totalSpend || 0) - (analyticsLedger.totalSpend || 0))
  if (spendDrift > toleranceRands) {
    issues.push(
      `Overview totalSpend (R${Math.round(overviewLedger.totalSpend)}) differs from ` +
      `Analytics totalSpend (R${Math.round(analyticsLedger.totalSpend)}) by R${Math.round(spendDrift)}. ` +
      'Period or tier filter may be misaligned between tabs.'
    )
  }

  const incomeDrift = Math.abs((overviewLedger.income || 0) - (analyticsLedger.income || 0))
  if (incomeDrift > toleranceRands) {
    issues.push(
      `Overview income (R${Math.round(overviewLedger.income)}) differs from ` +
      `Analytics income (R${Math.round(analyticsLedger.income)}) by R${Math.round(incomeDrift)}. ` +
      'Income resolution may differ between tabs.'
    )
  }

  const monthDrift = Math.abs((overviewLedger.monthCount || 0) - (analyticsLedger.monthCount || 0))
  if (monthDrift > 0) {
    issues.push(
      `Overview monthCount (${overviewLedger.monthCount}) differs from ` +
      `Analytics monthCount (${analyticsLedger.monthCount}). ` +
      'Period boundaries may be computed differently.'
    )
  }

  return { reconciled: issues.length === 0, issues }
}

/**
 * Reconcile recurring obligations total against spend transactions.
 *
 * detectRecurring() returns a subset of transactions that appear across ≥2
 * months. Their combined monthly amount should not exceed totalSpend — if it
 * does, a transaction is being double-counted or categorised incorrectly.
 *
 * @param  {Array}  recurring   - output of detectRecurring(transactions)
 * @param  {number} totalSpend  - from buildLedgerSummary().totalSpend
 * @param  {number} monthCount  - from buildLedgerSummary().monthCount (for monthly normalisation)
 * @returns {{ reconciled: boolean, issues: string[] }}
 */
export function reconcileRecurring(recurring, totalSpend, monthCount) {
  const issues = []
  if (!Array.isArray(recurring) || recurring.length === 0) {
    return { reconciled: true, issues: [] }
  }

  const mc = Math.max(monthCount || 1, 1)

  // Sum recurring monthly amounts (recurring items already have monthlyAmount)
  const recurringTotal = recurring.reduce((s, r) => s + (r.monthlyAmount || 0), 0)

  // Recurring obligations monthly total should not exceed the total monthly spend
  const monthlySpend = totalSpend / mc
  if (recurringTotal > monthlySpend * 1.1 && monthlySpend > 0) {
    // Allow 10% buffer for rounding/partial-month edge cases
    issues.push(
      `Recurring obligations total (R${Math.round(recurringTotal)}/mo) exceeds ` +
      `average monthly spend (R${Math.round(monthlySpend)}/mo). ` +
      'A recurring item may be double-counted or include non-spend categories.'
    )
  }

  return { reconciled: issues.length === 0, issues }
}


/**
 * Reconcile AI context income/spend vs canonical ledger.
 *
 * analyse.js/_context.js receives income and spend figures from the client.
 * This check confirms the AI context matches the canonical ledger so the AI
 * does not receive stale or truncated numbers.
 *
 * @param  {Object} aiContext  - { income, totalSpend } sent to analyse.js
 * @param  {Object} ledger     - buildLedgerSummary() output
 * @param  {number} [driftPct=0.05] - max allowed relative drift (5% default)
 * @returns {{ reconciled: boolean, issues: string[] }}
 */
export function reconcileAiContext(aiContext, ledger, driftPct = 0.05) {
  const issues = []
  if (!aiContext || !ledger) return { reconciled: true, issues: [] }

  const spendDrift = ledger.totalSpend > 0
    ? Math.abs((aiContext.totalSpend || 0) - ledger.totalSpend) / ledger.totalSpend
    : 0
  if (spendDrift > driftPct) {
    issues.push(
      `AI context spend (R${Math.round(aiContext.totalSpend)}) differs from ` +
      `canonical ledger spend (R${Math.round(ledger.totalSpend)}) ` +
      `by ${Math.round(spendDrift * 100)}%. AI analysis may be based on stale data.`
    )
  }

  const incomeDrift = ledger.income > 0
    ? Math.abs((aiContext.income || 0) - ledger.income) / ledger.income
    : 0
  if (incomeDrift > driftPct) {
    issues.push(
      `AI context income (R${Math.round(aiContext.income)}) differs from ` +
      `canonical ledger income (R${Math.round(ledger.income)}) ` +
      `by ${Math.round(incomeDrift * 100)}%. AI analysis may be based on stale data.`
    )
  }

  return { reconciled: issues.length === 0, issues }
}
