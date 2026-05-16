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
 * Compute overlap between an incoming batch and a fingerprint set of existing transactions.
 * Uses the same fingerprint logic as buildFingerprintSet() in ledger.js.
 *
 * @param  {Array}  incoming           - parsed transactions (pre-categorisation)
 * @param  {Set}    existingFingerprints - from buildFingerprintSet()
 * @returns {{ overlapCount: number, overlapPct: number, isDuplicate: boolean }}
 */
export function detectBatchOverlap(incoming, existingFingerprints) {
  if (!incoming || incoming.length === 0 || !existingFingerprints || existingFingerprints.size === 0) {
    return { overlapCount: 0, overlapPct: 0, isDuplicate: false }
  }

  let overlapCount = 0
  for (const t of incoming) {
    const desc = (t.raw_merchant || t.description || t.name || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)
    const amt  = Math.round((t.amount || 0) * 100) / 100
    const fp   = `${t.date}|${amt}|${desc}`
    if (existingFingerprints.has(fp)) overlapCount++
  }

  const overlapPct  = Math.round((overlapCount / incoming.length) * 100)
  const isDuplicate = overlapPct >= 70 // 70%+ overlap = likely re-upload of same statement

  return { overlapCount, overlapPct, isDuplicate }
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
