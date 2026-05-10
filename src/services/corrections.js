/**
 * bump. — User Correction Memory
 * src/services/corrections.js
 *
 * Persists user recategorisation decisions to Supabase as merchant rules.
 * These rules are read by parse-bulk-transactions.js on future imports
 * (user rules take highest priority, beating SA_RULES and Claude).
 *
 * Table: categorization_rules (user_id, merchant_pattern, category)
 */

import { supabase } from '../supabase'

/**
 * Save a merchant→category correction rule.
 * Normalises the pattern to a lowercase keyword for broad matching.
 *
 * @param {string} userId
 * @param {string} merchantName   - raw or display merchant name
 * @param {string} category       - corrected category
 * @returns {Promise<void>}
 */
export async function saveCorrectionRule(userId, merchantName, category) {
  if (!userId || !merchantName || !category) return

  // Derive a stable, lowercase match pattern from the merchant name.
  // Strip long numbers and punctuation; keep the first 30 chars so it's broad enough
  // to catch future variations of the same merchant.
  const pattern = merchantName
    .toLowerCase()
    .replace(/\d{5,}/g, '')        // strip long ref numbers
    .replace(/[*\/\\|]+/g, ' ')    // normalize separators
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 30)

  if (pattern.length < 3) return   // too short to be useful

  const { error } = await supabase
    .from('categorization_rules')
    .upsert(
      { user_id: userId, merchant_pattern: pattern, category },
      { onConflict: 'user_id,merchant_pattern' }
    )

  if (error) console.error('[corrections] Failed to save rule:', error.message)
}

/**
 * Delete a correction rule (e.g. if user wants to reset to default categorisation).
 *
 * @param {string} userId
 * @param {string} merchantPattern - the pattern to delete
 */
export async function deleteCorrectionRule(userId, merchantPattern) {
  await supabase
    .from('categorization_rules')
    .delete()
    .eq('user_id', userId)
    .eq('merchant_pattern', merchantPattern)
}

/**
 * Fetch all correction rules for a user.
 * Useful for displaying a "Your merchant rules" settings panel.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id, merchant_pattern, category }>>}
 */
export async function fetchCorrectionRules(userId) {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('id, merchant_pattern, category')
    .eq('user_id', userId)
    .order('merchant_pattern')

  if (error) {
    console.error('[corrections] Failed to fetch rules:', error.message)
    return []
  }
  return data || []
}

/**
 * Apply saved correction rules to a transaction list client-side.
 * This gives instant feedback without a round-trip to the server.
 *
 * Mirrors the server-side applyRules() logic in parse-bulk-transactions.js.
 *
 * @param {Array<{ name: string, category: string }>} transactions
 * @param {Array<{ merchant_pattern: string, category: string }>} rules
 * @returns {Array} transactions with corrected categories
 */
export function applyCorrectionsLocally(transactions, rules) {
  if (!rules || rules.length === 0) return transactions
  return transactions.map(t => {
    const lower = (t.name || '').toLowerCase()
    for (const rule of rules) {
      if (lower.includes(rule.merchant_pattern.toLowerCase())) {
        return { ...t, category: rule.category, rule_applied: true }
      }
    }
    return t
  })
}

/**
 * Identify transactions that are likely mis-categorised or unresolved.
 * Returns transactions where category is 'Other' or name is very short/noisy.
 *
 * @param {Array<{ name: string, category: string, amount: number }>} transactions
 * @param {number} [minAmount=50] - only flag transactions above this threshold
 * @returns {Array} unresolved transactions, sorted by amount descending
 */
export function findUnresolvedMerchants(transactions, minAmount = 50) {
  return (transactions || [])
    .filter(t => {
      if (t.category === 'Income' || t.category === 'Transfer' || t.category === 'Savings') return false
      if (t.amount < minAmount) return false
      return t.category === 'Other' || !t.category
    })
    .sort((a, b) => b.amount - a.amount)
}
