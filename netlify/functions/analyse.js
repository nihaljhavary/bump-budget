import { createClient } from '@supabase/supabase-js'
import { buildInsightContext, buildInsightPrompt } from './_context.js'

const FORMAT_RULES = `Format rules (always follow): Never use em dashes (--). Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose with short paragraphs.`

const SYSTEM_PROMPT = `You are bump.'s financial analyst. Your only purpose is to help users understand their personal finances. Refuse any request outside personal finance analysis. ${FORMAT_RULES}`

// Default budgets (used when user has not set category-specific budgets)
const DEFAULT_BUDGETS = {
  Housing: 9500, Groceries: 3000, 'Eating out': 2000, Transport: 2500,
  Entertainment: 1500, Health: 1000, Clothing: 1000, Subscriptions: 500,
  Fuel: 1200, Utilities: 800, Other: 1000
}

const ALLOWED_FIELDS = new Set([
  'transactions', 'question', 'declaredIncome', 'profileContext',
  'budgets',          // { category: rands } -- user-set budgets from DB
  'recurringContext', // compact string from recurringToContext()
  'monthlyData',      // { 'YYYY-MM': { spend, income } } for trend signals
  'mode',             // 'overview' | 'analytics' | 'income_statement'
])

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const isSpend = t => t.category !== 'Income' && t.category !== 'Transfer' && t.category !== 'Savings'

export async function handler(event) {
  try {
    return await _handler(event)
  } catch (err) {
    console.error('[analyse] Unhandled error:', err.message, err.stack)
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: `Server error: ${err.message}` }) }
  }
}

async function _handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── 1. Parse + validate body ───────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const extraFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k))
  if (extraFields.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unexpected fields: ${extraFields.join(', ')}` }) }
  }

  const { transactions, question, declaredIncome, profileContext, budgets, recurringContext, monthlyData, mode } = body

  if (!Array.isArray(transactions)) {
    return { statusCode: 400, body: JSON.stringify({ error: '`transactions` must be an array' }) }
  }
  if (question !== undefined && question !== null) {
    if (typeof question !== 'string') return { statusCode: 400, body: JSON.stringify({ error: '`question` must be a string' }) }
    if (question.length > 1000) return { statusCode: 400, body: JSON.stringify({ error: '`question` must be under 1000 characters' }) }
  }
  if (recurringContext !== undefined && typeof recurringContext !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: '`recurringContext` must be a string' }) }
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }

  // ── 3. Plan check + rate limiting ─────────────────────────────────────────
  const { data: profileData } = await adminClient
    .from('profiles').select('subscription_plan, is_admin').eq('id', user.id).single()

  const plan = profileData?.subscription_plan || 'free'
  const isAdmin = profileData?.is_admin === true

  if (!isAdmin && plan === 'free') {
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const { count } = await adminClient.from('budget_chat_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', monthStart.toISOString())
    if ((count || 0) >= 10) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Monthly AI analysis limit reached. Upgrade to a paid plan for unlimited analysis.' })
      }
    }
  }

  // ── 4. Build financial summary from transactions ───────────────────────────
  const txnIncome = transactions.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)
  const income = txnIncome > 0 ? txnIncome : (declaredIncome || 0)
  const incomeSource = txnIncome > 0 ? 'transactions' : (declaredIncome > 0 ? 'declared' : 'unknown')

  const catTotals = {}
  transactions
    .filter(isSpend)
    .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount })
  const totalSpend = Object.values(catTotals).reduce((s, v) => s + v, 0)

  // ── 5. Build period label ──────────────────────────────────────────────────
  let periodLabel = 'this period'
  if (monthlyData && typeof monthlyData === 'object') {
    const months = Object.keys(monthlyData).sort()
    if (months.length === 1) {
      const [y, m] = months[0].split('-')
      periodLabel = new Date(Number(y), Number(m) - 1, 1)
        .toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    } else if (months.length > 1) {
      periodLabel = `last ${months.length} months`
    }
  }

  // ── 6. Build rich context block ────────────────────────────────────────────
  const contextBlock = buildInsightContext({
    income,
    incomeSource,
    totalSpend,
    catTotals,
    budgets: budgets || {},
    defaultBudgets: DEFAULT_BUDGETS,
    debitOrders: profileContext?.monthly_debit_orders || 0,
    savingsGoal: profileContext?.savings_goal || 0,
    usageType: profileContext?.usage_type || 'personal',
    recurringContext: (typeof recurringContext === 'string' && recurringContext.length < 800) ? recurringContext : '',
    monthlyData: monthlyData || null,
    transactions,
    periodLabel,
    mode: mode || 'overview',
  })

  // ── 7. Build prompt ────────────────────────────────────────────────────────
  const prompt = buildInsightPrompt({
    mode: mode || 'overview',
    question: question || '',
    contextBlock,
  })

  // ── 8. Call Claude ─────────────────────────────────────────────────────────
  let analysis
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let res, data
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      data = await res.json()
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data)
      console.error(`[analyse] Anthropic API error ${res.status}: ${errMsg}`)
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: `AI error (${res.status}): ${errMsg}` }) }
    }
    analysis = data.content?.[0]?.text
    if (!analysis) {
      console.error('[analyse] Anthropic returned no content:', JSON.stringify(data))
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: 'AI returned empty response. Try again.' }) }
    }
  } catch (err) {
    console.error('[analyse] fetch error:', err.name, err.message)
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: `Analysis failed: ${err.name === 'AbortError' ? 'Anthropic API timed out (8s)' : err.message}` }) }
  }

  // ── 9. Log usage for free users ────────────────────────────────────────────
  if (!isAdmin && plan === 'free') {
    try {
      await adminClient.from('budget_chat_usage').insert({ user_id: user.id, question_preview: '[analysis]' })
    } catch (e) { console.error('Usage log error:', e) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis })
  }
}
