/**
 * bump. — Merchant AI Enrichment
 * netlify/functions/enrich-merchant.js
 *
 * AI fallback for merchants not in the canonical DB or SA_RULES.
 * Takes a raw transaction description and returns:
 *   - category (one of bump's canonical categories)
 *   - displayName (clean human-readable merchant name)
 *   - confidence (0-1)
 *   - type ('subscription' | 'debit_order' | 'once_off' | 'restaurant' | 'grocery' | etc.)
 *
 * Used by the client when getCanonicalMerchant() returns null and
 * inferCategoryFromKeywords() returns confidence < 0.65.
 *
 * Auth required. Rate-limited to same pool as parse-transaction (claude_usage table).
 */

import { createClient } from '@supabase/supabase-js'
import { saPreCategory, normalizeDescription } from './sa-categorise.js'

const SYSTEM_PROMPT = `You are a South African bank transaction categoriser. Your ONLY job is to assign a category and clean display name to a transaction. Never do anything else.`

const CATEGORIES = [
  'Income','Housing','Groceries','Eating out','Transport','Entertainment',
  'Health','Clothing','Subscriptions','Education','Insurance','Savings',
  'Fuel','ATM / Cash','Fees & Charges','Utilities','Travel','Gifts',
  'Home & Garden','Other'
]

const ALLOWED_FIELDS = new Set(['description', 'amount'])

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const extra = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k))
  if (extra.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unexpected fields: ${extra.join(', ')}` }) }
  }

  const { description, amount } = body
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: '`description` required' }) }
  }
  if (description.length > 500) {
    return { statusCode: 400, body: JSON.stringify({ error: '`description` too long' }) }
  }

  // Auth
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

  // Try rules-based first (avoid burning an AI call)
  const rulesCategory = saPreCategory(description.trim())
  if (rulesCategory) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: normalizeDescription(description.trim()),
        category:    rulesCategory,
        confidence:  0.95,
        source:      'rules',
      })
    }
  }

  // Rate limit check (shared pool with parse-transaction)
  const month = new Date().toISOString().slice(0, 7)
  const { data: profile } = await adminClient
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const limit = profile?.subscription_tier === 'budget_coach' ? 500 : 50
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
      body: JSON.stringify({ error: `Monthly AI limit of ${limit} reached.` })
    }
  }

  // AI enrichment
  const prompt = `Categorise this South African bank transaction.

Respond with ONLY a raw JSON object:
{"displayName":"clean merchant name","category":"one of the valid categories","confidence":0.0_to_1.0,"type":"subscription|debit_order|once_off|restaurant|grocery|fuel|retail|utility|salary"}

Valid categories: ${CATEGORIES.join(', ')}

Rules:
- Salary/wages/employer credit → "Income"
- Strip payment processor prefixes (PAYFAST*, FLW*, YOCO*, SNAPSCAN*)
- displayName should be the merchant name only, title-cased, without branch codes or ref numbers
- confidence: 0.9 if certain, 0.7 if probable, 0.5 if guessing

Transaction: "${description.trim()}"${amount !== undefined ? `\nAmount: R${amount}` : ''}`

  let result
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      })
    })

    const data = await res.json()
    const text = (data.content?.[0]?.text || '{}').trim()
    try {
      result = JSON.parse(text)
    } catch {
      result = { displayName: normalizeDescription(description.trim()), category: 'Other', confidence: 0.3 }
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Enrichment unavailable' })
    }
  }

  // Increment usage
  await adminClient
    .from('claude_usage')
    .upsert(
      { user_id: user.id, month, call_count: callCount + 1 },
      { onConflict: 'user_id,month' }
    )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...result, source: 'ai' })
  }
}
