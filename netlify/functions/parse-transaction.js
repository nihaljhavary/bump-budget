export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { message } = JSON.parse(event.body)

  const prompt = `You are a budget assistant for a South African user. Extract transaction info from this message.

Respond with ONLY a raw JSON object — no markdown, no explanation, no backticks.

If it IS a transaction:
{"parsed":true,"name":"merchant or description","amount":number,"category":"one of: Income/Housing/Groceries/Eating out/Transport/Entertainment/Health/Clothing/Subscriptions/Other"}

If it is NOT a transaction:
{"parsed":false,"reply":"short helpful reply in plain text"}

Rules:
- Amount must be a plain number (no R, no commas)
- Income/salary always maps to category "Income"
- Be smart about SA merchants: Checkers/Woolworths/Pick n Pay = Groceries, Uber Eats/Mr Delivery = Eating out, Vida/Starbucks = Eating out, Engen/BP/Shell = Transport

Message: "${message}"`

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
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'

    let parsed
    try {
      parsed = JSON.parse(text.trim())
    } catch {
      parsed = { parsed: false, reply: "I didn't catch that — try something like \"Woolies R340\" or \"Uber Eats R120\"" }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ parsed: false, reply: 'Something went wrong. Try again.' })
    }
  }
}
