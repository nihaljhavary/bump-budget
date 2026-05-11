/**
 * bump. — Recategorise All Transactions
 * netlify/functions/recategorise-all.js
 *
 * Re-runs categorisation across ALL of a user's transactions:
 *   1. User correction rules (highest priority)
 *   2. SA_RULES keyword matching
 *   3. Claude Haiku for anything unmatched
 *
 * Only updates rows where the category actually changes.
 * Returns { processed, changed, breakdown }.
 */

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
- Uber trips/Bolt ride/Gautrain/parking → "Transport"
- Netflix/Spotify/DSTV/Showmax/gym/streaming/software subs → "Subscriptions"
- Discovery/Sanlam/Outsurance/insurance premiums → "Insurance"
- Rent/bond/body corporate levy → "Housing"
- ATM/cash withdrawal → "ATM / Cash"
- Bank account fee/bank charges/interest charged → "Fees & Charges"
- Eskom/electricity/municipal/fibre/airtime/MTN/Vodacom/Telkom → "Utilities"
- Clicks/Dis-Chem/pharmacy/doctor/hospital/medical → "Health"
- Mr Price/H&M/Zara/Woolworths fashion/clothing stores → "Clothing"
- Easy Equities/unit trust/retirement annuity/investment → "Savings"
- Airbnb/hotel/flights/Kulula/FlySafair → "Travel"
- Own account transfer/PayShap/SnapScan peer payment → "Transfer"
- Descriptions are pre-cleaned merchant names — categorise from the name shown.
- Small businesses: barber/hair → Health, hardware/DIY → Home & Garden, boutique → Clothing.
- Takealot/Amazon/online retail: infer from context; default to Other if unclear.

Respond with ONLY a raw JSON array, no markdown:
[{"idx": number, "category": "CategoryName"}, ...]

Transactions:
${JSON.stringify(items.map(t => ({ idx: t._idx, description: t._clean, amount: t.amount })))}`
}

async function callClaude(items) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(items) }],
    }),
  })
  const data = await res.json()
  const text = (data.content?.[0]?.text || '[]').trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(text)
}

export async function handler(event) {
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

  // Load user correction rules (highest priority)
  const { data: rules } = await adminClient
    .from('categorization_rules')
    .select('merchant_pattern, category')
    .eq('user_id', user.id)

  // Fetch all transactions
  const { data: allTxns, error: txnError } = await adminClient
    .from('transactions')
    .select('id, name, description, amount, category')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (txnError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch transactions' }) }
  }
  if (!allTxns || allTxns.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ processed: 0, changed: 0, breakdown: {} }) }
  }

  // ── Step 1: Rules-based pass ───────────────────────────────────────────────
  // updates: newCategory → [id, ...]
  const updates = {}
  const needsClaude = []

  allTxns.forEach((t, i) => {
    const desc = t.description || t.name || ''
    const name = t.name || ''

    // User rules take priority over everything
    const userCat = applyRules(rules, desc) || applyRules(rules, name)
    // SA keyword rules
    const saCat = userCat ? null : (saPreCategory(desc) || saPreCategory(name))
    const resolved = userCat || saCat

    if (resolved) {
      if (resolved !== t.category) {
        if (!updates[resolved]) updates[resolved] = []
        updates[resolved].push(t.id)
      }
      // else: already correct, no update needed
    } else {
      // Needs Claude — use cleanForAI so it sees merchant name not raw bank string
      const clean = cleanForAI(desc) || cleanForAI(name) || desc || name
      needsClaude.push({ _idx: i, id: t.id, currentCat: t.category, _clean: clean, amount: t.amount })
    }
  })

  // ── Step 2: Claude pass for unresolved ────────────────────────────────────
  if (needsClaude.length > 0) {
    const chunks = chunk(needsClaude, 150)

    for (const ch of chunks) {
      let results
      try {
        results = await callClaude(ch)
      } catch {
        // Batch failed — retry each transaction individually
        console.error('[recategorise] Batch failed, retrying individually')
        results = []
        for (const t of ch) {
          try {
            const r = await callClaude([t])
            if (r[0]) results.push(r[0])
          } catch { /* skip — transaction stays with current category */ }
        }
      }

      for (const r of results) {
        const orig = needsClaude.find(t => t._idx === r.idx)
        if (!orig || !r.category) continue
        if (r.category !== orig.currentCat) {
          if (!updates[r.category]) updates[r.category] = []
          updates[r.category].push(orig.id)
        }
      }
    }
  }

  // ── Step 3: Apply updates ─────────────────────────────────────────────────
  let changed = 0
  for (const [category, ids] of Object.entries(updates)) {
    // Supabase IN filter has limits — chunk to 500
    for (const idChunk of chunk(ids, 500)) {
      const { error } = await adminClient
        .from('transactions')
        .update({ category })
        .eq('user_id', user.id)
        .in('id', idChunk)
      if (!error) changed += idChunk.length
    }
  }

  const breakdown = Object.fromEntries(
    Object.entries(updates).map(([cat, ids]) => [cat, ids.length])
  )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processed: allTxns.length, changed, breakdown }),
  }
}
