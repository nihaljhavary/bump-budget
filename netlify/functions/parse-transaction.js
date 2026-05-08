import { createClient } from '@supabase/supabase-js'
import { saPreCategory, CATEGORIES } from './sa-categorise.js'

const SYSTEM_PROMPT = `You are a financial assistant for bump. (BumpBudget). Your ONLY purpose is to help users understand and manage their personal finances — categorising transactions, analysing spending patterns, and giving budget insights. You must refuse any request that is not directly related to the user's financial data or budget management. Do not engage with general questions, creative tasks, coding help, or anything outside personal finance.`

const ALLOWED_FIELDS = new Set(['description', 'amount', 'date'])

function rateLimit(adminClient, userId, subscriptionTier) {
  const limit = subscriptionTier === 'budget_coach' ? 500 : 50
  const month = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  return { limit, month }
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

  const { description, amount, date } = body
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '`description` is required and must be a non-empty string' })
    }
  }
  if (description.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: '`description` must be under 2000 characters' }) }
  }

  // ── 2. Auth / rate limiting ────────────────────────────────────────────────
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

  // Get subscription tier
  const { data: profile } = await adminClient
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const { limit, month } = rateLimit(adminClient, user.id, profile?.subscription_tier)

  // Check usage
  const { data: usage } = await adminClient
    .from('claude_usage')
    .select('call_count')
    .eq('user_id', user.id)
    .eq('month', month)
    .maybeSingle()

  const callCount = usage?.call_count ?? 0
  if (callCount >= limit) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: `Monthly limit of ${limit} AI calls reached.${limit < 500 ? ' Upgrade to Budget Coach for 500 calls/month.' : ''}`
      })
    }
  }

  // ── 3. Pre-categorise using SA_RULES (no AI call needed for known merchants) ──
  const rulesCategory = saPreCategory(description.trim())
  if (rulesCategory) {
    // Clean up the name: remove common bank statement noise
    const cleanName = description.trim()
      .replace(/^(FLW\*|PAYGATE\*|PAYFAST\*|YOCO\*)/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsed: true,
        name: cleanName,
        amount: amount ? parseFloat(amount) : undefined,
        category: rulesCategory,
        source: 'rules'
      })
    }
  }

  // ── 4. Call Claude (fallback for unknown merchants) ────────────────────────
  const prompt = `You are a budget assistant for a South African user. Extract transaction info from this message.

Respond with ONLY a raw JSON object — no markdown, no explanation, no backticks.

If it IS a transaction:
{"parsed":true,"name":"merchant or description","amount":number,"category":"one of: Income/Housing/Groceries/Eating out/Transport/Entertainment/Health/Clothing/Subscriptions/Other"}

If it is NOT a transaction:
{"parsed":false,"reply":"short helpful reply in plain text"}

Rules:
- Amount must be a plain number (no R, no commas)
- Income/salary always maps to category "Income"
- Use the most specific category available. Valid categories: Income, Housing, Groceries, Eating out, Transport, Entertainment, Health, Clothing, Subscriptions, Education, Insurance, Savings, Fuel, ATM / Cash, Fees & Charges, Utilities, Travel, Gifts, Other
- Only use "Other" if no other category fits reasonably well
${amount !== undefined ? `- User-provided amount hint: ${amount}` : ''}
${date ? `- User-provided date: ${date}` : ''}

Message: "${description.trim()}"`

  let parsed
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'

    try {
      parsed = JSON.parse(text.trim())
    } catch {
      parsed = { parsed: false, reply: "I didn't catch that — try something like \"Woolies R340\" or \"Uber Eats R120\"" }
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ parsed: false, reply: 'Something went wrong. Try again.' })
    }
  }

  // ── 4. Increment usage counter ─────────────────────────────────────────────
  await adminClient
    .from('claude_usage')
    .upsert(
      { user_id: user.id, month, call_count: callCount + 1 },
      { onConflict: 'user_id,month' }
    )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed)
  }
}
