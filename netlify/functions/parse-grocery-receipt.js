import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a grocery receipt parser for South African retailers.
Extract items from the receipt image provided.

Return ONLY valid JSON — no explanation, no markdown:
{
  "store": "detected store name or null",
  "items": [
    { "name": "item description", "qty": 1, "price": 2500 }
  ],
  "subtotal": 25000,
  "discounts": 0,
  "deliveryFee": 0,
  "loyaltySavings": 0
}

Rules:
- All monetary values in ZAR cents (R1.00 = 100)
- qty defaults to 1; parse "2x", "x2", or qty column values
- Skip non-item lines: store address, VAT number, cashier name, date/time, barcode numbers
- store: detect from receipt header — Woolworths, Checkers, Checkers Sixty60, Pick n Pay,
  Pick n Pay ASAP, Spar, Shoprite, Clicks, Dis-Chem, Makro, or other
- deliveryFee: delivery charge from Sixty60, ASAP, Woolworths Dash etc if shown on receipt
- loyaltySavings: Xtra Savings card discount, Smart Shopper redemption, WRewards discount
- discounts: promo price reductions, 3-for-2, BOGOFs, weekly specials applied at till
- If receipt is unreadable, return { "store": null, "items": [], "subtotal": 0, "discounts": 0, "deliveryFee": 0, "loyaltySavings": 0 }`

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
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { imageBase64, mediaType = 'image/jpeg' } = body
  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) }
  }
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!validTypes.includes(mediaType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported image type. Use JPEG, PNG, or WEBP.' }) }
  }

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Extract all grocery items from this receipt.' },
          ],
        }],
      }),
    })
  } catch (fetchErr) {
    console.error('Anthropic fetch error:', fetchErr)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not reach AI service' }) }
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error('Anthropic error:', errText)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not read receipt' }) }
  }

  const aiData = await response.json()
  const rawText = aiData.content?.[0]?.text || '{}'

  let parsed
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
  } catch (e) {
    console.error('JSON parse error:', e, rawText.slice(0, 200))
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not read receipt' }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  }
}
