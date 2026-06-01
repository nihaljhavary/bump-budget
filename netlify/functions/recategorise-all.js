/**
 * bump. — Recategorise All Transactions
 * netlify/functions/recategorise-all.js
 *
 * Strategy (fast enough for Netlify's 10s limit):
 *   1. User correction rules  — applied to every transaction
 *   2. SA_RULES keyword match — applied to every transaction
 *   3. Claude Haiku           — ONLY for transactions still in "Other"
 *      Batches run in parallel (not sequential) to stay under timeout.
 *
 * Only updates rows where the category actually changes.
 * Returns { processed, changed, breakdown }.
 */

import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'
import { saPreCategory, cleanForAI } from './sa-categorise.js'

const SYSTEM_PROMPT = `You are a South African bank transaction categorisation engine. Your ONLY job is to assign categories. Never do anything else.`

const CATEGORIES = [
  'Income','Transfer','Housing','Groceries','Eating out','Transport',
  'Entertainment','Health','Clothing','Subscriptions','Education','Insurance',
  'Savings','Fuel','ATM / Cash','Fees & Charges','Utilities','Travel',
  'Gifts','Home & Garden','Other',
]

function applyRules(rules, text) {
  if (!rules || rules.length === 0 || !text) return null
  const lower = text.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.merchant_pattern.toLowerCase())) return rule.category
  }
  return null
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function buildPrompt(items) {
  return `Categorise these South African bank transactions.

Valid categories (use EXACTLY one): ${CATEGORIES.join(', ')}

Rules:
- Salary/wages/payroll/employer credit → "Income"
- Checkers/Woolworths Food/Pick n Pay/Spar/Shoprite → "Groceries"
- Uber Eats/Mr D/KFC/McDonald's/restaurants/cafes/bakeries → "Eating out"
- Engen/BP/Shell/Sasol/Total fuel stations → "Fuel"
- Uber/Bolt ride/Gautrain/MyCiti/parking → "Transport"
- Netflix/Spotify/DSTV/Showmax/gym memberships → "Subscriptions"
- Discovery/Sanlam/Outsurance/insurance premiums → "Insurance"
- Rent/bond/body corporate → "Housing"
- ATM/cash withdrawal → "ATM / Cash"
- Bank fees/interest charged/bank charges → "Fees & Charges"
- Eskom/electricity/municipal/fibre/airtime → "Utilities"
- Clicks/Dis-Chem/pharmacy/doctor/hospital → "Health"
- Mr Price/H&M/Zara/clothing stores → "Clothing"
- School fees/university/tuition/Udemy → "Education"
- Easy Equities/unit trust/retirement annuity → "Savings"
- Airbnb/hotel/flights → "Travel"
- Gift cards/flowers/donations → "Gifts"
- Cinema/casino/Computicket/events → "Entertainment"
- Names stripped of bank noise — infer from the merchant name

Respond with ONLY a raw JSON array: [{"idx":0,"category":"..."},...]

Transactions:
${JSON.stringify(items.map(t => ({ idx: t._idx, description: t._clean, amount: t.amount })))}`
}

async function callClaude(items) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7000)  // 7s per batch max
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(items) }],
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data)
      console.error(`[recat] Anthropic API error ${res.status}: ${errMsg}`)
      throw new Error(`Anthropic ${res.status}: ${errMsg}`)
    }
    const rawText = data.content?.[0]?.text
    if (!rawText) {
      console.error('[recat] Anthropic returned no content:', JSON.stringify(data))
      throw new Error('Anthropic returned empty response')
    }
    const text = rawText.trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

export async function handler(event) {
  try {
    return await _handler(event)
  } catch (err) {
    console.error('[recat] Unhandled error:', err.message, err.stack)
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Recategorisation failed. Please try again.' }) }
  }
}

async function _handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // -- Rate limiting: 3 full recategorisations/day for free users (expensive AI call) --
  const { data: profile } = await adminClient.from('profiles').select('subscription_plan, subscription_status').eq('id', user.id).maybeSingle()
  const isPaid = profile && ['starter','growth','pro'].includes(profile.subscription_plan) && profile.subscription_status === 'active'
  if (!isPaid) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await adminClient.from('function_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('function_name', 'recategorise-all').gte('created_at', since)
    if ((count || 0) >= 3) {
      return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Daily recategorisation limit reached. Upgrade to a paid plan for unlimited use.' }) }
    }
  }
  adminClient.from('function_calls').insert({ user_id: user.id, function_name: 'recategorise-all' }).then(() => {}).catch(() => {})

  const { data: rules } = await adminClient
    .from('categorization_rules')
    .select('merchant_pattern, category')
    .eq('user_id', user.id)

  const { data: allTxns, error: txnError } = await adminClient
    .from('transactions')
    .select('id, name, amount, category')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (txnError) { console.error('[recat] txn fetch error:', txnError); return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch transactions: ${txnError.message || JSON.stringify(txnError)}` }) } }
  if (!allTxns || allTxns.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processed: 0, changed: 0, breakdown: {} }) }
  }

  // ── Step 1: Rules pass (fast, no network) ─────────────────────────────────
  const updates = {}   // { newCategory: [id, ...] }
  const needsClaude = []  // only "Other" transactions SA_RULES couldn't resolve

  allTxns.forEach((t, i) => {
    const desc = t.name || ''
    const name = t.name || ''
    const userCat = applyRules(rules, desc) || applyRules(rules, name)
    const saCat   = userCat ? null : (saPreCategory(desc) || saPreCategory(name))
    const resolved = userCat || saCat

    if (resolved) {
      if (resolved !== t.category) {
        if (!updates[resolved]) updates[resolved] = []
        updates[resolved].push(t.id)
      }
    } else if (t.category === 'Other' || !t.category) {
      // Only send genuinely unresolved "Other" transactions to Claude
      const clean = cleanForAI(desc) || cleanForAI(name) || desc || name
      needsClaude.push({ _idx: i, id: t.id, currentCat: t.category, _clean: clean, amount: t.amount })
    }
    // If already in a specific category (not Other) and no rule override → leave it alone
  })

  // ── Step 2: Claude pass — parallel batches, "Other" only ─────────────────
  if (needsClaude.length > 0) {
    const chunks = chunk(needsClaude, 100)  // smaller batches = faster per call

    // Run batches in parallel — if a batch fails, skip it (don't retry individually)
    const chunkResults = await Promise.all(chunks.map(async (ch) => {
      try {
        return await callClaude(ch)
      } catch (e) {
        console.error(`[recat] Batch of ${ch.length} failed: ${e.message}`)
        return []  // Skip failed batch — rules pass already handled what it could
      }
    }))

    for (const results of chunkResults) {
      for (const r of results) {
        const orig = needsClaude.find(t => t._idx === r.idx)
        if (!orig || !r.category || r.category === orig.currentCat) continue
        if (!updates[r.category]) updates[r.category] = []
        updates[r.category].push(orig.id)
      }
    }
  }

  // ── Step 3: Apply updates ─────────────────────────────────────────────────
  let changed = 0
  for (const [category, ids] of Object.entries(updates)) {
    for (const idChunk of chunk(ids, 500)) {
      const { error } = await adminClient
        .from('transactions')
        .update({ category })
        .eq('user_id', user.id)
        .in('id', idChunk)
      if (!error) changed += idChunk.length
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processed: allTxns.length,
      changed,
      breakdown: Object.fromEntries(Object.entries(updates).map(([cat, ids]) => [cat, ids.length])),
    }),
  }
}
