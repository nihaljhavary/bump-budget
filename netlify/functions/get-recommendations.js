import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const FORMAT_RULES = `Never use em dashes. Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose.`

const SYSTEM_PROMPT = `You are bump.'s personal finance advisor -- a warm, direct, South African money coach. You give practical, specific, actionable financial advice based on real spending data. You speak plainly, avoid jargon, and always give specific Rand amounts. Never be vague. Your tone is encouraging but honest. ` + FORMAT_RULES

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

  const { answers, spendingData, budgets, monthCount = 1, recurringMonthly = 0, projectionContext = null } = body

  // Auth
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

  // Pre-compute key financials
  const monthlyIncome = parseFloat(answers.income) || 0
  const totalMonthlySpend = spendingData
    ? Object.values(spendingData).reduce((s, v) => s + v, 0)
    : 0
  const monthlySurplus = monthlyIncome - totalMonthlySpend
  const savingsGoal = parseFloat(answers.savingsGoal) || 0
  const savingsRate = monthlyIncome > 0 ? Math.round((monthlySurplus / monthlyIncome) * 100) : 0

  const emergencyFundTarget = Math.round(totalMonthlySpend * 3)
  const hasEmergencyFund = (answers.emergencyFund || '').includes('3+')

  const avgLabel = monthCount >= 12 ? '12-month rolling' : monthCount <= 1 ? '1-month' : `${monthCount}-month rolling`

  const spendLines = spendingData
    ? Object.entries(spendingData)
        .sort(([,a],[,b]) => b - a)
        .map(([cat, amt]) => {
          const budget = budgets?.[cat]
          const over = budget ? Math.round(amt) - Math.round(budget) : null
          const budgetNote = budget
            ? (over > 0 ? ` [OVER budget by R${over.toLocaleString('en-ZA')}]` : ` [within budget R${Math.round(budget).toLocaleString('en-ZA')}]`)
            : ''
          return `  ${cat}: R${Math.round(amt).toLocaleString('en-ZA')}/mo${budgetNote}`
        })
        .join('\n')
    : 'No spending data available'

  const budgetLines = budgets && Object.keys(budgets).length > 0
    ? Object.entries(budgets)
        .map(([cat, amt]) => `  ${cat}: R${Math.round(amt).toLocaleString('en-ZA')}`)
        .join('\n')
    : 'No budgets set'

  // Recurring obligations context
  const recurringLine = recurringMonthly > 0
    ? `\nRECURRING OBLIGATIONS: R${Math.round(recurringMonthly).toLocaleString('en-ZA')}/mo (${monthlyIncome > 0 ? Math.round(recurringMonthly / monthlyIncome * 100) : 0}% of income)`
    : ''

  // Long-term projection context (from deterministic engine -- not AI-generated)
  let projectionLine = ''
  if (projectionContext) {
    const { monthlyFreeCashFlow, netWorth1yr, netWorth5yr, netWorth10yr,
            optimisedNetWorth10yr, salaryGrowth, investmentReturn } = projectionContext
    projectionLine = `\nLONG-TERM PROJECTIONS (deterministic, ${salaryGrowth || 5}% salary growth, ${investmentReturn || 8}% returns):`
    if (monthlyFreeCashFlow != null) projectionLine += `\n  Monthly free cash flow (income - fixed - variable): R${Math.round(monthlyFreeCashFlow).toLocaleString('en-ZA')}`
    if (netWorth1yr != null)  projectionLine += `\n  Projected net worth in 1 year (current path): R${Math.round(netWorth1yr).toLocaleString('en-ZA')}`
    if (netWorth5yr != null)  projectionLine += `\n  Projected net worth in 5 years (current path): R${Math.round(netWorth5yr).toLocaleString('en-ZA')}`
    if (netWorth10yr != null) projectionLine += `\n  Projected net worth in 10 years (current path): R${Math.round(netWorth10yr).toLocaleString('en-ZA')}`
    if (optimisedNetWorth10yr != null) {
      const uplift = optimisedNetWorth10yr - (netWorth10yr || 0)
      projectionLine += `\n  Optimised path (10% variable cut) 10yr net worth: R${Math.round(optimisedNetWorth10yr).toLocaleString('en-ZA')} (R${Math.round(uplift).toLocaleString('en-ZA')} more)`
    }
  }

  const prompt = `Here is the user's financial profile:

QUESTIONNAIRE ANSWERS:
- Monthly take-home income: R${monthlyIncome > 0 ? monthlyIncome.toLocaleString('en-ZA') : 'unknown'}
- Monthly savings goal: R${savingsGoal > 0 ? savingsGoal.toLocaleString('en-ZA') : 'not specified'}
- Biggest financial stress: ${answers.stress || 'not specified'}
- Financial goal: ${answers.goal || 'not specified'}
- Owns property / pays bond: ${answers.ownProperty || 'no'}
- Has dependants: ${answers.dependants || 'no'}
- Emergency fund status: ${answers.emergencyFund || 'none'}

COMPUTED FINANCIAL SNAPSHOT:
- Total monthly spend: R${Math.round(totalMonthlySpend).toLocaleString('en-ZA')}/mo
- Monthly surplus: ${monthlySurplus >= 0 ? 'R' + Math.round(monthlySurplus).toLocaleString('en-ZA') + ' surplus' : 'R' + Math.abs(Math.round(monthlySurplus)).toLocaleString('en-ZA') + ' DEFICIT'}
- Savings rate: ${savingsRate}%${savingsGoal > 0 ? (monthlySurplus >= savingsGoal ? ' (meeting goal)' : ` (short by R${Math.round(savingsGoal - monthlySurplus).toLocaleString('en-ZA')})`) : ''}
- 3-month emergency fund target: ${emergencyFundTarget > 0 ? 'R' + emergencyFundTarget.toLocaleString('en-ZA') : 'unknown'}${!hasEmergencyFund && emergencyFundTarget > 0 && monthlySurplus > 0 ? ` (${Math.ceil(emergencyFundTarget / monthlySurplus)} months to build)` : ''}${recurringLine}${projectionLine}

ACTUAL MONTHLY SPENDING (${avgLabel} average, budget vs actual):
${spendLines}

CURRENT BUDGETS SET:
${budgetLines}

Provide a personalised financial health report. Be specific -- use actual rand amounts. Where projection data is available, use it to frame the long-term impact (what does the current trajectory mean in 5-10 years?). Anchor insights to real behaviour.

1. FINANCIAL HEALTH SCORE -- Score 1-10 based on: savings rate, surplus/deficit, emergency fund, spending/income ratio, and long-term trajectory.

2. KEY INSIGHTS -- 3 specific observations with Rand amounts. If projections are available, one insight should reference the long-term outlook.

3. WHERE TO CUT -- 3-5 categories with over-budget or high spend:
   - Category name and current monthly average
   - Recommended target
   - Potential monthly saving
   - One concrete tip

4. SAVINGS PLAN -- Based on income, goal, and actual surplus:
   - Realistic monthly savings target
   - Time to reach their stated goal
   - Which category cuts fund it

5. ONE QUICK WIN -- The single highest-impact change they can make this month.

Respond with ONLY this JSON, no markdown:
{
  "healthScore": number (1-10),
  "healthLabel": "string",
  "healthSummary": "string (1 sentence)",
  "insights": [{ "title": "string", "body": "string", "type": "warning|positive|neutral" }],
  "cuts": [{ "category": "string", "currentAvg": number, "recommended": number, "saving": number, "tip": "string" }],
  "savingsPlan": { "monthlyTarget": number, "timeToGoal": "string", "fundedBy": "string" },
  "quickWin": "string"
}`

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
