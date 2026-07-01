// netlify/functions/tax-chat.js
// AI Q&A on the completed tax estimate. Up to 5 questions per session.
// Has full calculation context — can explain line items or estimate impact of forgotten items.
// Auth required. No financial numbers are generated — only qualitative guidance.

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORMAT_RULES = `Never use em dashes. Never use tilde. Never use markdown bold (**text**). Write in plain prose. Keep responses concise and specific.`

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) return { statusCode: 401, body: 'Unauthorized' }

    const { calculation: r, question, history = [], answers = {} } = JSON.parse(event.body || '{}')
    if (!r || !question?.trim()) return { statusCode: 400, body: JSON.stringify({ error: 'Missing data' }) }

    const fmtR = n => `R${Math.round(n || 0).toLocaleString('en-ZA')}`
    const taxYearLabel = r.taxYear === '2027' ? '2027 (1 Mar 2026 - 28 Feb 2027)' : '2026 (1 Mar 2025 - 28 Feb 2026)'

    const calcContext = `TAX YEAR: ${taxYearLabel}
AGE: ${answers.age || 'not provided'}

INCOME
Gross salary: ${fmtR(r.grossSalary)}
Travel allowance (taxable portion): ${fmtR(r.travelTaxable)}
Net rental income: ${fmtR(r.rentalNetIncome)}
Net freelance income: ${fmtR(r.freelanceNetIncome)}
Taxable interest (above exemption): ${fmtR(r.taxableInterest)}
GROSS INCOME: ${fmtR(r.grossIncome)}

DEDUCTIONS
Retirement annuity: ${fmtR(r.raDeduction)}
Home office: ${fmtR(r.homeOffice)}
Donations (Section 18A): ${fmtR(r.donations)}
TOTAL DEDUCTIONS: ${fmtR(r.totalDeductions)}
TAXABLE INCOME: ${fmtR(r.taxableIncome)}

TAX CALCULATION
Tax on taxable income (from SARS brackets): ${fmtR(r.grossTax)}
Rebates applied: ${fmtR(r.rebates)}
Medical scheme fees tax credit (MSFTC): ${fmtR(r.msftc)}
Additional medical expenses credit: ${fmtR(r.additionalMedCredit)}
NET TAX PAYABLE: ${fmtR(r.netTax)}

PAYE RECONCILIATION
PAYE already paid by employer: ${fmtR(r.payePaid)}
${r.isRefund ? 'REFUND DUE FROM SARS' : 'AMOUNT OWING TO SARS'}: ${fmtR(Math.abs(r.result))}

Effective tax rate: ${r.effectiveRate}%
Marginal tax rate: ${r.marginalRate}%
Provisional taxpayer status: ${r.isProvisionalTaxpayer ? 'Yes (rental or freelance income present)' : 'No'}`

    const systemPrompt = `You are a knowledgeable South African tax assistant helping a taxpayer understand a tax estimate produced by the bump. financial planning app. ${FORMAT_RULES}

The taxpayer's full estimate is below:

${calcContext}

Guidelines:
- Answer questions about the calculation clearly and specifically, referring to the numbers above.
- If the user mentions income or deductions they forgot to include, acknowledge it and estimate the rough impact at their marginal rate of ${r.marginalRate}% (e.g. "An additional RA contribution of R2 000/month = R24 000 annual deduction, saving roughly R${Math.round((r.marginalRate / 100) * 24000).toLocaleString('en-ZA')} in tax at your marginal rate").
- If they want to change their inputs, tell them to use the Back button or Start Again.
- You are NOT a registered tax practitioner. For anything complex or official, recommend they consult a registered tax practitioner or SARS directly.
- Keep responses under 130 words.`

    const messages = [
      ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: question.trim() },
    ]

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: systemPrompt,
      messages,
    })

    const reply = response.content[0]?.text || ''

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    }
  } catch (err) {
    console.error('tax-chat error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not get a response.' }) }
  }
}
