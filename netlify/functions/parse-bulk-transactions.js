import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a financial transaction categorisation engine for bump. (BumpBudget), a South African personal finance app. Your ONLY job is to assign categories to bank transactions. You must never do anything else.`

const ALLOWED_FIELDS = new Set(['transactions', 'bank'])

const CATEGORIES = [
  'Income', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Other'
]

// Apply user-defined categorisation rules to a transaction
function applyRules(rules, description) {
  if (!rules || rules.length === 0) return null
  const lower = description.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.merchant_pattern.toLowerCase())) {
      return rule.category
    }
  }
  return null
}

// Chunk array into groups of N
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function handler(event) {
  console.log('parse-bulk-transactions called', event.httpMethod)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── 1. Parse + validate ────────────────────────────────────────────────────
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

  const { transactions, bank } = body

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: '`transactions` must be a non-empty array' }) }
  }

  if (transactions.length > 500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Maximum 500 transactions per import' }) }
  }

  // Validate each row
  for (const t of transactions) {
    if (!t.description || typeof t.description !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Each transaction needs a `description` string' }) }
    }
    if (typeof t.amount !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Each transaction needs an `amount` number' }) }
    }
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  console.log('auth header present:', authHeader.startsWith('Bearer '))
  if (!authHeader.startsWith('Bearer ')) {
    console.log('returning 401 - no bearer token')
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized - no session token' }) }
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

  // ── 3. Rate limiting ───────────────────────────────────────────────────────
  const { data: profile } = await adminClient
    .from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', user.id)
    .single()

  // Admins get unlimited; pro/growth get 500; starter/free get 50
  const plan = profile?.subscription_plan || 'free'
  const isAdmin = profile?.is_admin || false
  const limit = isAdmin ? Infinity : (plan === 'pro' || plan === 'growth') ? 500 : 50
  const month = new Date().toISOString().slice(0, 7)

  const { data: usage } = await adminClient
    .from('ai_usage')
    .select('call_count')
    .eq('user_id', user.id)
    .eq('month', month)
    .maybeSingle()

  const callCount = usage?.call_count ?? 0

  // Bulk import counts as 1 call (not one per transaction)
  if (limit !== Infinity && callCount >= limit) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: `Monthly limit of ${limit} AI analyses reached. Upgrade your plan for more.`
      })
    }
  }

  // ── 4. Load user's categorisation rules ───────────────────────────────────
  const { data: rules } = await adminClient
    .from('categorization_rules')
    .select('merchant_pattern, category')
    .eq('user_id', user.id)

  // ── 5. Apply rules first, then Claude for the rest ────────────────────────
  const withRules = transactions.map((t, idx) => ({
    idx,
    ...t,
    category: applyRules(rules, t.description) || null
  }))

  const needsClaude = withRules.filter(t => !t.category)
  const hasCategory = withRules.filter(t => t.category)

  let claudeCategorised = []

  if (needsClaude.length > 0) {
    // Process in chunks of 50 to stay within Claude's context
    const chunks = chunk(needsClaude, 50)

    for (const chunkItems of chunks) {
      const prompt = `You are categorising South African bank transactions for a personal budget app.

Bank: ${bank || 'Generic'}

Available categories (use EXACTLY one of these):
${CATEGORIES.join(', ')}

Rules:
- Income/salary/wages → "Income"
- Checkers/Woolworths/Pick n Pay/Spar/Shoprite → "Groceries"
- Uber Eats/Mr Delivery/KFC/McDonald's/Debonairs/restaurants → "Eating out"
- Engen/BP/Shell/Sasol (fuel purchase) → "Fuel"
- Uber/inDriver/Bolt ride/taxi → "Transport"
- Netflix/Spotify/DSTV/streaming → "Subscriptions"
- Discovery/Momentum/Sanlam/life insurance → "Insurance"
- Rent/bond/sectional title → "Housing"
- ATM/cash withdrawal → "ATM / Cash"
- Bank fees/service charges/monthly fees → "Fees & Charges"
- Electricity/water/municipal → "Utilities"
- Clicks/Dis-Chem/pharmacy/doctor → "Health"
- Mr Price/Woolworths fashion/H&M/Zara → "Clothing"
- Takealot/Amazon → "Other" (unless clearly something else)
- School fees/university → "Education"
- FNB/Nedbank/ABSA/Standard Bank savings/investment → "Savings"
- Flights/Airbnb/hotel → "Travel"
- Debit amounts are expenses, credit amounts are income

Respond with ONLY a raw JSON array — no markdown, no explanation:
[{"idx": number, "category": "CategoryName"}, ...]

Transactions:
${JSON.stringify(chunkItems.map(t => ({ idx: t.idx, description: t.description, amount: t.amount })))}
`

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
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        const data = await res.json()
        const text = data.content?.[0]?.text || '[]'

        let parsed = []
        try {
          // Strip any markdown fences if present
          const clean = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          parsed = JSON.parse(clean)
        } catch {
          // Fallback: mark all as Other
          parsed = chunkItems.map(t => ({ idx: t.idx, category: 'Other' }))
        }

        claudeCategorised = [...claudeCategorised, ...parsed]
      } catch {
        // On error, mark as Other
        claudeCategorised = [...claudeCategorised, ...chunkItems.map(t => ({ idx: t.idx, category: 'Other' }))]
      }
    }
  }

  // ── 6. Merge results ───────────────────────────────────────────────────────
  const categoryMap = {}
  for (const item of claudeCategorised) {
    categoryMap[item.idx] = item.category
  }

  const result = withRules.map(t => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    raw_merchant: t.raw_merchant || t.description,
    category: t.category || categoryMap[t.idx] || 'Other',
    rule_applied: !!t.category
  }))

  // ── 7. Increment usage (1 call per bulk import) ───────────────────────────
  if (limit !== Infinity) {
    await adminClient
      .from('ai_usage')
      .upsert(
        { user_id: user.id, month, call_count: callCount + 1 },
        { onConflict: 'user_id,month' }
      )
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: result, rules_applied: hasCategory.length })
  }
}
