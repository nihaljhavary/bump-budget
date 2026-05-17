/**
 * src/utils/projection.js
 * Shared projection arithmetic for bump.
 *
 * Canonical home for:
 *   - DEFAULT_PROJECTION_ASSUMPTIONS  (used by Projections.jsx + Recommendations.jsx)
 *   - computeBaselineProjection()     (used by Recommendations.jsx for AI context)
 *
 * Projections.jsx owns the full event-driven buildYearModel() engine.
 * This module only contains the lightweight baseline arithmetic that is
 * shared across features. No AI involved anywhere in this file.
 *
 * All amounts in rands. Pure functions — no React, no Supabase.
 */

// Conservative SA-realistic defaults.
// Shared so Projections.jsx and Recommendations.jsx stay in sync.
export const DEFAULT_PROJECTION_ASSUMPTIONS = {
  salaryGrowth:     5,  // % per year
  inflation:        6,  // % per year
  investmentReturn: 8,  // % per year
}

/**
 * Compute a lightweight deterministic projection baseline.
 *
 * No events, no granular row tracking -- pure base-case arithmetic.
 * Used by Recommendations.jsx to generate forward-looking AI context.
 * The full event-driven engine (buildYearModel) lives in Projections.jsx.
 *
 * Both engines use the same core loop arithmetic and DEFAULT_PROJECTION_ASSUMPTIONS,
 * so projections in Recommendations and the Projections tab reconcile numerically
 * on the base case (zero events, no varReduction).
 *
 * @param {number} netIncome          - monthly net income in rands
 * @param {number} fixedMonthly       - monthly fixed obligations in rands
 * @param {number} variableMonthly    - monthly variable spend in rands
 * @param {number} [startingSavings]  - starting net worth / savings in rands
 * @param {Object} [assumptions]      - overrides for DEFAULT_PROJECTION_ASSUMPTIONS
 * @returns {Object|null}
 */
export function computeBaselineProjection(
  netIncome,
  fixedMonthly,
  variableMonthly,
  startingSavings = 0,
  assumptions = {}
) {
  if (!netIncome || netIncome <= 0) return null

  const {
    salaryGrowth,
    inflation,
    investmentReturn,
  } = { ...DEFAULT_PROJECTION_ASSUMPTIONS, ...assumptions }

  let bal    = startingSavings
  let optBal = startingSavings
  const years = 10
  const results = {}

  for (let i = 0; i < years; i++) {
    const gf  = Math.pow(1 + salaryGrowth  / 100, i)
    const inf = Math.pow(1 + inflation     / 100, i)

    const income   = netIncome       * 12 * gf
    const fixed    = fixedMonthly    * 12 * inf
    const variable = variableMonthly * 12 * inf
    const optVar   = variable * 0.9  // optimised: 10% variable reduction

    const growth    = Math.max(bal,    0) * (investmentReturn / 100)
    const optGrowth = Math.max(optBal, 0) * (investmentReturn / 100)

    bal    += (income - fixed - variable) + growth
    optBal += (income - fixed - optVar)   + optGrowth

    if (i === 0) {
      results.netWorth1yr          = Math.round(bal)
      results.optimisedNetWorth1yr = Math.round(optBal)
    }
    if (i === 4) {
      results.netWorth5yr          = Math.round(bal)
      results.optimisedNetWorth5yr = Math.round(optBal)
    }
  }

  results.netWorth10yr          = Math.round(bal)
  results.optimisedNetWorth10yr = Math.round(optBal)
  results.monthlyFreeCashFlow   = Math.round(netIncome - fixedMonthly - variableMonthly)
  results.salaryGrowth          = salaryGrowth
  results.investmentReturn      = investmentReturn

  return results
}
