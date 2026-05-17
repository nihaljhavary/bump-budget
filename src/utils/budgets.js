/**
 * src/utils/budgets.js
 * Shared AI budget derivation for bump.
 *
 * Single canonical formula used by both Dashboard.jsx and Analytics.jsx.
 * Previously duplicated: Dashboard had an async loadAiBudgets() function
 * and Analytics had a local buildAISuggestedBudgets() function -- both
 * implementing the same 85% rule but independently.
 *
 * Rule: target 85% of average monthly spend per category (a gentle 15%
 * reduction from baseline -- not a dramatic cut).
 *
 * The period over which catTotals is computed differs by caller:
 *   - Dashboard: always uses rolling 12-month history (stable baseline)
 *   - Analytics: uses the currently selected period (1m / 3m / 6m / 12m)
 * This is intentional -- the formula is the same, only the input window differs.
 *
 * Pure function. No React, no Supabase, no side effects.
 */

/**
 * Derive AI-suggested monthly budgets from category spend totals.
 *
 * @param {Object} catTotals  - { category: totalRands } for the period
 * @param {number} monthCount - number of months the totals span
 * @param {number} [factor]   - reduction factor (default 0.85 = target 85% of avg)
 * @returns {Object} { category: suggestedMonthlyRands }
 */
export function buildAiBudgets(catTotals, monthCount, factor = 0.85) {
  if (!catTotals || monthCount < 1) return {}
  const suggested = {}
  for (const [cat, total] of Object.entries(catTotals)) {
    const avgMonthly = total / monthCount
    if (avgMonthly > 0) suggested[cat] = Math.round(avgMonthly * factor)
  }
  return suggested
}
