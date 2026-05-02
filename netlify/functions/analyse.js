export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { transactions, budgets, income } = JSON.parse(event.body)

  const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
  const totalSpend = transactions.filter(t => t.category !== 'Income').reduce((s, t) => s + t.amount, 0)
  const net = income - totalSpend

  const catTotals = {}
  transactions.filter(t => t.category !== 'Income').forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount
  })

  const budgetMap = {}
  budgets.forEach(b => { budgetMap[b.category] = b.amount })

  const DEFAULT_BUDGETS = {
    Housing: 9500, Groceries: 3000, 'Eating out': 2000, Transport: 2500,
    Entertainment: 1500, Health: 1000, Clothing: 1000, Subscriptions: 500, Other: 1000
  }

  const catLines = Object.entries(catTotals).map(([cat, amt]) => {
    const budget = budgetMap[cat] || DEFAULT_BUDGETS[cat] || 1000
    const status = amt > budget ? `OVER by ${fmt(amt - budget)}` : amt > budget * 0.8 ? 'NEAR limit' : 'on track'
    return `${cat}: spent ${fmt(amt)} vs budget ${fmt(budget)} — ${status}`
  }).join('\n')

  const prompt = `You are a personal finance analyst for a South African user. Be sharp, direct, and specific. Under 150 words. No headers. Short punchy paragraphs.

Monthly income: ${fmt(income)}
Total spend: ${fmt(totalSpend)} (${Math.round(totalSpend / income * 100)}% of income)
Net position: ${fmt(net)} ${net >= 0 ? 'surplus' : 'DEFICIT'}

Category breakdown:
${catLines}

Deliver:
1. Top 2 overspend alerts — name the category, the rand amount over, and one concrete fix
2. One positive observation
3. Net position summary with a savings rate comment

Speak directly. Use rands not percentages where possible. Be like a smart friend who knows finance, not a corporate report.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || 'Analysis unavailable.'

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: text })
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ analysis: 'Analysis failed. Try again.' })
    }
  }
}
