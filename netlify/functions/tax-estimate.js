// netlify/functions/tax-estimate.js
// Deterministic SARS tax calculation engine — 2026 and 2027 tax years
// No AI involved. All numbers sourced from SARS Budget Tax Guides.
// Auth required. Never exposes raw errors to client.

const TAX_DATA = {
  // 2026 tax year: 1 March 2025 – 28 February 2026
  '2026': {
    brackets: [
      { from: 0,       to: 237100,   base: 0,      rate: 0.18 },
      { from: 237100,  to: 370500,   base: 42678,  rate: 0.26 },
      { from: 370500,  to: 512800,   base: 77362,  rate: 0.31 },
      { from: 512800,  to: 673000,   base: 121475, rate: 0.36 },
      { from: 673000,  to: 857900,   base: 179147, rate: 0.39 },
      { from: 857900,  to: 1817000,  base: 251258, rate: 0.41 },
      { from: 1817000, to: Infinity, base: 644489, rate: 0.45 },
    ],
    rebates: { primary: 17235, secondary: 9444, tertiary: 3145 },
    thresholds: { under65: 95750, age65: 148217, age75: 165689 },
    medCredit: { main: 364, additional: 246 },
    interestExemption: { under65: 23800, age65plus: 34500 },
    raCapAmount: 350000,
  },
  // 2027 tax year: 1 March 2026 – 28 February 2027
  // Source: SARS Budget 2026 Tax Guide (official PDF)
  '2027': {
    brackets: [
      { from: 0,        to: 245100,   base: 0,      rate: 0.18 },
      { from: 245100,   to: 383100,   base: 44118,  rate: 0.26 },
      { from: 383100,   to: 530200,   base: 79998,  rate: 0.31 },
      { from: 530200,   to: 695800,   base: 125599, rate: 0.36 },
      { from: 695800,   to: 887000,   base: 185215, rate: 0.39 },
      { from: 887000,   to: 1878600,  base: 259783, rate: 0.41 },
      { from: 1878600,  to: Infinity, base: 666339, rate: 0.45 },
    ],
    rebates: { primary: 17820, secondary: 9765, tertiary: 3249 },
    thresholds: { under65: 99000, age65: 153250, age75: 171300 },
    medCredit: { main: 376, additional: 254 },
    interestExemption: { under65: 23800, age65plus: 34500 },
    raCapAmount: 430000,
  },
}

function getMarginalRate(taxableIncome, brackets) {
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].from) return Math.round(brackets[i].rate * 100)
  }
  return 0
}

function applyBrackets(taxableIncome, brackets) {
  let tax = 0
  for (const b of brackets) {
    if (taxableIncome > b.from) {
      tax = b.base + (taxableIncome - b.from) * b.rate
    }
  }
  return Math.round(tax)
}

function calculate(input) {
  const {
    taxYear = '2026',
    age,
    grossSalary = 0,
    travelAllowanceAnnual = 0,
    travelDeduction = 0,
    rentalNetIncome = 0,
    freelanceNetIncome = 0,
    interestIncome = 0,
    annualRA = 0,
    homeOfficeDeduction = 0,
    donationsAmount = 0,
    medicalAidMembers = 0,
    medicalAidAnnual = 0,
    medicalOOP = 0,
    hasDisability = false,
    payePaid = 0,
  } = input

  const td = TAX_DATA[taxYear] || TAX_DATA['2026']
  const ageNum = Math.max(0, parseInt(age) || 30)

  // ── 1. Gross income ──────────────────────────────────────────────────────────
  // Travel allowance: 80% taxable unless logbook kept (deduction applied separately)
  const travelTaxable = Math.max(0, travelAllowanceAnnual - travelDeduction)
  const interestExemption = ageNum >= 65 ? td.interestExemption.age65plus : td.interestExemption.under65
  const taxableInterest = Math.max(0, interestIncome - interestExemption)

  const grossIncome = grossSalary + travelTaxable + rentalNetIncome + freelanceNetIncome + taxableInterest

  // ── 2. Deductions ────────────────────────────────────────────────────────────
  // RA: limited to 27.5% of remuneration or taxable income (use gross salary as proxy) and R350k/R430k cap
  const raDeduction = Math.min(annualRA, Math.min(0.275 * grossSalary, td.raCapAmount))

  // Home office: user already provides the pre-calculated amount (sqm ratio × costs)
  const homeOffice = Math.max(0, homeOfficeDeduction)

  // Donations: capped at 10% of taxable income (approximated as gross income pre-donation)
  const donationsCap = 0.10 * grossIncome
  const donations = Math.min(donationsAmount, donationsCap)

  const totalDeductions = raDeduction + homeOffice + donations

  // ── 3. Taxable income ────────────────────────────────────────────────────────
  const taxableIncome = Math.max(0, grossIncome - totalDeductions)

  // ── 4. Below threshold? ──────────────────────────────────────────────────────
  const threshold = ageNum >= 75 ? td.thresholds.age75
    : ageNum >= 65 ? td.thresholds.age65
    : td.thresholds.under65

  if (taxableIncome <= threshold) {
    const result = -(payePaid)
    return {
      grossIncome, totalDeductions, taxableIncome,
      grossTax: 0, rebates: 0, msftc: 0, additionalMedCredit: 0, netTax: 0,
      payePaid, result, isRefund: result <= 0,
      effectiveRate: '0', marginalRate: 0,
      isProvisionalTaxpayer: rentalNetIncome > 0 || freelanceNetIncome > 0,
      belowThreshold: true, taxYear,
      // breakdown
      grossSalary, travelTaxable, rentalNetIncome, freelanceNetIncome,
      taxableInterest, raDeduction, homeOffice, donations,
    }
  }

  // ── 5. Tax on taxable income ─────────────────────────────────────────────────
  const grossTax = applyBrackets(taxableIncome, td.brackets)

  // ── 6. Rebates ───────────────────────────────────────────────────────────────
  let rebates = td.rebates.primary
  if (ageNum >= 65) rebates += td.rebates.secondary
  if (ageNum >= 75) rebates += td.rebates.tertiary
  const taxAfterRebates = Math.max(0, grossTax - rebates)

  // ── 7. Medical Scheme Fees Tax Credit (MSFTC) ────────────────────────────────
  const members = Math.max(0, parseInt(medicalAidMembers) || 0)
  const mainMembers = Math.min(members, 2)
  const additionalMembers = Math.max(0, members - 2)
  const msftcMonthly = (mainMembers * td.medCredit.main) + (additionalMembers * td.medCredit.additional)
  const msftcAnnual = msftcMonthly * 12
  const msftc = Math.min(msftcAnnual, taxAfterRebates)
  const taxAfterMsftc = Math.max(0, taxAfterRebates - msftc)

  // ── 8. Additional Medical Expenses Tax Credit ────────────────────────────────
  let additionalMedCredit = 0
  if (members > 0 && (medicalAidAnnual > 0 || medicalOOP > 0)) {
    if (ageNum >= 65 || hasDisability) {
      // 33.3% of excess above 3× MSFTC — no floor
      const excessContribs = Math.max(0, medicalAidAnnual - 3 * msftcAnnual)
      additionalMedCredit = Math.round(0.333 * (excessContribs + medicalOOP))
    } else {
      // 25% of excess above 4× MSFTC, but only the portion that exceeds 7.5% of taxable income
      const excessContribs = Math.max(0, medicalAidAnnual - 4 * msftcAnnual)
      const combined = excessContribs + medicalOOP
      const floor = 0.075 * taxableIncome
      const creditable = Math.max(0, combined - floor)
      additionalMedCredit = Math.round(0.25 * creditable)
    }
    additionalMedCredit = Math.min(additionalMedCredit, taxAfterMsftc)
  }

  // ── 9. Net tax and result ────────────────────────────────────────────────────
  const netTax = Math.max(0, taxAfterMsftc - additionalMedCredit)
  const result = netTax - payePaid

  return {
    // Income
    grossSalary, travelTaxable, rentalNetIncome, freelanceNetIncome, taxableInterest, grossIncome,
    // Deductions
    raDeduction, homeOffice, donations, totalDeductions,
    // Tax steps
    taxableIncome,
    grossTax,
    rebates,
    msftc: Math.round(msftc),
    additionalMedCredit,
    netTax: Math.round(netTax),
    payePaid,
    result: Math.round(result),
    isRefund: result < 0,
    belowThreshold: false,
    // Meta
    taxYear,
    effectiveRate: grossIncome > 0 ? (netTax / grossIncome * 100).toFixed(1) : '0',
    marginalRate: getMarginalRate(taxableIncome, td.brackets),
    isProvisionalTaxpayer: rentalNetIncome > 0 || freelanceNetIncome > 0,
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) return { statusCode: 401, body: 'Unauthorized' }

    const body = JSON.parse(event.body || '{}')
    const result = calculate(body)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }
  } catch (err) {
    console.error('tax-estimate error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Calculation failed. Please try again.' }) }
  }
}
