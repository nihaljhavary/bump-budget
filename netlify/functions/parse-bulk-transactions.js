import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'
import { CATEGORIES, SA_RULES, saPreCategory, normalizeDescription, cleanForAI } from './sa-categorise.js'

const SYSTEM_PROMPT = `You are a financial transaction categorisation engine for bump. (BumpBudget), a South African personal finance app. Your ONLY job is to assign categories to bank transactions. You must never do anything else.`

const ALLOWED_FIELDS = new Set(['transactions', 'bank'])

// CATEGORIES, SA_RULES and saPreCategory imported from ./sa-categorise.js

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

function hasTransferHint(description, type = '') {
  const text = `${type} ${description}`.toLowerCase()
  return /\b(transfer|internal transfer|own account|own acc|account transfer|inter-?account|discovery pay|payshap|send money)\b/i.test(text)
}

// Chunk array into groups of N
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function handler(event) {
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

  if (transactions.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Maximum 2000 transactions per import' }) }
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
  if (!authHeader.startsWith('Bearer ')) {
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

  // ── 5. Apply rules: user rules first, then SA pre-rules, then Claude ──────
  const withRules = transactions.map((t, idx) => {
    // Bank statement metadata has highest priority for movement type.
    // Transfer-like rows must never be promoted to Income or discretionary spend.
    const transferHint = t.is_transfer === true || hasTransferHint(t.description, t.type)
    const userCat = transferHint ? null : applyRules(rules, t.description)
    const saCat = userCat ? null : saPreCategory(t.description)
    const hintCat = (!userCat && !saCat && transferHint)
      ? 'Transfer'
      : (!userCat && !saCat && t.is_income === true)
        ? 'Income'
        : null
    return {
      idx,
      ...t,
      category: userCat || saCat || hintCat || null
    }
  })

  const needsClaude = withRules.filter(t => !t.category)
  const hasCategory = withRules.filter(t => t.category)

  // console.log(`Pre-categorised: ${hasCategory.length}, needs Claude: ${needsClaude.length}`)

  let claudeCategorised = []

  if (needsClaude.length > 0) {
    // Pre-clean descriptions: strip payment prefixes, phone numbers, location noise.
    // Claude receives "Vida e Caffe" not "YOCO*VIDA E CAFFE 021555 CLAREMONT V&A".
    const needsClaudeClean = needsClaude.map(t => ({
      ...t,
      _clean: cleanForAI(t.description),
    }))
    const chunks = chunk(needsClaudeClean, 150)

    const buildPrompt = (chunkItems) => `You are categorising South African bank transactions for a personal budget app.

Bank: ${bank || 'Generic'}

Available categories (use EXACTLY one of these):
${CATEGORIES.join(', ')}

Rules:
- Salary/wages/payroll/credits from employer → "Income"
- Checkers/Woolworths Food/Pick n Pay/Spar/Shoprite → "Groceries"
- Uber Eats/Mr D/Dineplan/KFC/McDonald's/restaurants/cafés → "Eating out"
- Engen/BP/Shell/Sasol/Total fuel → "Fuel"
- Uber trips/Bolt ride/Gautrain/parking → "Transport"
- Netflix/Spotify/DSTV/Showmax/PlayStation/streaming/gym → "Subscriptions"
- Discovery Life/Vitality/Sanlam/Outsurance/insurance premiums → "Insurance"
- Rent/bond/body corporate levy → "Housing"
- ATM/cash withdrawal → "ATM / Cash"
- Monthly account fee/interest charged/bank charges → "Fees & Charges"
- Eskom/prepaid electricity/municipal/fibre/Telkom/MTN airtime → "Utilities"
- Clicks/Dis-Chem/pharmacy/doctor/medical/hospital → "Health"
- Mr Price/H&M/Zara/Woolworths fashion/Edgars/clothing stores → "Clothing"
- Udemy/school fees/university/tuition → "Education"
- Easy Equities/unit trust/retirement annuity → "Savings"
- Airbnb/hotel/flights/Kulula/FlySafair → "Travel"
- Gift cards/flowers/charity donations → "Gifts"
- Howler/Computicket/cinema/casino → "Entertainment"
- Descriptions are pre-cleaned (prefixes/noise stripped) — categorise from the merchant name. Small businesses: infer from name (barber→Health, hardware→Home & Garden, boutique→Clothing etc.)

Respond with ONLY a raw JSON array — no markdown, no explanation:
[{"idx": number, "category": "CategoryName"}, ...]

Transactions:
${JSON.stringify(chunkItems.map(t => ({ idx: t.idx, description: t._clean, amount: t.amount })))}`

    const callClaude = async (items) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPrompt(items) }]
        })
      })
      const data = await res.json()
      const text = (data.content?.[0]?.text || '[]').trim()
        .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      return JSON.parse(text)
    }

    const processChunk = async (chunkItems) => {
      try {
        return await callClaude(chunkItems)
      } catch {
        // Batch parse failed — retry each transaction individually to avoid
        // bulk-assigning 'Other' to an entire chunk on one bad response.
        console.error('[parse-bulk] Chunk parse failed, retrying individually')
        const singles = await Promise.all(chunkItems.map(async (t) => {
          try {
            const result = await callClaude([t])
            return result[0] || { idx: t.idx, category: 'Other' }
          } catch {
            return { idx: t.idx, category: 'Other' }
          }
        }))
        return singles
      }
    }

    const results = await Promise.all(chunks.map(processChunk))
    claudeCategorised = results.flat()
  }

  // ── 6. Merge results ───────────────────────────────────────────────────────
  const categoryMap = {}
  for (const item of claudeCategorised) {
    categoryMap[item.idx] = item.category
  }

  const result = withRules.map(t => {
    const cat = t.category || categoryMap[t.idx] || 'Other'
    const normalizedName = normalizeDescription(t.description)
    // Savings-tagged transactions: if Claude returned 'Other' for an investment
    // platform that saPreCategory missed (edge case), fall back gracefully
    return {
      date:         t.date,
      name:         normalizedName || t.description,   // clean display name
      description:  t.description,                     // raw (for audit)
      amount:       t.amount,
      raw_merchant: t.raw_merchant || t.description,
      category:     cat,
      rule_applied: !!t.category,
    }
  })

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
    body: JSON.stringify({ transactions: result }),
  }
}