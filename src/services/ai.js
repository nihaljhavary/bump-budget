import { supabase } from '../supabase'

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

export async function parseTransaction(message) {
  const token = await getToken()
  const res = await fetch('/.netlify/functions/parse-transaction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ description: message })
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Monthly AI limit reached. Upgrade to Budget Coach for 500 calls/month.')
  }
  if (!res.ok) throw new Error('Parse request failed')
  return res.json()
}

/**
 * Call the analyse function with an AI payload.
 *
 * @param {Object} payload - built by buildAIPayload() from financials.js
 *                           May include: transactions, declaredIncome, profileContext,
 *                           budgets, recurringContext, monthlyData, mode, question
 */
export async function analyseSpending(payload) {
  const token = await getToken()
  const body = {
    transactions:     payload.transactions     || [],
    question:         payload.question         || '',
    declaredIncome:   payload.declaredIncome   || 0,
    profileContext:   payload.profileContext   || null,
  }
  if (payload.budgets)          body.budgets          = payload.budgets
  if (payload.recurringContext) body.recurringContext = payload.recurringContext
  if (payload.monthlyData)      body.monthlyData      = payload.monthlyData
  if (payload.mode)             body.mode             = payload.mode

  const res = await fetch('/.netlify/functions/analyse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Monthly AI limit reached. Upgrade to Budget Coach for 500 calls/month.')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.analysis || data.error || `Analysis failed (${res.status})`)
  }
  return res.json()
}

/**
 * Re-categorise all of the user's transactions using rules + Claude.
 * Returns { processed, changed, breakdown }.
 */
export async function recategoriseAll() {
  const token = await getToken()
  const res = await fetch('/.netlify/functions/recategorise-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({})
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Recategorisation failed (${res.status})`)
  }
  return res.json()
}

/**
 * Enrich an unknown merchant with AI categorisation.
 * Falls back to rules-based matching server-side before calling Claude.
 *
 * @param {string} description  - raw bank transaction description
 * @param {number} [amount]     - optional amount hint in rands
 * @returns {{ displayName, category, confidence, source }}
 */
export async function enrichMerchant(description, amount) {
  const token = await getToken()
  const body = { description }
  if (amount !== undefined) body.amount = amount

  const res = await fetch('/.netlify/functions/enrich-merchant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Monthly AI limit reached.')
  }
  if (!res.ok) throw new Error('Enrichment request failed')
  return res.json()
}
