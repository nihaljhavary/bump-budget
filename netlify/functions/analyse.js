import { createClient } from '@supabase/supabase-js'

const FORMAT_RULES = `Format rules (always follow): Never use em dashes (—). Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose with numbered or bulleted lists where appropriate.`

const SYSTEM_PROMPT = `You are a financial assistant for bump. (BumpBudget). Your ONLY purpose is to help users understand and manage their personal finances — categorising transactions, analysing spending patterns, and giving budget insights. You must refuse any request that is not directly related to the user's financial data or budget management. Do not engage with general questions, creative tasks, coding help, or anything outside personal finance.

${FORMAT_RULES}`

const ALLOWED_FIELDS = new Set(['transactions', 'question', 'declaredIncome'])

const DEFAULT_BUDGETS = {
  Housing: 9500, Groceries: 3000, 'Eating out': 2000, Transport: 2500,
  Entertainment: 1500, Health: 1000, Clothing: 1000, Subscriptions: 500, Other: 1000
}

export async function handler(event) {
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
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unexpected fields: ${extraFields.join(', ')}` })
    }
  }

  const { transactions, question, declaredIncome } = body

  if (!Array.isArray(transactions)) {
    return { statusCode: 400, body: JSON.stringify({ error: '`transactions` must be an array' }) }
  }

  if (question !== undefined && question !== null) {
    if (typeof question !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: '`question` must be a string' }) }
    }
    if (question.length > 500) {
      return { statusCode: 400, body: JSON.stringify({ error: '`question` must be under 500 characters' }) }
    }
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // ── 3. Plan check + rate limiting (free users only) ───────────────────────
  const { data: profileData } = await adminClient
    .from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', user.id)
    .single()

  const plan = profileData?.subscription_plan || 'free'
  const isAdmin = profileData?.is_admin === true

  // Free users: 10 analyses/month tracked via budget_chat_usage (same table as budget-chat)
  // Entries from this function use question_preview: '[analysis]'
  if (!isAdmin && plan === 'free') {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await adminClient
      .from('budget_chat_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart.toISOString())

    if ((count || 0) >= 10) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Monthly AI analysis limit reached. Upgrade to a paid plan for unlimited analysis.'
        })
      }
    }
  }

  // ── 4. Build analysis context from transactions ────────────────────────────
  const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

  const txnIncome = transactions
    .filter(t => t.category === 'Income')
    .reduce((s, t) => s + t.amount, 0)
  // Use declared income as fallback when no income transactions exist
  const income = txnIncome > 0 ? txnIncome : (declaredIncome || 0)
  const incomeSource = txnIncome > 0 ? 'from transactions' : (declaredIncome > 0 ? 'declared take-home salary' : 'unknown')

  const totalSpend = transactions
    .filter(t => t.category !== 'Income')
    .reduce((s, t) => s + t.amount, 0)

  const net = income - totalSpend

  const catTotals = {}
  transactions
    .filter(t => t.category !== 'Income')
    .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount })

  const catLines = Object.entries(catTotals).map(([cat, amt]) => {
    const budget = DEFAULT_BUDGETS[cat] || 1000
    const status = amt > budget
      ? `OVER by ${fmt(amt - budget)}`
      : amt > budget * 0.8 ? 'NEAR limit' : 'on track'
    return `${cat}: spent ${fmt(amt)} vs budget ${fmt(budget)} — ${status}`
  }).join('\n')

  const userQuestion = question && question.trim()
    ? `\n\nUser's specific question: "${question.trim()}"\nAddress this question directly in your response.`
    : ''

  const prompt = `You are a personal finance analyst for a South African user. Be sharp, direct, and specific. Under 150 words. No headers. Short punchy paragraphs.

Monthly income: ${fmt(income)} (${incomeSource})
Total spend: ${fmt(totalSpend)} (${income > 0 ? Math.round(totalSpend / income * 100) : 0}% of income)
Net position: ${fmt(net)} ${net >= 0 ? 'surplus' : 'DEFICIT'}

Category breakdown:
${catLines || 'No spending data yet.'}

Deliver:
1. Top 2 overspend alerts — name the category, the rand amount over, and one concrete fix
2. One positive observation
3. Net position summary with a savings rate comment

Speak directly. Use rands not percentages where possible. Be like a smart friend who knows finance, not a corporate report.${userQuestion}`

  // ── 5. Call Claude ─────────────────────────────────────────────────────────
  let analysis
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    analysis = data.content?.[0]?.text || 'Analysis unavailable.'
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ analysis: 'Analysis failed. Try again.' })
    }
  }

  // ── 6. Log usage for free users ────────────────────────────────────────────
  if (!isAdmin && plan === 'free') {
    try {
      await adminClient
        .from('budget_chat_usage')
        .insert({ user_id: user.id, question_preview: '[analysis]' })
    } catch (e) {
      console.error('Usage log error:', e)
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis })
  }
}
