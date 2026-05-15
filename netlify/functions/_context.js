// netlify/functions/_context.js
// Shared AI context builder for bump. insight generation.
// Prefixed with _ so Netlify does not treat this as a function endpoint.
//
// All amounts passed in must be in RANDS (integers).
// Profile fields should be pre-converted from cents before calling.

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

// -- Behavioural spend buckets --
const OBLIGATION_CATS  = new Set(['Housing', 'Insurance', 'Utilities', 'Fees & Charges'])
const LIFESTYLE_CATS   = new Set(['Eating out', 'Entertainment', 'Travel', 'Clothing', 'Subscriptions', 'Gifts', 'Home & Garden'])
const ESSENTIAL_CATS   = new Set(['Groceries', 'Health', 'Fuel', 'Transport', 'Education'])
const WEALTH_CATS      = new Set(['Savings'])
const UNTRACKED_CATS   = new Set(['ATM / Cash', 'Other'])

// Known delivery app identifiers (SA context)
const DELIVERY_KEYWORDS = ['uber eats', 'mr d', 'mr. d', 'bolt food', 'order in', 'orderin', 'menulog', 'checkers sixty60', 'sixty60']

/**
 * Build a rich, dense context string for injection into AI insight prompts.
 *
 * @param {Object} p
 * @param {number}  p.income                - period income in rands (canonical effective income)
 * @param {string}  p.incomeSource          - 'declared' | 'transactions' | 'unknown'
 * @param {string}  [p.incomeResolutionMode]- 'declared_prorated' | 'transaction_derived' | 'blended'
 * @param {number}  p.totalSpend            - total lifestyle spend (transfers excluded)
 * @param {Object}  p.catTotals             - { category: rands }
 * @param {Object}  [p.budgets]             - { category: rands } -- user-set budgets
 * @param {Object}  [p.defaultBudgets]      - { category: rands } -- fallback defaults
 * @param {number}  [p.debitOrders]         - fixed monthly debit orders in rands
 * @param {number}  [p.savingsGoal]         - monthly savings goal in rands
 * @param {string}  [p.usageType]           - 'personal' | 'household' | 'side_hustle' | 'sole_prop'
 * @param {string}  [p.recurringContext]    - compact string from recurringToContext()
 * @param {Object}  [p.monthlyData]         - { 'YYYY-MM': { spend, income } } for trend signals
 * @param {Array}   [p.transactions]        - raw spend transactions for merchant analysis
 * @param {Array}   [p.topMerchants]        - pre-computed from buildTopMerchants() on client
 * @param {string}  [p.periodLabel]         - e.g. 'May 2025' or 'last 3 months'
 * @param {string}  [p.mode]               - 'overview' | 'analytics' | 'income_statement' | 'recommendations'
 * @param {number}  [p.periodDays]          - calendar days in period (for proration context)
 * @returns {string}
 */
export function buildInsightContext(p) {
  const {
    income = 0,
    incomeSource = 'unknown',
    incomeResolutionMode = null,
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
    topMerchants = [],
    periodLabel = 'this period',
    mode = 'overview',
    periodDays = null,
    additionalIncome = 0,
    savingsBalance = 0,
  } = p

  const totalIncome = income + (additionalIncome || 0)
  const net = totalIncome - totalSpend
  const spendPct = totalIncome > 0 ? Math.round(totalSpend / totalIncome * 100) : 0
  const savingsRate = totalIncome > 0 ? Math.round(net / totalIncome * 100) : 0
  const discretionary = debitOrders > 0 ? totalSpend - debitOrders : null

  // Savings drawdown detection
  // Categories people commonly fund from savings (exceptional, non-recurring)
  const EXCEPTIONAL_CATS = new Set(['Gifts', 'Travel', 'Entertainment', 'Clothing', 'Home & Garden'])
  const exceptionalSpend = Object.entries(catTotals)
    .filter(([cat]) => EXCEPTIONAL_CATS.has(cat))
    .reduce((s, [, v]) => s + v, 0)
  const regularSpend = totalSpend - exceptionalSpend
  const regularNet   = totalIncome - regularSpend
  const likelyDrawdown = net < 0 && exceptionalSpend > 0

  const lines = []

  // -- Headline snapshot --
  lines.push(`FINANCIAL SNAPSHOT (${periodLabel})`)

  let incomeLabel = incomeSource === 'declared'
    ? 'declared take-home salary'
    : incomeSource === 'transactions' ? 'from logged income' : 'unknown source'

  if (incomeResolutionMode === 'declared_prorated' && periodDays) {
    incomeLabel += ` prorated over ${periodDays} days`
  } else if (incomeResolutionMode === 'blended') {
    incomeLabel += ' (declared; transaction income also logged)'
  }

  lines.push(`Primary income: ${fmt(income)} (${incomeLabel})`)
  if (additionalIncome > 0) {
    lines.push(`Additional income: ${fmt(additionalIncome)}/mo (secondary/side income -- declared in profile)`)
    lines.push(`Total income: ${fmt(totalIncome)}`)
  }
  lines.push(`Total spend: ${fmt(totalSpend)} (${spendPct}% of income, transfers/savings excluded)`)

  if (debitOrders > 0) {
    const doRatePct = income > 0 ? Math.round(debitOrders / income * 100) : 0
    lines.push(`Fixed debit orders: ${fmt(debitOrders)}/mo (${doRatePct}% of income -- already committed)`)
    if (discretionary !== null && discretionary > 0) {
      const discPct = income > 0 ? Math.round(discretionary / income * 100) : 0
      lines.push(`Discretionary spend: ${fmt(discretionary)} (${discPct}% of income)`)
    }
  }

  lines.push(`Net position: ${fmt(net)} ${net >= 0 ? 'surplus' : 'DEFICIT'}${additionalIncome > 0 ? ' (including additional income)' : ''}`)

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

  // -- Savings balance + drawdown detection --
  if (savingsBalance > 0) {
    lines.push(`Current savings balance: ${fmt(savingsBalance)} (declared by user)`)
  }

  if (likelyDrawdown && exceptionalSpend > 0) {
    lines.push('')
    lines.push('SAVINGS DRAWDOWN SIGNAL:')
    const exceptCats = Object.entries(catTotals)
      .filter(([cat]) => EXCEPTIONAL_CATS.has(cat) && catTotals[cat] > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `${cat} (${fmt(amt)})`)
      .join(', ')
    lines.push(`  Spend exceeds income by ${fmt(Math.abs(net))} this period.`)
    lines.push(`  Exceptional spend (likely savings-funded): ${fmt(exceptionalSpend)} across ${exceptCats}`)
    lines.push(`  Regular month-to-month position (excl. exceptional): ${fmt(regularNet)} ${regularNet >= 0 ? 'SURPLUS' : 'DEFICIT'}`)
    if (savingsBalance > 0) {
      const estimatedBalance = Math.max(savingsBalance - Math.abs(net), 0)
      lines.push(`  Estimated savings balance after drawdown: ${fmt(estimatedBalance)} (down from ${fmt(savingsBalance)})`)
      lines.push(`  PROMPT USER: Ask if they used savings for exceptional spend and whether they want to update their savings balance.`)
    } else {
      lines.push(`  No savings balance declared. Suggest user set a savings balance in their profile for more accurate analysis.`)
    }
  }

  // -- Category breakdown --
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1])
  if (catEntries.length > 0) {
    lines.push('')
    lines.push('SPENDING BREAKDOWN (transfers/savings excluded):')
    for (const [cat, amt] of catEntries.slice(0, 10)) {
      const budget = (budgets && budgets[cat] > 0) ? budgets[cat]
                   : (defaultBudgets && defaultBudgets[cat]) ? defaultBudgets[cat]
                   : 0
      if (budget > 0) {
        const diff = amt - budget
        const overPct = Math.round(Math.abs(diff) / budget * 100)
        let status
        if (diff > 0)                 status = `OVER by ${fmt(diff)} (+${overPct}%)`
        else if (diff > -budget * 0.2) status = 'near limit'
        else                           status = 'on track'
        lines.push(`  ${cat}: ${fmt(amt)} (budget ${fmt(budget)}) -- ${status}`)
      } else {
        lines.push(`  ${cat}: ${fmt(amt)}`)
      }
    }
  }

  // -- Spending concentration --
  if (catEntries.length >= 2 && totalSpend > 0) {
    const top3 = catEntries.slice(0, Math.min(3, catEntries.length))
    const top3Total = top3.reduce((s, [, v]) => s + v, 0)
    const top3Pct = Math.round(top3Total / totalSpend * 100)
    const top3Names = top3.map(([k]) => k).join(', ')
    lines.push(`  Concentration: ${top3Names} = ${top3Pct}% of total spend`)
  }

  // -- Merchant intelligence (uses pre-computed topMerchants or derives from transactions) --
  const spendTxns = transactions.filter(t => t.category !== 'Income' && t.category !== 'Transfer' && t.category !== 'Savings')
  const merchantsToUse = topMerchants.length > 0 ? topMerchants : null

  if (merchantsToUse && merchantsToUse.length > 0) {
    lines.push('')
    lines.push('TOP MERCHANTS (by total spend):')

    for (const m of merchantsToUse.slice(0, 10)) {
      const pctStr = m.pctOfSpend > 0 ? ` (${m.pctOfSpend}% of total spend)` : ''
      lines.push(`  ${m.name}: ${fmt(m.total)} x${m.count}${pctStr} [${m.category}]`)
    }

    // Delivery vs dine-in analysis for Eating out
    const eatingOutMerchants = merchantsToUse.filter(m => m.category === 'Eating out')
    if (eatingOutMerchants.length >= 2) {
      const deliveryTotal = eatingOutMerchants
        .filter(m => DELIVERY_KEYWORDS.some(kw => m.name.toLowerCase().includes(kw)))
        .reduce((s, m) => s + m.total, 0)
      const eatingOutTotal = catTotals['Eating out'] || 0
      if (deliveryTotal > 0 && eatingOutTotal > 0) {
        const deliveryPct = Math.round(deliveryTotal / eatingOutTotal * 100)
        const dineInPct = 100 - deliveryPct
        lines.push(`  Eating out split: ${deliveryPct}% delivery apps vs ${dineInPct}% restaurants/cafes`)
      }
    }

    // Grocery delivery vs in-store split
    const GROCERY_DELIVERY_KW = [
      'sixty60', 'sixty 60', 'checkers sixty', 'checkers online',
      'woolworths dash', 'woolies dash', 'woolworths delivery', 'woolies delivery',
      'woolworths online', 'woolies online',
      'pick n pay asap', 'pnp asap', 'picknpay asap', 'pnp online',
      'pick n pay online', 'picknpay online',
      'spar online', 'spar deliver', 'spar2u',
    ]
    const groceryMerchants = merchantsToUse.filter(m => m.category === 'Groceries')
    if (groceryMerchants.length >= 2) {
      const groceryDeliveryTotal = groceryMerchants
        .filter(m => GROCERY_DELIVERY_KW.some(kw => m.name.toLowerCase().includes(kw)))
        .reduce((s, m) => s + m.total, 0)
      const groceryTotal = catTotals['Groceries'] || 0
      if (groceryDeliveryTotal > 0 && groceryTotal > 0) {
        const gDeliveryPct = Math.round(groceryDeliveryTotal / groceryTotal * 100)
        lines.push(`  Grocery split: ${gDeliveryPct}% delivery services (Sixty60/Dash/ASAP) vs ${100 - gDeliveryPct}% in-store`)
      }
    }
  } else if (spendTxns.length >= 3) {
    // Derive merchants from raw transactions if topMerchants not passed
    const map = {}
    for (const t of spendTxns) {
      const key = (t.name || 'Unknown').trim()
      if (!map[key]) map[key] = { name: key, category: t.category, total: 0, count: 0 }
      map[key].total += t.amount || 0
      map[key].count++
    }
    const topDerived = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8)
    if (topDerived.length > 0) {
      lines.push('')
      lines.push('TOP MERCHANTS:')
      for (const m of topDerived) {
        lines.push(`  ${m.name}: ${fmt(Math.round(m.total))} x${m.count} [${m.category}]`)
      }
    }
  }

  // ── Per-category merchant breakdowns for high-value categories ──────────
  // Build category-level merchant details so the AI can say "you spent R1 200
  // at Uber Eats, R800 at Vida e Caffe" rather than just "R2 000 on dining".
  const highValueCats = new Set(['Eating out', 'Groceries', 'Entertainment', 'Clothing', 'Transport', 'Health'])
  const catMerchantMap = {}
  for (const t of spendTxns) {
    const cat = t.category || 'Other'
    if (!highValueCats.has(cat)) continue
    const key = (t.name || 'Unknown').trim()
    if (!catMerchantMap[cat]) catMerchantMap[cat] = {}
    if (!catMerchantMap[cat][key]) catMerchantMap[cat][key] = { name: key, total: 0, count: 0 }
    catMerchantMap[cat][key].total += t.amount || 0
    catMerchantMap[cat][key].count++
  }
  const richCats = Object.entries(catMerchantMap)
    .filter(([cat]) => catTotals[cat] > 0)
    .sort((a, b) => (catTotals[b[0]] || 0) - (catTotals[a[0]] || 0))
    .slice(0, 4)
  if (richCats.length > 0) {
    lines.push('')
    lines.push('MERCHANT BREAKDOWN BY CATEGORY:')
    for (const [cat, merchants] of richCats) {
      const top = Object.values(merchants).sort((a, b) => b.total - a.total).slice(0, 4)
      const detail = top.map(m => `${m.name} ${fmt(Math.round(m.total))}`).join(', ')
      lines.push(`  ${cat} (${fmt(catTotals[cat] || 0)}): ${detail}`)
    }
  }

  // -- Behavioural spend classification --
  {
    let obligations = 0, lifestyle = 0, essentials = 0, wealthBuilding = 0, untracked = 0
    for (const [cat, amt] of catEntries) {
      if (OBLIGATION_CATS.has(cat))       obligations    += amt
      else if (LIFESTYLE_CATS.has(cat))   lifestyle      += amt
      else if (ESSENTIAL_CATS.has(cat))   essentials     += amt
      else if (WEALTH_CATS.has(cat))      wealthBuilding += amt
      else if (UNTRACKED_CATS.has(cat))   untracked      += amt
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

  // -- Month-on-month trend --
  if (monthlyData && typeof monthlyData === 'object') {
    const months = Object.keys(monthlyData).sort()
    if (months.length >= 2) {
      const recent = monthlyData[months[months.length - 1]]
      const prev   = monthlyData[months[months.length - 2]]
      if (recent && prev && prev.spend > 0) {
        const delta    = recent.spend - prev.spend
        const deltaPct = Math.round(Math.abs(delta) / prev.spend * 100)
        const dir      = delta > 0 ? 'UP' : 'DOWN'
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

    // Rolling averages if 3+ months
    if (months.length >= 3) {
      const allSpend = months.map(m => monthlyData[m].spend || 0)
      const avgSpend = Math.round(allSpend.reduce((s, v) => s + v, 0) / allSpend.length)
      const recentSpend = monthlyData[months[months.length - 1]].spend || 0
      const vsAvg = recentSpend - avgSpend
      const vsAvgPct = avgSpend > 0 ? Math.round(Math.abs(vsAvg) / avgSpend * 100) : 0
      if (Math.abs(vsAvgPct) >= 10) {
        const dir = vsAvg > 0 ? 'above' : 'below'
        lines.push(`  Most recent month ${fmt(recentSpend)} is ${vsAvgPct}% ${dir} ${months.length}-month avg of ${fmt(avgSpend)}`)
      }
    }
  }

  // -- Anomaly detection --
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

  // -- Recurring obligations --
  if (recurringContext) {
    lines.push('')
    lines.push(recurringContext)
  }

  // -- Profile --
  const usageLabels = {
    personal:   'personal',
    household:  'household (multiple earners)',
    side_hustle: 'has a side hustle',
    sole_prop:   'sole proprietor/freelancer',
  }
  lines.push('')
  lines.push(`PROFILE: ${usageLabels[usageType] || usageType}`)

  return lines.join('\n')
}

/**
 * Build the behavioral insight prompt instruction based on context mode.
 */
export function buildInsightPrompt({ mode = 'overview', question = '', contextBlock }) {
  const FORMAT = 'Never use em dashes. Never use tilde. Never use markdown bold. Plain prose only.'

  const PERSONA = "You are bump.'s financial analyst -- warm, sharp, and South African. You have read this user's actual transaction data including their top merchants by name and rand amount. Speak like a smart friend who knows finance, not a corporate report. Always name specific merchants and exact rand amounts. Never say \'you spent a lot on X' without naming who and how much. Never give generic advice."

  let instruction = ''

  if (mode === 'overview') {
    instruction = `Analyse this user's spending for the period shown. Write 3-4 short, punchy paragraphs:
1. Merchant spotlight: Name the top 2-3 merchants by spend with exact rand amounts (e.g. "Woolies took R2 400, Uber Eats R1 100"). If dining or delivery appears, name the specific merchants and call out delivery vs restaurant split.
2. Overspend flag: Identify the 1-2 biggest budget breaches -- name the category, the overage in rands, and which specific merchants are driving it. Give one concrete action.
3. Positive signal + net position: Note one genuinely healthy behaviour (specific, not generic), then state whether they are on track for their savings goal -- with actual numbers.
If anomalies or recurring obligations appear in the data, reference them by name. Under 200 words. No headers.`
  }

  else if (mode === 'analytics') {
    instruction = `Analyse this user's spending trends across the full period. Write 3-4 short paragraphs:
1. Merchant concentration: Name the top 3 merchants by total spend -- give exact rand amounts and how many transactions each. If delivery apps (Uber Eats, Mr D, Checkers Sixty60) appear, call out the exact delivery-vs-dine-in split in rands and percentage.
2. Category trend: What is the most meaningful shift across categories -- what has grown or shrunk month on month, and what does that signal about their lifestyle or financial health?
3. Spend concentration risk: Is their money spread across many merchants, or dominated by 1-2? Name the concentration and explain why it matters (single-vendor dependency, subscription creep, etc.).
4. Forward action: Based on the patterns, give one specific, actionable habit to change. Name the merchant or category and the exact saving in rands per month.
Under 220 words. No headers.`
  }

  else if (mode === 'income_statement') {
    instruction = `Interpret this income statement. Write 3-4 short paragraphs:
1. Numbers narrative: What story do the totals tell -- are expenses rising faster than income, or is there a surplus? State the net position in rands.
2. Category movement: Identify the 1-2 categories with the most significant change -- name the specific merchants driving it and the rand delta.
3. Action: What should the user actually do based on this period's data? Be concrete -- name the category, the overage, and the specific behaviour change.
Be specific with rand amounts. Under 200 words. No headers.`
  }

  const questionBlock = question && question.trim()
    ? `\n\nUSER\'S QUESTION: "${question.trim()}"\nAddress this directly in your response.`
    : ''

  return `${PERSONA}

${contextBlock}

${instruction}${questionBlock}

${FORMAT}`
}
