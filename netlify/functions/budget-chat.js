import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'
import { buildInsightContext } from './_context.js'

// FORMAT_RULES are enforced via buildInsightContext/buildInsightPrompt personas.
// Kept here as belt-and-suspenders for the system prompt.
const FORMAT_RULES = `Never use em dashes (--). Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose.`

// The SYSTEM_PROMPT is intentionally lean: the rich financial context is built
// by buildInsightContext() and injected as the contextBlock. This mirrors how
// analyse.js works -- same persona, same merchant intelligence, same behavioural
// classification -- so AI answers are consistent across tabs.
const SYSTEM_PROMPT = `You are bump.'s personal finance coach -- a warm, sharp South African money advisor. You have the user's actual transaction data below, including named merchants and rand amounts. Answer their question directly and specifically -- always cite real rand amounts from their data. Be like a knowledgeable friend: honest, constructive, never robotic. 2-4 sentences per answer unless the question needs more depth.

South African context: ZAR currency. Common retailers: Woolworths, Checkers, Pick n Pay, Shoprite, Dis-Chem. Banks: FNB, ABSA, Nedbank, Capitec, Standard Bank, Discovery Bank, TymeBank.

${FORMAT_RULES}`

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const {
    question,
    transactions,
    profile,
    monthlyBudgets,
    conversationHistory = [],
    // Optional richer context -- pass from client for merchant-aware responses
    recurringContext = '',
    topMerchants = [],
  } = body

  if (!question?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No question provided' }) }
  }

  // -- Auth --
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }

  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // -- Rate limiting: free users get 10 questions/month --
  const { data: profileData } = await adminClient.from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', user.id).single()

  const plan = profileData?.subscription_plan || 'free'
  const isAdmin = profileData?.is_admin === true

  if (!isAdmin && plan === 'free') {
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const { count } = await adminClient.from('budget_chat_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart.toISOString())

    if ((count || 0) >= 10) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer: "You've used your 10 free questions this month. Upgrade to Budget Coach for unlimited AI budget questions.",
          paywall: true,
          plan: 'free',
          questionsUsed: count,
          questionsLimit: 10
        })
      }
    }
  }

  // -- Build context from last 90 days (~3 months) --
  // Context is monthly-averaged so budget questions make sense ("you spend R3 000/mo on groceries")
  const MONTHS = 3
  const now = new Date()
  const last90Days = (transactions || []).filter(t => {
    const d = new Date(t.date)
    return (now - d) / (1000 * 60 * 60 * 24) <= 90
  })

  const spendTxns = last90Days.filter(t =>
    t.category !== 'Income' && t.category !== 'Transfer' && t.category !== 'Savings'
  )

  // Accumulate 90-day totals per category
  const catTotals90d = {}
  for (const t of spendTxns) {
    catTotals90d[t.category] = (catTotals90d[t.category] || 0) + t.amount
  }

  // Monthly averages (90-day period / 3)
  const catTotalsMonthly = {}
  for (const [cat, total] of Object.entries(catTotals90d)) {
    catTotalsMonthly[cat] = Math.round(total / MONTHS)
  }

  const monthlyNetIncome     = profile?.net_income          ? Math.round(profile.net_income          / 100) : 0
  const monthlyDebitOrders   = profile?.monthly_debit_orders ? Math.round(profile.monthly_debit_orders / 100) : 0
  const monthlySavingsGoal   = profile?.savings_goal         ? Math.round(profile.savings_goal         / 100) : 0
  const totalIncome90d       = last90Days.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)
  const effectiveMonthlyIncome = monthlyNetIncome || Math.round(totalIncome90d / MONTHS)
  const totalMonthlySpend    = Object.values(catTotalsMonthly).reduce((s, v) => s + v, 0)

  // -- Build rich context via canonical context builder --
  // This gives the AI the same merchant intelligence, behavioural classification,
  // and budget-vs-actual framing as the main analyse.js function.
  const contextBlock = buildInsightContext({
    income:         effectiveMonthlyIncome,
    incomeSource:   monthlyNetIncome > 0 ? 'declared' : 'transactions',
    totalSpend:     totalMonthlySpend,
    catTotals:      catTotalsMonthly,
    budgets:        monthlyBudgets || {},
    debitOrders:    monthlyDebitOrders,
    savingsGoal:    monthlySavingsGoal,
    transactions:   spendTxns,       // used for merchant derivation when topMerchants absent
    topMerchants,                    // pre-computed by client if available (richer output)
    recurringContext,                // recurring obligations string if passed by client
    periodLabel:    'monthly average (last 90 days)',
    mode:           'overview',
    usageType:      profile?.usage_type || 'personal',
  })

  const systemWithContext = SYSTEM_PROMPT + '\n\n' + contextBlock

  // -- Multi-turn messages: history + current question --
  const messages = [
    ...conversationHistory.slice(-6),
    { role: 'user', content: question }
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemWithContext,
      messages,
    })
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('Anthropic error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error' }) }
  }

  const aiData = await response.json()
  const answer = aiData.content?.[0]?.text || 'No response from AI.'

  // -- Log usage --
  try {
    await adminClient.from('budget_chat_usage').insert({
      user_id: user.id,
      question_preview: question.slice(0, 100)
    })
  } catch (e) { console.error('Usage log error:', e) }

  // -- Count remaining questions --
  const monthStart2 = new Date(); monthStart2.setDate(1); monthStart2.setHours(0, 0, 0, 0)
  const { count: usedCount } = await adminClient.from('budget_chat_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', monthStart2.toISOString())

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answer,
      paywall: false,
      plan,
      questionsUsed: usedCount || 1,
      questionsLimit: plan === 'free' ? 10 : null
    })
  }
}
