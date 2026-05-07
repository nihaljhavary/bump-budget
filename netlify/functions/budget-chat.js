import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are bump.'s personal finance coach — a warm, direct, South African money advisor. You have been given a user's recent transaction data, their income, and their fixed expenses. Answer questions about their spending clearly and honestly. Give specific Rand amounts. Be concise (2-4 sentences max per answer). Always be constructive and actionable.

South African context:
- Currency is ZAR (Rand), amounts are stored as integer cents (divide by 100 for Rands)
- Common categories: Groceries, Eating out, Transport, Housing, Entertainment, Health, Fuel, Subscriptions, Utilities
- Retailers: Woolworths, Checkers, Pick n Pay, Shoprite, Spar, Dis-Chem, Clicks
- Banks: FNB, ABSA, Nedbank, Capitec, Standard Bank, Discovery Bank, TymeBank`

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

  // Build context
  const now = new Date()
  const last90Days = (transactions || []).filter(t => {
    const d = new Date(t.date)
    return (now - d) / (1000 * 60 * 60 * 24) <= 90
  })

  const catTotals = {}
  for (const t of last90Days) {
    if (t.category !== 'Income') catTotals[t.category] = (catTotals[t.category] || 0) + t.amount
  }
  const totalSpend = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const totalIncome = last90Days.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)

  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, amt]) => `${cat}: R${Math.round(amt/100).toLocaleString('en-ZA')} over 90 days (avg R${Math.round(amt/100/3).toLocaleString('en-ZA')}/mo)`)
    .join('\n')

  const contextBlock = `
USER FINANCIAL CONTEXT (last 90 days):
Net income: ${profile?.net_income ? 'R'+Math.round(profile.net_income/100).toLocaleString('en-ZA')+'/mo' : 'unknown'}
Fixed debit orders: ${profile?.monthly_debit_orders ? 'R'+Math.round(profile.monthly_debit_orders/100).toLocaleString('en-ZA')+'/mo' : 'unknown'}
Savings goal: ${profile?.savings_goal ? 'R'+Math.round(profile.savings_goal/100).toLocaleString('en-ZA')+'/mo' : 'not set'}
Bank: ${profile?.bank || 'unknown'}
Discovery Vitality cashback: ${profile?.vitality_cashback_pct > 0 ? profile.vitality_cashback_pct+'%' : 'none'}

SPENDING LAST 90 DAYS:
Total spend: R${Math.round(totalSpend/100).toLocaleString('en-ZA')}
Total income: R${Math.round(totalIncome/100).toLocaleString('en-ZA')}
Net: R${Math.round((totalIncome-totalSpend)/100).toLocaleString('en-ZA')}

Category breakdown:
${catSummary}

${monthlyBudgets && Object.keys(monthlyBudgets).length > 0 ? `Monthly budgets set:\n${Object.entries(monthlyBudgets).map(([cat, amt]) => `${cat}: R${Math.round(amt/100).toLocaleString('en-ZA')}`).join('\n')}` : 'No budgets set yet.'}`

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
