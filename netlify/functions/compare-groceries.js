import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a South African grocery price comparison assistant. You know approximate current retail prices at major South African supermarkets (Woolworths, Checkers, Pick n Pay, Shoprite, Spar).

For each item provided, estimate the current price at Woolworths, Checkers, and Pick n Pay in ZAR. Consider:
- Woolworths tends to be 15-25% more expensive but higher quality
- Checkers is mid-range and often has Sixty60 specials
- Pick n Pay is mid-range with regular promotions
- Prices are realistic 2024-2025 South African retail prices

Delivery fees (add if user wants delivery):
- Checkers Sixty60: R35
- Woolworths Dash: R40  
- Pick n Pay ASAP: R30

If vitalityPct > 0, apply that cashback percentage to Woolworths and Checkers items (they partner with Discovery Vitality for healthy food cashback). Healthy food items = fresh produce, dairy, fresh meat, whole grains, eggs.

Return ONLY valid JSON with this exact structure:
{
  "items": [
    {
      "name": "item name",
      "qty": 1,
      "currentStore": "store name",
      "currentPrice": 2500,
      "woolworths": 3200,
      "checkers": 2400,
      "picknpay": 2300,
      "cheapest": "Pick n Pay",
      "cheapestPrice": 2300,
      "isHealthy": true,
      "vitalityApplied": 0
    }
  ],
  "cartSplit": [
    { "store": "Pick n Pay", "items": ["item1", "item2"], "subtotal": 15000, "delivery": 3000, "vitalitySaving": 0, "total": 18000 }
  ],
  "currentTotal": 25000,
  "optimisedTotal": 18000,
  "weeklyMonthlySaving": { "weekly": 7000, "monthly": 30000 },
  "summary": "Brief plain-English recommendation"
}
All prices are in ZAR cents (integer). Do not include any text outside the JSON.`

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { items, vitalityPct = 0 } = body

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No items provided' }) }
  }

  // Auth
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }

  const itemsDescription = items.map(item =>
    `${item.qty}x ${item.name}${item.currentPrice ? ` (currently R${(item.currentPrice/100).toFixed(2)} at ${item.currentStore || 'unknown store'})` : ''}`
  ).join('\n')

  const userMessage = `Compare prices for these grocery items:\n${itemsDescription}\n\nVitality cashback: ${vitalityPct}%\nProvide a cart split that minimises total cost.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('Anthropic error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error' }) }
  }

  const aiData = await response.json()
  const rawText = aiData.content?.[0]?.text || '{}'

  let parsed
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
  } catch (e) {
    console.error('JSON parse error:', e, rawText)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response', raw: rawText }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed)
  }
}
