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
  if (!res.ok) throw new Error('Analysis request failed')
  return res.json()
}
