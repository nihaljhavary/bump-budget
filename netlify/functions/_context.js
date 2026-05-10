// netlify/functions/_context.js
// Shared AI context builder for bump. insight generation.
// Prefixed with _ so Netlify does not treat this as a function endpoint.
//
// All amounts passed in must be in RANDS (integers).
// Profile fields should be pre-converted from cents before calling.

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

// ── Behavioural spend buckets ─────────────────────────────────────────────────
// Categorise spend categories into behavioural buckets for richer AI context.
const OBLIGATION_CATS  = new Set(['Housing', 'Insurance', 'Utilities', 'Fees & Charges'])
const LIFESTYLE_CATS   = new Set(['Eating out', 'Entertainment', 'Travel', 'Clothing', 'Subscriptions', 'Gifts', 'Home & Garden'])
const ESSENTIAL_CATS   = new Set(['Groceries', 'Health', 'Fuel', 'Transport', 'Education'])
const WEALTH_CATS      = new Set(['Savings'])
const UNTRACKED_CATS   = new Set(['ATM / Cash', 'Other'])

/**
 * Build a rich, dense context string for injection into AI insight prompts.
 *
 * @param {Object} p
 * @param {number}  p.income            - monthly income in rands
 * @param {string}  p.incomeSource      - 'declared' | 'transactions' | 'unknown'
 * @param {number}  p.totalSpend        - total lifestyle spend (transfers excluded)
 * @param {Object}  p.catTotals         - { category: rands }
 * @param {Object}  [p.budgets]         - { category: rands } -- user-set budgets from DB
 * @param {Object}  [p.defaultBudgets]  - { category: rands } -- fallback defaults
 * @param {number}  [p.debitOrders]     - fixed monthly debit orders in rands
 * @param {number}  [p.savingsGoal]     - monthly savings goal in rands
 * @param {string}  [p.usageType]       - 'personal' | 'household' | 'side_hustle' | 'sole_prop'
 * @param {string}  [p.recurringContext]- compact string from recurringToContext()
 * @param {Object}  [p.monthlyData]     - { 'YYYY-MM': { spend, income } } for trend signals
 * @param {Array}   [p.transactions]    - raw transactions for anomaly detection
 * @param {string}  [p.periodLabel]     - e.g. 'May 2025' or 'last 3 months'
 * @param {string}  [p.mode]            - 'overview' | 'analytics' | 'income_statement' | 'recommendations'
 * @returns {string}
 */
export function buildInsightContext(p) {
  const {
    income = 0,
    incomeSource = 'unknown',
    totalSpend = 0,
    catTotals = {},
    budgets = {},
    defaultBudgets = {},
    debitOrders = 0,
    savingsGoal = 0,
    usageType = 'personal',
    recurringContext = '',
    monthlyData = null,
    transactions = [],
    periodLabel = 'this period',
    mode = 'overview',
  } = p

  const net = income - totalSpend
  const spendPct = income > 0 ? Math.round(totalSpend / income * 100) : 0
  const savingsRate = income > 0 ? Math.round(net / income * 100) : 0
  const discretionary = debitOrders > 0 ? totalSpend - debitOrders : null

  const lines = []

  // ── Headline snapshot ─────────────────────────────────────────────────────
  lines.push(`FINANCIAL SNAPSHOT (${periodLabel})`)
  const incomeLabel = incomeSource === 'declared'
    ? 'declared take-home salary'
    : incomeSource === 'transactions' ? 'from logged income' : 'unknown source'
  lines.push(`Income: ${fmt(income)} (${incomeLabel})`)
  lines.push(`Total spend: ${fmt(totalSpend)} (${spendPct}% of income, transfers excluded)`)

  if (debitOrders > 0) {
    const doRatePct = income > 0 ? Math.round(debitOrders / income * 100) : 0
    lines.push(`Fixed debit orders: ${fmt(debitOrders)}/mo (${doRatePct}% of income -- already committed)`)
    if (discretionary !== null && discretionary > 0) {
      const discPct = income > 0 ? Math.round(discretionary / income * 100) : 0
      lines.push(`Discretionary spend: ${fmt(discretionary)} (${discPct}% of income)`)
    }
  }

  lines.push(`Net position: ${fmt(net)} ${net >= 0 ? 'surplus' : 'DEFICIT'}`)

  if (savingsGoal > 0) {
    const onTrack = net >= savingsGoal
    if (onTrack) {
      lines.push(`Savings goal: ${fmt(savingsGoal)}/mo -- on track (${savingsRate}% savings rate)`)
    } else {
      const shortfall = savingsGoal - net
      lines.push(`Savings goal: ${fmt(savingsGoal)}/mo -- SHORT by ${fmt(shortfall)} (${savingsRate}% savings rate vs ${Math.round(savingsGoal/income*100)}% target)`)
    }
  } else if (net > 0 && income > 0) {
    lines.push(`Savings rate: ${savingsRate}% (no savings goal set)`)
  }

  // ── Category breakdown ────────────────────────────────────────────────────
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1])
  if (catEntries.length > 0) {
    lines.push('')
    lines.push('SPENDING BREAKDOWN (transfers excluded):')
    for (const [cat, amt] of catEntries.slice(0, 10)) {
      // Prefer user-set budgets, fall back to defaults
      const budget = (budgets && budgets[cat] > 0) ? budgets[cat]
                   : (defaultBudgets && defaultBudgets[cat]) ? defaultBudgets[cat]
                   : 0
      if (budget > 0) {
        const diff = amt - budget
        const overPct = Math.round(Math.abs(diff) / budget * 100)
        let status
        if (diff > 0)            status = `OVER by ${fmt(diff)} (+${overPct}%)`
        else if (diff > -budget * 0.2) status = 'near limit'
        else                     status = 'on track'
        lines.push(`  ${cat}: ${fmt(amt)} (budget ${fmt(budget)}) -- ${status}`)
      } else {
        lines.push(`  ${cat}: ${fmt(amt)}`)
      }
    }
  }

  // ── Spending concentration ─────────────────────────────────────────────────
  if (catEntries.length >= 2 && totalSpend > 0) {
    const top3 = catEntries.slice(0, Math.min(3, catEntries.length))
    const top3Total = top3.reduce((s, [, v]) => s + v, 0)
    const top3Pct = Math.round(top3Total / totalSpend * 100)
    const top3Names = top3.map(([k]) => k).join(', ')
    lines.push(`  Concentration: ${top3Names} = ${top3Pct}% of total spend`)
  }

  // ── Behavioural spend classification ─────────────────────────────────────────
  {
    let obligations = 0, lifestyle = 0, essentials = 0, wealthBuilding = 0, untracked = 0
    for (const [cat, amt] of catEntries) {
      if (OBLIGATION_CATS.has(cat))  obligations  += amt
      else if (LIFESTYLE_CATS.has(cat))   lifestyle    += amt
      else if (ESSENTIAL_CATS.has(cat))   essentials   += amt
      else if (WEALTH_CATS.has(cat))      wealthBuilding += amt
      else if (UNTRACKED_CATS.has(cat))   untracked    += amt
    }
    const hasBuckets = obligations + lifestyle + essentials + wealthBuilding > 0
    if (hasBuckets) {
      lines.push('')
      lines.push('SPEND BEHAVIOUR BREAKDOWN:')
      if (obligations > 0) {
        const pctSpend = Math.round(obligations / totalSpend * 100)
        const pctInc   = income > 0 ? ` = ${Math.round(obligations / income * 100)}% of income` : ''
        lines.push(`  Fixed obligations (housing/insurance/utilities): ${fmt(obligations)} (${pctSpend}% of spend${pctInc})`)
      }
      if (essentials > 0) {
        const pctSpend = Math.round(essentials / totalSpend * 100)
        lines.push(`  Essential variable (groceries/health/fuel/transport): ${fmt(essentials)} (${pctSpend}% of spend)`)
      }
      if (lifestyle > 0) {
        const pctSpend = Math.round(lifestyle / totalSpend * 100)
        const pctInc   = income > 0 ? ` = ${Math.round(lifestyle / income * 100)}% of income` : ''
        lines.push(`  Lifestyle/discretionary (eating out/entertainment/clothing/travel): ${fmt(lifestyle)} (${pctSpend}% of spend${pctInc})`)
      }
      if (wealthBuilding > 0) {
        const pctSpend = Math.round(wealthBuilding / totalSpend * 100)
        const pctInc   = income > 0 ? ` = ${Math.round(wealthBuilding / income * 100)}% of income` : ''
        lines.push(`  Wealth-building (savings/investments): ${fmt(wealthBuilding)} (${pctSpend}% of spend${pctInc})`)
      }
      if (untracked > 0) {
        lines.push(`  ATM/cash + unclassified: ${fmt(untracked)} (${Math.round(untracked / totalSpend * 100)}% of spend)`)
      }
      // Lifestyle vs obligations ratio signal
      if (lifestyle > 0 && obligations > 0) {
        const ratio = (lifestyle / obligations).toFixed(1)
        if (lifestyle > obligations * 1.5) {
          lines.push(`  Signal: lifestyle spend is ${ratio}x fixed obligations -- high discretionary exposure`)
        } else if (wealthBuilding === 0 && income > 0) {
          lines.push(`  Signal: no wealth-building spend detected this period`)
        }
      }
    }
  }

    // ── Month-on-month trend ───────────────────────────────────────────────────
  if (monthlyData && typeof monthlyData === 'object') {
    const months = Object.keys(monthlyData).sort()
    if (months.length >= 2) {
      const recent = monthlyData[months[months.length - 1]]
      const prev = monthlyData[months[months.length - 2]]
      if (recent && prev && prev.spend > 0) {
        const delta = recent.spend - prev.spend
        const deltaPct = Math.round(Math.abs(delta) / prev.spend * 100)
        const dir = delta > 0 ? 'UP' : 'DOWN'
        lines.push('')
        lines.push(`MONTH-ON-MONTH: Spend ${dir} ${fmt(Math.abs(delta))} (${deltaPct}%) vs prior month`)
        if (recent.income > 0 && prev.income > 0) {
          const incDelta = recent.income - prev.income
          if (Math.abs(incDelta) > prev.income * 0.05) {
            const incDir = incDelta > 0 ? 'up' : 'down'
            lines.push(`  Income ${incDir} ${fmt(Math.abs(incDelta))} vs prior month`)
          }
        }
      }
    }
  }

  // ── Anomaly detection ──────────────────────────────────────────────────────
  if (transactions.length > 3) {
    const spendTxns = transactions.filter(t => t.category !== 'Income' && t.category !== 'Transfer')
    if (spendTxns.length > 3) {
      const avgAmt = spendTxns.reduce((s, t) => s + t.amount, 0) / spendTxns.length
      const threshold = Math.max(avgAmt * 4, 500)
      const anomalies = spendTxns
        .filter(t => t.amount > threshold)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 2)
      if (anomalies.length > 0) {
        lines.push('')
        lines.push('NOTABLE TRANSACTIONS:')
        for (const a of anomalies) {
          lines.push(`  ${a.name}: ${fmt(a.amount)} (${a.category}, ${a.date})`)
        }
      }
    }
  }

  // ── Recurring obligations ──────────────────────────────────────────────────
  if (recurringContext) {
    lines.push('')
    lines.push(recurringContext)
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  const usageLabels = {
    personal: 'personal', household: 'household (multiple earners)',
    side_hustle: 'has a side hustle', sole_prop: 'sole proprietor/freelancer'
  }
  lines.push('')
  lines.push(`PROFILE: ${usageLabels[usageType] || usageType}`)

  return lines.join('\n')
}

/**
 * Build the behavioral insight prompt instruction based on context mode.
 * Mode determines the focus area and what the AI should prioritise.
 */
export function buildInsightPrompt({ mode = 'overview', question = '', contextBlock }) {
  const FORMAT = 'Never use em dashes. Never use tilde. Never use markdown bold. Plain prose only.'

  const PERSONA = 'You are bump.'s financial analyst -- warm, sharp, and South African. You have read this user's actual transaction data. Speak like a smart friend who knows finance, not a corporate report. Give specific rand amounts. Never give generic advice.'

  let instruction = ''

  if (mode === 'overview') {
    instruction = `Analyse this user's spending for the current month. In 3-4 short paragraphs:
1. Flag the 1-2 most significant overspends -- name the category, the overage in rands, and one concrete action.
2. Observe one positive pattern or behaviour worth acknowledging.
3. Comment on their net position and whether they are on track for their savings goal.
If recurring obligations or anomalies are listed, reference them specifically. Under 180 words. No headers.`
  }

  else if (mode === 'analytics') {
    instruction = `Analyse this user's spending trends across the period. In 3-4 short paragraphs:
1. Identify the most meaningful trend -- what has changed, grown, or shrunk, and why it matters.
2. Comment on spending concentration -- is spend spread across many categories or dominated by a few?
3. Give one forward-looking observation: based on this pattern, what should they watch or act on?
If month-on-month changes or recurring items are listed, use them. Under 200 words. No headers.`
  }

  else if (mode === 'income_statement') {
    instruction = `Interpret this income statement. In 3-4 short paragraphs:
1. What story do the numbers tell -- are expenses rising faster than income?
2. Identify the 1-2 categories with the most significant movement.
3. What should the user actually do based on this period's data?
Be specific with rand amounts. Under 200 words. No headers.`
  }

  const questionBlock = question && question.trim()
    ? `\n\nUSER'S QUESTION: "${question.trim()}"\nAddress this directly in your response.`
    : ''

  return `${PERSONA}

${contextBlock}

${instruction}${questionBlock}

${FORMAT}`
}
