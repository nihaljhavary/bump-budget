import { supabase } from '../supabase'

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

/**
 * Create an AbortSignal that fires after `ms` milliseconds.
 * If a caller-supplied signal is also provided, whichever fires first wins.
 * This ensures every Netlify function call has a hard ceiling (55s < 60s limit).
 */
function timeoutSignal(ms, callerSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  // Clean up the timer when the request resolves so we don't leak it
  const cleanup = () => clearTimeout(timer)
  controller.signal.addEventListener('abort', cleanup, { once: true })

  // If the caller supplied its own signal, chain it
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }
  return { signal: controller.signal, cleanup }
}

export async function parseTransaction(message, { signal: callerSignal } = {}) {
  const token = await getToken()
  const { signal, cleanup } = timeoutSignal(55_000, callerSignal)
  try {
    const res = await fetch('/.netlify/functions/parse-transaction', {
      method: 'POST',
      signal,
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
  } finally {
    cleanup()
  }
}

/**
 * Call the analyse function with an AI payload.
 *
 * @param {Object} payload - built by buildAIPayload() from financials.js
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - caller-supplied cancellation signal
 */
export async function analyseSpending(payload, { signal: callerSignal } = {}) {
  const token = await getToken()
  const body = {
    transactions:     payload.transactions     || [],
    question:         payload.question         || '',
    declaredIncome:   payload.declaredIncome   || 0,
    profileContext:   payload.profileContext   || null,
  }
  if (payload.budgets)              body.budgets              = payload.budgets
  if (payload.recurringContext)     body.recurringContext     = payload.recurringContext
  if (payload.monthlyData)          body.monthlyData          = payload.monthlyData
  if (payload.mode)                 body.mode                 = payload.mode
  if (payload.topMerchants)         body.topMerchants         = payload.topMerchants
  if (payload.incomeResolutionMode) body.incomeResolutionMode = payload.incomeResolutionMode
  if (payload.effectiveIncome != null) body.effectiveIncome  = payload.effectiveIncome
  if (payload.periodDays != null)   body.periodDays           = payload.periodDays
  if (payload.periodLabel)          body.periodLabel          = payload.periodLabel

  const { signal, cleanup } = timeoutSignal(55_000, callerSignal)
  try {
    const res = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      signal,
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
  } finally {
    cleanup()
  }
}

/**
 * Re-categorise all of the user's transactions using rules + Claude.
 * Returns { processed, changed, breakdown }.
 *
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - caller-supplied cancellation signal
 */
export async function recategoriseAll({ signal: callerSignal } = {}) {
  const token = await getToken()
  const { signal, cleanup } = timeoutSignal(55_000, callerSignal)
  try {
    const res = await fetch('/.netlify/functions/recategorise-all', {
      method: 'POST',
      signal,
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
  } finally {
    cleanup()
  }
}

/**
 * Enrich an unknown merchant with AI categorisation.
 * Falls back to rules-based matching server-side before calling Claude.
 *
 * @param {string} description  - raw bank transaction description
 * @param {number} [amount]     - optional amount hint in rands
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - caller-supplied cancellation signal
 * @returns {{ displayName, category, confidence, source }}
 */
export async function enrichMerchant(description, amount, { signal: callerSignal } = {}) {
  const token = await getToken()
  const body = { description }
  if (amount !== undefined) body.amount = amount

  const { signal, cleanup } = timeoutSignal(55_000, callerSignal)
  try {
    const res = await fetch('/.netlify/functions/enrich-merchant', {
      method: 'POST',
      signal,
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
  } finally {
    cleanup()
  }
}
