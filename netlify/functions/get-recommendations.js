import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are bump.'s personal finance advisor — a warm, direct, South African money coach. You give practical, specific, actionable financial advice based on real spending data. You speak plainly, avoid jargon, and always give specific Rand amounts. Never be vague. Your tone is encouraging but honest.`

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

  const { answers, spendingData, budgets } = body

  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // ── Build prompt ──────────────────────────────────────────────────────────
  const spendLines = spendingData
    ? Object.entries(spendingData)
        .sort(([,a],[,b]) => b - a)
        .map(([cat, amt]) => `  ${cat}: R${Math.round(amt).toLocaleString('en-ZA')}`)
        .join('\n')
    : 'No spending data available'

  const budgetLines = budgets
    ? Object.entries(budgets)
        .map(([cat, amt]) => `  ${cat}: R${Math.round(amt).toLocaleString('en-ZA')}`)
        .join('\n')
    : 'No budgets set'

  const prompt = `Here is the user's financial profile:

QUESTIONNAIRE ANSWERS:
- Monthly take-home income: R${answers.income || 'unknown'}
- Monthly savings goal: R${answers.savingsGoal || 'not specified'}
- Biggest financial stress: ${answers.stress || 'not specified'}
- Financial goal (6–12 months): ${answers.goal || 'not specified'}
- Owns property / pays bond: ${answers.ownProperty || 'no'}
- Has dependants: ${answers.dependants || 'no'}
- Has emergency fund (3 months expenses): ${answers.emergencyFund || 'no'}

ACTUAL MONTHLY SPENDING (average):
${spendLines}

CURRENT BUDGETS SET:
${budgetLines}

Please provide a personalised financial health report with:

1. FINANCIAL HEALTH SCORE — Give a score out of 10 with a one-line explanation.

2. KEY INSIGHTS — 3 specific observations about their spending patterns (with Rand amounts).

3. WHERE TO CUT — List exactly 3–5 categories where they're overspending. For each:
   - Category name
   - Current average spend
   - Recommended budget
   - Potential monthly saving
   - One specific tip to achieve it

4. SAVINGS ACCELERATOR — Based on their income and goal, show a simple monthly plan:
   - How much to save per month to hit their goal
   - Which category cuts fund the savings

5. ONE QUICK WIN — The single highest-impact change they can make this month.

Format your response as a JSON object with this exact structure:
{
  "healthScore": number (1-10),
  "healthLabel": "string (e.g. 'Getting there 💪')",
  "healthSummary": "string (1 sentence)",
  "insights": [
    { "title": "string", "body": "string", "type": "warning|positive|neutral" }
  ],
  "cuts": [
    {
      "category": "string",
      "currentAvg": number,
      "recommended": number,
      "saving": number,
      "tip": "string"
    }
  ],
  "savingsPlan": {
    "monthlyTarget": number,
    "timeToGoal": "string",
    "fundedBy": "string"
  },
  "quickWin": "string"
}

Respond with ONLY the raw JSON — no markdown, no explanation.`

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
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

    let result
    try {
      result = JSON.parse(clean)
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response' }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result })
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
