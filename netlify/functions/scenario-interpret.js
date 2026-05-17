import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

// No FORMAT_RULES needed -- this function returns structured JSON, not prose.

const SYSTEM_PROMPT = `You are bump.'s scenario extraction engine. Your ONLY job is to interpret natural language financial scenarios and extract them into structured financial events for deterministic calculation.

STRICT RULES:
- Never calculate projections or net worth yourself -- that is done deterministically by the app.
- Extract only what the user actually described. Do not add unrequested events.
- Amounts must be in Rands as plain numbers (no currency symbols, no commas).
- If a vehicle trade-in is described, create TWO events: a vehicle_buy expense AND a vehicle_sell income.
- For children, use R3500/month as a conservative SA estimate if the user gives no amount.
- For school fees, use R5000/month (R60000/year) as a conservative estimate if unspecified.
- For salary increases, the amount should be the NET monthly increase (not gross).
- If the year is ambiguous (e.g. "in 3 years"), compute it from currentYear.
- Recurring monthly events: set monthly=true. One-off events: monthly=false.

LIFECYCLE DURATIONS -- include endYear for recurring events so the model spans the full cost period:
- children: set endYear = year + 18 (monthly child costs continue until adulthood)
- bond_payment: set endYear = year + 20 (typical 20-year SA home loan; use year + 25 for longer bonds)
- school_fees (if recurring/monthly): primary school endYear = year + 7; high school endYear = year + 5; full career endYear = year + 12
- investment: include endYear only if the user specifies a fixed contribution period (e.g. "for 5 years"); otherwise omit
- salary_change: NO endYear -- salary increases are permanent, run to end of horizon
- debt_payoff: NO endYear -- the monthly saving continues permanently once the debt is cleared
- One-off events (bonus, vehicle_buy, vehicle_sell, property, expense, income): NO endYear

EVENT TYPES:
- bonus: windfall / lump sum income (income:true, monthly:false)
- salary_change: ongoing salary increase (income:true, monthly:true -- NET monthly delta)
- vehicle_buy: vehicle purchase (income:false, monthly:false -- total cost)
- vehicle_sell: vehicle sale proceeds (income:true, monthly:false)
- property: property deposit or purchase costs (income:false, monthly:false)
- bond_payment: new monthly bond repayment (income:false, monthly:true)
- children: monthly child costs / childcare (income:false, monthly:true)
- school_fees: annual school fees (income:false, monthly:false)
- debt_payoff: monthly saving when debt is cleared (income:true, monthly:true)
- investment: regular monthly investment contribution (income:false, monthly:true)
- expense: one-off expense (income:false, monthly:false)
- income: one-off income (income:true, monthly:false)`

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

  const { prompt, currentYear, netIncome, debitOrders, variableSpend } = body

  if (!prompt?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No prompt provided' }) }
  }

  // -- Auth ------------------------------------------------------------------
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // -- Build prompt ----------------------------------------------------------
  const contextLines = [
    `Current year: ${currentYear || new Date().getFullYear()}`,
    netIncome     ? `User net monthly income: R${Math.round(netIncome)}` : '',
    debitOrders   ? `Fixed obligations/debit orders: R${Math.round(debitOrders)}/mo` : '',
    variableSpend ? `Variable spend: R${Math.round(variableSpend)}/mo` : '',
  ].filter(Boolean).join('\n')

  const userMessage = `USER FINANCIAL CONTEXT:\n${contextLines}\n\nUSER SCENARIO: "${prompt.trim()}"\n\nExtract this into structured financial events. Return ONLY valid JSON:\n{\n  "events": [\n    {\n      "type": "bonus|salary_change|vehicle_buy|vehicle_sell|property|bond_payment|children|school_fees|debt_payoff|investment|expense|income",\n      "year": number,\n      "endYear": number|null,\n      "amount": number,\n      "income": boolean,\n      "monthly": boolean,\n      "description": "brief human-readable label for this event"\n    }\n  ],\n  "explanation": "1-2 sentences describing what was extracted and any assumptions made (mention endYear durations where applicable)"\n}\n\nNo markdown. No extra text. JSON only.`

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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'AI response was not valid JSON. Try rephrasing your scenario.' }) }
    }

    // Validate and sanitise events
    const validTypes = new Set(['bonus','salary_change','vehicle_buy','vehicle_sell','property',
      'bond_payment','children','school_fees','debt_payoff','investment','expense','income'])

    const events = (parsed.events || [])
      .filter(ev => validTypes.has(ev.type) && Number.isFinite(Number(ev.amount)) && Number(ev.amount) > 0)
      .map(ev => {
        const mapped = {
          type:        ev.type,
          year:        Number(ev.year) || new Date().getFullYear() + 1,
          amount:      Math.abs(Number(ev.amount)),
          income:      Boolean(ev.income),
          monthly:     Boolean(ev.monthly),
          description: String(ev.description || ev.type).slice(0, 60),
        }
        // Only accept endYear for recurring monthly events where it makes sense
        if (ev.endYear && Number.isFinite(Number(ev.endYear)) && Number(ev.endYear) > mapped.year) {
          mapped.endYear = Number(ev.endYear)
        }
        return mapped
      })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events,
        explanation: String(parsed.explanation || '').slice(0, 400),
      }),
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
