import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const FORMAT_RULES = `Never use em dashes (—). Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose.`

const SYSTEM_PROMPT = `You are bump.'s personal finance coach -- a warm, sharp South African money advisor. You have the user's actual transaction data below. Answer their question directly and specifically. Always cite real rand amounts from their data. Be like a knowledgeable friend: honest, constructive, never robotic. 2-4 sentences per answer unless the question needs more.

South African context: ZAR currency. Common retailers: Woolworths, Checkers, Pick n Pay, Shoprite, Dis-Chem. Banks: FNB, ABSA, Nedbank, Capitec, Standard Bank, Discovery Bank, TymeBank.

${FORMAT_RULES}`

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { question, transactions, profile, monthlyBudgets, conversationHistory = [] } = body

  // Auth
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }

  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Rate limiting: free users get 10 questions/month
  const { data: profileData } = await adminClient.from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', user.id).single()

  const plan = profileData?.subscription_plan || 'free'
  const isAdmin = profileData?.is_admin === true

  if (!isAdmin && plan === 'free') {
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0,0,0,0)
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

  // Build context from last 90 days
  const now = new Date()
  const last90Days = (transactions || []).filter(t => {
    const d = new Date(t.date)
    return (now - d) / (1000 * 60 * 60 * 24) <= 90
  })

  const catTotals = {}
  for (const t of last90Days) {
    // Exclude non-spend categories -- transfers and savings are not lifestyle spend
    if (t.category === 'Income' || t.category === 'Transfer' || t.category === 'Savings') continue
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount
  }
  const totalSpend = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const totalIncome = last90Days.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)

  // Pre-compute monthly averages
  const monthlyNetIncome = profile?.net_income ? Math.round(profile.net_income / 100) : 0
  const monthlyDebitOrders = profile?.monthly_debit_orders ? Math.round(profile.monthly_debit_orders / 100) : 0
  const monthlySavingsGoal = profile?.savings_goal ? Math.round(profile.savings_goal / 100) : 0
  const avgMonthlySpend = Math.round(totalSpend / 3)
  const avgMonthlyIncome = totalIncome > 0 ? Math.round(totalIncome / 3) : monthlyNetIncome
  const avgMonthlyNet = avgMonthlyIncome - avgMonthlySpend
  const savingsRate = avgMonthlyIncome > 0 ? Math.round((avgMonthlyNet / avgMonthlyIncome) * 100) : 0
  const savingsShortfall = monthlySavingsGoal > 0 ? monthlySavingsGoal - avgMonthlyNet : 0

  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, amt]) => {
      const monthly = Math.round(amt / 3)
      const budget = monthlyBudgets?.[cat] ? Math.round(monthlyBudgets[cat]) : null
      if (budget) {
        const diff = monthly - budget
        const status = diff > 0 ? `OVER by R${Math.round(diff).toLocaleString('en-ZA')}` : diff > -budget * 0.2 ? 'near limit' : 'on track'
        return `${cat}: R${monthly.toLocaleString('en-ZA')}/mo avg (budget R${budget.toLocaleString('en-ZA')}) -- ${status}`
      }
      return `${cat}: R${monthly.toLocaleString('en-ZA')}/mo avg`
    })
    .join('\n')

  const contextBlock = `
USER FINANCIAL CONTEXT (90-day average, transfers excluded):
Monthly net income: ${monthlyNetIncome > 0 ? 'R' + monthlyNetIncome.toLocaleString('en-ZA') + '/mo (declared)' : avgMonthlyIncome > 0 ? 'R' + avgMonthlyIncome.toLocaleString('en-ZA') + '/mo (from transactions)' : 'unknown'}
Fixed debit orders: ${monthlyDebitOrders > 0 ? 'R' + monthlyDebitOrders.toLocaleString('en-ZA') + '/mo' : 'unknown'}
Savings goal: ${monthlySavingsGoal > 0 ? 'R' + monthlySavingsGoal.toLocaleString('en-ZA') + '/mo' : 'not set'}
Bank: ${profile?.bank || 'unknown'}

AVERAGE MONTHLY PERFORMANCE:
Avg spend: R${avgMonthlySpend.toLocaleString('en-ZA')}/mo
Avg income: R${avgMonthlyIncome.toLocaleString('en-ZA')}/mo
Avg net: ${avgMonthlyNet >= 0 ? 'R' + avgMonthlyNet.toLocaleString('en-ZA') + ' surplus' : 'R' + Math.abs(avgMonthlyNet).toLocaleString('en-ZA') + ' DEFICIT'}
Savings rate: ${savingsRate}%${monthlySavingsGoal > 0 ? (savingsShortfall > 0 ? ` (SHORT of R${monthlySavingsGoal.toLocaleString('en-ZA')} goal by R${savingsShortfall.toLocaleString('en-ZA')})` : ' (meeting savings goal)') : ''}

CATEGORY BREAKDOWN (monthly averages, budget vs actual):
${catSummary}

${monthlyBudgets && Object.keys(monthlyBudgets).length > 0 ? `Monthly budgets set:\n${Object.entries(monthlyBudgets).map(([cat, amt]) => `${cat}: R${Math.round(amt).toLocaleString('en-ZA')}`).join('\n')}` : 'No budgets set yet.'}`

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
      system: SYSTEM_PROMPT + '\n\n' + contextBlock,
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

  // Log usage
  try {
    await adminClient.from('budget_chat_usage').insert({ user_id: user.id, question_preview: question.slice(0, 100) })
  } catch (e) { console.error('Usage log error:', e) }

  // Count remaining
  const monthStart2 = new Date(); monthStart2.setDate(1); monthStart2.setHours(0,0,0,0)
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
