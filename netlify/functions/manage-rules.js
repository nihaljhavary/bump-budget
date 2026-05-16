import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a financial assistant for bump. (BumpBudget). Your ONLY purpose is to help users understand and manage their personal finances.`

const CATEGORIES = [
  'Income', 'Transfer', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Home & Garden', 'Other'
]

// Parse a natural-language rule like "make all engen transactions = Fuel"
async function parseRuleFromText(text) {
  const prompt = `A user wants to create a transaction categorisation rule. Extract the merchant pattern and category from their request.

Available categories: ${CATEGORIES.join(', ')}

User said: "${text}"

Respond with ONLY a raw JSON object:
{"merchant_pattern": "lowercase merchant name or keyword", "category": "ExactCategoryName"}

If you cannot parse a clear rule, respond: {"error": "Could not parse rule"}

Examples:
- "make all engen = fuel" → {"merchant_pattern": "engen", "category": "Fuel"}
- "woolworths should be groceries" → {"merchant_pattern": "woolworths", "category": "Groceries"}
- "all netflix is subscriptions" → {"merchant_pattern": "netflix", "category": "Subscriptions"}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  const text2 = data.content?.[0]?.text || '{}'
  try {
    return JSON.parse(text2.trim())
  } catch {
    return { error: 'Could not parse rule' }
  }
}

export async function handler(event) {
  const method = event.httpMethod

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Auth
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  // GET — list rules
  if (method === 'GET') {
    const { data, error } = await adminClient
      .from('categorization_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: data }) }
  }

  // POST — create rule (from text or explicit)
  if (method === 'POST') {
    let body
    try { body = JSON.parse(event.body || '{}') } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
    }

    let { merchant_pattern, category, natural_language } = body

    if (natural_language) {
      // Parse from natural language
      const parsed = await parseRuleFromText(natural_language)
      if (parsed.error) {
        return { statusCode: 400, body: JSON.stringify({ error: parsed.error }) }
      }
      merchant_pattern = parsed.merchant_pattern
      category = parsed.category
    }

    if (!merchant_pattern || !category) {
      return { statusCode: 400, body: JSON.stringify({ error: 'merchant_pattern and category required' }) }
    }

    if (!CATEGORIES.includes(category)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` }) }
    }

    // Upsert rule (replace if same pattern exists)
    const { data, error } = await adminClient
      .from('categorization_rules')
      .upsert(
        { user_id: user.id, merchant_pattern: merchant_pattern.toLowerCase(), category },
        { onConflict: 'user_id,merchant_pattern' }
      )
      .select()
      .single()

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule: data, merchant_pattern, category }) }
  }

  // DELETE — remove rule
  if (method === 'DELETE') {
    let body
    try { body = JSON.parse(event.body || '{}') } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
    }

    const { id } = body
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Rule `id` required' }) }

    const { error } = await adminClient
      .from('categorization_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: true }) }
  }

  return { statusCode: 405, body: 'Method not allowed' }
}
