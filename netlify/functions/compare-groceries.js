import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a South African grocery price intelligence assistant.
You know current 2025 retail prices at major South African supermarkets and pharmacies.

RETAILER KNOWLEDGE:
- Woolworths Food: premium quality, 15-25% more than mid-range. Loyalty: WRewards (cashback on qualifying purchases).
- Checkers / Checkers Hyper: mid-range, competitive pricing, strong weekly specials. Loyalty: Xtra Savings card (up to 15% off tagged items). Online: Checkers Sixty60 app (R25-R35 delivery fee).
- Pick n Pay: mid-range with frequent promotions. Smart Shopper points (earn 1pt per R2 spent). Online: Pick n Pay ASAP (R30-R35 delivery). Smart Price range is 15-20% cheaper than branded.
- Spar / SuperSpar / KwikSpar: independent-owned so prices vary 5-10% by location.
- Shoprite / Usave: value-focused, cheapest on staples and branded goods.
- Clicks: pharmacy + beauty + household. Strong loyalty via ClubCard. Some grocery overlap (snacks, dairy).
- Dis-Chem: premium pharmacy + health/beauty. More expensive than Clicks on grocery overlap.
- Makro: bulk/wholesale. Cheapest per-unit on bulk packs. Members only for best prices.

DELIVERY FEES (add only when explicitly requested):
- Checkers Sixty60: R25-R35 per order (free over R250 for Plus members)
- Woolworths Dash: R35-R45 per order
- Pick n Pay ASAP: R30 per order
- Spar2u: R35 per order

VITALITY CASHBACK (if vitalityPct > 0):
Discovery Vitality members earn cashback on healthy items at Woolworths and Checkers.
Healthy items = fresh produce, dairy, fresh/frozen unprocessed meat, whole grain staples, eggs, legumes.
Apply vitalityPct as cashback reduction on qualifying item prices.

FORMAT_RULES: Never use em dashes. Never use tilde. Never use markdown bold.

Return ONLY valid JSON — no text outside the JSON:
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
    {
      "store": "Pick n Pay",
      "items": ["item1", "item2"],
      "subtotal": 15000,
      "delivery": 0,
      "vitalitySaving": 0,
      "total": 15000
    }
  ],
  "currentTotal": 25000,
  "optimisedTotal": 18000,
  "weeklyMonthlySaving": { "weekly": 7000, "monthly": 30000 },
  "summary": "Brief plain-English recommendation",
  "groceryInsights": {
    "loyaltyTip": "One sentence on best loyalty programme for this basket",
    "savingsTip": "One practical cost-reduction tip specific to these items",
    "deliveryNote": "Delivery cost note if relevant, otherwise null"
  }
}
All prices in ZAR cents (integers). Estimates should be realistic 2025 South African prices.`

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

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }

  const itemsDescription = items
    .map(item => `${item.qty || 1}x ${item.name}${item.currentPrice ? ` (currently R${(item.currentPrice / 100).toFixed(2)} at ${item.currentStore || 'unknown'})` : ''}`)
    .join('\n')

  const userMessage = `Compare prices for these grocery items:\n${itemsDescription}\n\nVitality cashback: ${vitalityPct}%\nProvide an optimised cart split that minimises total cost (in-store only, no delivery unless items are only available online).`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
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
    console.error('JSON parse error:', e, rawText.slice(0, 200))
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response' }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  }
}
