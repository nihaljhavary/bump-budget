import { useState } from 'react'
import { supabase } from '../supabase'
import { TAX_DISCLAIMER } from '../utils/legalText'
import './TaxEstimator.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const TAX_YEAR_LABELS = {
  '2026': '2026 tax year (1 Mar 2025 – 28 Feb 2026) — currently filing',
  '2027': '2027 tax year (1 Mar 2026 – 28 Feb 2027) — in progress',
}

const fmt = n => 'R ' + Math.abs(Math.round(n)).toLocaleString('en-ZA')

function getSteps(answers) {
  const base = ['year', 'basics', 'income', 'other', 'paye', 'ra', 'medical', 'deductions']
  if (answers.hasRental) base.push('rental')
  if (answers.hasFreelance) base.push('freelance')
  base.push('results')
  return base
}

const INITIAL = {
  taxYear: '2026',
  age: '',
  grossSalary: '',
  travelAllowanceAnnual: '',
  hasTravelLogbook: false,
  businessKm: '',
  hasRental: false,
  hasFreelance: false,
  interestIncome: '',
  otherIncomeText: '',
  payePaid: '',
  hasRA: false,
  raMonthly: '',
  hasMedicalAid: false,
  medicalAidMembers: '1',
  medicalAidMonthly: '',
  medicalOOP: '',
  hasDisability: false,
  homeOfficeArea: '',
  totalHomeArea: '',
  homeOfficeCosts: '',
  donationsAmount: '',
  rentalIncome: '',
  rentalBondInterest: '',
  rentalRates: '',
  rentalAgentFees: '',
  rentalInsurance: '',
  rentalRepairs: '',
  rentalGarden: '',
  rentalSecurity: '',
  rentalAdvertising: '',
  rentalLevies: '',
  rentalLetPercent: '100',
  rentalMonths: '12',
  freelanceIncome: '',
  freelanceProfSubs: '',
  freelanceSoftware: '',
  freelancePhone: '',
  freelanceTravel: '',
  freelanceTraining: '',
  freelanceInsurance: '',
  freelanceAccountant: '',
}

// ── Module-level helpers (stable references — no focus loss) ──────────────────
function Field({ label, note, children }) {
  return (
    <div className="te-field">
      <label className="te-label">{label}</label>
      {note && <p className="te-note">{note}</p>}
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, placeholder = '0' }) {
  return (
    <div className="te-money-wrap">
      <span className="te-currency">R</span>
      <input
        type="number" min="0" step="any"
        className="te-input te-input--money"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TaxEstimator() {
  const [answers, setAnswers] = useState({ ...INITIAL })
  const [stepIdx, setStepIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [aiSuggestions, setAiSuggestions] = useState({})
  const [error, setError] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [questionsUsed, setQuestionsUsed] = useState(0)

  const steps = getSteps(answers)
  const currentStep = steps[stepIdx]
  const progress = Math.round((stepIdx / (steps.length - 1)) * 100)

  const set = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }))
  const num = v => parseFloat(String(v).replace(/,/g, '')) || 0

  // ── Navigation ────────────────────────────────────────────────────────────────
  const goNext = async () => {
    setError('')
    if (currentStep === 'other' && answers.otherIncomeText.trim()) {
      fetchAiSuggestions('other')
    }
    if (currentStep === 'rental' || currentStep === 'freelance') {
      fetchAiSuggestions(currentStep)
    }
    if (steps[stepIdx + 1] === 'results') {
      await runCalculation()
      return
    }
    setStepIdx(i => i + 1)
  }

  const goBack = () => { setError(''); setStepIdx(i => Math.max(0, i - 1)) }

  // ── Calculation helpers ───────────────────────────────────────────────────────
  function calcRentalNet() {
    const income = num(answers.rentalIncome)
    const letPct = num(answers.rentalLetPercent) / 100
    const total = [
      num(answers.rentalBondInterest), num(answers.rentalRates),
      num(answers.rentalAgentFees),   num(answers.rentalInsurance),
      num(answers.rentalRepairs),     num(answers.rentalGarden),
      num(answers.rentalSecurity),    num(answers.rentalAdvertising),
      num(answers.rentalLevies),
    ].reduce((a, b) => a + b, 0) * (letPct < 1 ? letPct : 1)
    return income - total
  }

  function calcHomeOffice() {
    const off = num(answers.homeOfficeArea)
    const tot = num(answers.totalHomeArea)
    if (!off || !tot) return 0
    return (off / tot) * num(answers.homeOfficeCosts)
  }

  // ── Full calculation ──────────────────────────────────────────────────────────
  async function runCalculation() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Session expired. Please refresh.'); setLoading(false); return }

      const freelanceNet = answers.hasFreelance ? Math.max(0,
        num(answers.freelanceIncome) - num(answers.freelanceProfSubs)
        - num(answers.freelanceSoftware) - num(answers.freelancePhone)
        - num(answers.freelanceTravel) - num(answers.freelanceTraining)
        - num(answers.freelanceInsurance) - num(answers.freelanceAccountant)) : 0

      const payload = {
        taxYear: answers.taxYear,
        age: num(answers.age),
        grossSalary: num(answers.grossSalary),
        travelAllowanceAnnual: num(answers.travelAllowanceAnnual) * 0.8,
        travelDeduction: answers.hasTravelLogbook ? num(answers.businessKm) * 4.95 : 0,
        rentalNetIncome: answers.hasRental ? calcRentalNet() : 0,
        freelanceNetIncome: answers.hasFreelance ? freelanceNet : 0,
        interestIncome: num(answers.interestIncome),
        annualRA: answers.hasRA ? num(answers.raMonthly) * 12 : 0,
        homeOfficeDeduction: calcHomeOffice(),
        donationsAmount: num(answers.donationsAmount),
        medicalAidMembers: answers.hasMedicalAid ? num(answers.medicalAidMembers) : 0,
        medicalAidAnnual: answers.hasMedicalAid ? num(answers.medicalAidMonthly) * 12 : 0,
        medicalOOP: num(answers.medicalOOP),
        hasDisability: answers.hasDisability,
        payePaid: num(answers.payePaid),
      }

      const res = await fetch('/.netlify/functions/tax-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Calculation failed')
      setResult(data)
      setStepIdx(steps.length - 1)
    } catch {
      setError('Could not complete calculation. Please check your inputs and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── AI suggestions (fire-and-forget) ─────────────────────────────────────────
  async function fetchAiSuggestions(type) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const bodyMap = {
        rental: {
          bondInterest: num(answers.rentalBondInterest), rates: num(answers.rentalRates),
          agentFees: num(answers.rentalAgentFees),       insurance: num(answers.rentalInsurance),
          repairs: num(answers.rentalRepairs),            garden: num(answers.rentalGarden),
          security: num(answers.rentalSecurity),          advertising: num(answers.rentalAdvertising),
          levies: num(answers.rentalLevies),
        },
        freelance: {
          profSubscriptions: num(answers.freelanceProfSubs), software: num(answers.freelanceSoftware),
          phone: num(answers.freelancePhone),                travel: num(answers.freelanceTravel),
          training: num(answers.freelanceTraining),          insurance: num(answers.freelanceInsurance),
          accountant: num(answers.freelanceAccountant),
        },
        other: { freeText: answers.otherIncomeText },
      }
      const res = await fetch('/.netlify/functions/tax-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incomeType: type, answers: bodyMap[type] }),
      })
      const data = await res.json()
      if (data.suggestion) setAiSuggestions(prev => ({ ...prev, [type]: data.suggestion }))
    } catch { /* silent */ }
  }


  // ── Tax Q&A chat ──────────────────────────────────────────────────────────────
  async function sendChatMessage() {
    const q = chatInput.trim()
    if (!q || questionsUsed >= 5 || chatLoading) return
    setChatInput('')
    setChatLoading(true)
    const questionNumber = questionsUsed + 1
    const newMsg = { role: 'user', content: q }
    setChatMessages(prev => [...prev, newMsg])
    setQuestionsUsed(n => n + 1)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/tax-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          calculation: result,
          question: q,
          history: chatMessages,
          questionNumber,
          answers: { taxYear: answers.taxYear, age: answers.age, hasRental: answers.hasRental,
                     hasFreelance: answers.hasFreelance, hasRA: answers.hasRA, hasMedicalAid: answers.hasMedicalAid },
        }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'No response.' }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Could not get a response. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Step renderers (plain functions, not sub-components — avoids focus loss) ──

  function renderYear() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Which tax year are you estimating?</h2>
        <p className="te-step-sub">Most people filing right now are completing their 2026 return.</p>
        <div className="te-year-cards">
          {Object.entries(TAX_YEAR_LABELS).map(([yr, label]) => (
            <button key={yr} className={`te-year-card ${answers.taxYear === yr ? 'active' : ''}`}
              onClick={() => set('taxYear', yr)}>
              <span className="te-year-num">{yr}</span>
              <span className="te-year-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  function renderBasics() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">A bit about you</h2>
        <Field label="Your age" note="Determines which rebates and exemptions apply (primary, secondary, tertiary rebate thresholds).">
          <input type="number" min="18" max="100" className="te-input"
            value={answers.age} onChange={e => set('age', e.target.value)} placeholder="e.g. 34" />
        </Field>
      </div>
    )
  }

  function renderIncome() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Your income sources</h2>
        <p className="te-step-sub">Gross (before tax) amounts for the full tax year.</p>

        <Field label="Gross employment salary"
          note="Total before any deductions. Check your IRP5 — use the gross remuneration figure.">
          <MoneyInput value={answers.grossSalary} onChange={v => set('grossSalary', v)} placeholder="e.g. 480 000" />
        </Field>

        <Field label="Travel allowance from employer (annual)"
          note="Only if employer pays a separate travel allowance. Leave blank if costs are reimbursed monthly.">
          <MoneyInput value={answers.travelAllowanceAnnual} onChange={v => set('travelAllowanceAnnual', v)} placeholder="0" />
        </Field>

        {num(answers.travelAllowanceAnnual) > 0 && (
          <Field label="Did you keep a logbook?"
            note="A logbook lets you claim actual business km. Without one, 80% of the allowance is taxable.">
            <div className="te-radio-group">
              <button className={`te-radio ${answers.hasTravelLogbook ? 'active' : ''}`}
                onClick={() => set('hasTravelLogbook', true)}>Yes, I kept a logbook</button>
              <button className={`te-radio ${!answers.hasTravelLogbook ? 'active' : ''}`}
                onClick={() => set('hasTravelLogbook', false)}>No logbook</button>
            </div>
            {answers.hasTravelLogbook && (
              <div style={{ marginTop: 12 }}>
                <label className="te-label">Business kilometres driven</label>
                <input type="number" min="0" className="te-input"
                  value={answers.businessKm} onChange={e => set('businessKm', e.target.value)} placeholder="e.g. 8 000" />
                <p className="te-note">SARS safe-harbour rate: R4.95/km</p>
              </div>
            )}
          </Field>
        )}

        <Field label="Interest income (annual)"
          note="Interest from savings, fixed deposits, money market. Your bank sends an IT3(b) certificate.">
          <MoneyInput value={answers.interestIncome} onChange={v => set('interestIncome', v)} placeholder="0" />
        </Field>

        <div className="te-divider" />
        <p className="te-step-sub" style={{ fontWeight: 600 }}>Additional income sources</p>
        <div className="te-checkbox-group">
          <label className="te-checkbox">
            <input type="checkbox" checked={answers.hasRental}
              onChange={e => set('hasRental', e.target.checked)} />
            <span>I earn rental income from a property</span>
          </label>
          <label className="te-checkbox">
            <input type="checkbox" checked={answers.hasFreelance}
              onChange={e => set('hasFreelance', e.target.checked)} />
            <span>I earn freelance or consulting income</span>
          </label>
        </div>
      </div>
    )
  }

  function renderOther() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Anything else bump. should know?</h2>
        <p className="te-step-sub">
          Describe any other income, deductions, or tax situations in plain language. bump. will analyse
          your description and flag anything relevant before calculating.
        </p>
        <p className="te-step-sub" style={{ marginTop: 4 }}>
          Examples: commission income, share options or RSUs, foreign income, multiple employers,
          SARS dispute or outstanding return, provisional tax payments already made, Section 11(a) business expenses,
          solar or EV incentive, bursary income, inheritance, alimony received or paid.
        </p>
        <div className="te-field">
          <textarea
            className="te-textarea"
            rows={5}
            placeholder="e.g. I received a bonus of R50 000 in June and also earned R8 000 commission. I made two provisional tax payments totalling R12 000. I have share options that vested this year..."
            value={answers.otherIncomeText}
            onChange={e => set('otherIncomeText', e.target.value)}
          />
        </div>
        <p className="te-hint">This step is optional — tap Continue to skip if nothing applies.</p>
        {aiSuggestions.other && (
          <div className="te-ai-suggestion" style={{ marginTop: 16 }}>
            <span className="te-ai-label">bump. notes</span>
            <p>{aiSuggestions.other}</p>
          </div>
        )}
      </div>
    )
  }

  function renderPaye() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">PAYE already deducted</h2>
        <p className="te-step-sub">Tax your employer paid to SARS on your behalf — this reduces what you owe (or increases your refund).</p>
        <Field label="Total PAYE deducted this tax year"
          note="Find on your IRP5 certificate or last payslip of the year. Look for 'PAYE' or 'employees tax'.">
          <MoneyInput value={answers.payePaid} onChange={v => set('payePaid', v)} placeholder="e.g. 68 000" />
        </Field>
        <p className="te-hint">Tip: ask payroll for your tax certificate if you are unsure.</p>
      </div>
    )
  }

  function renderRA() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Retirement annuity contributions</h2>
        <p className="te-step-sub">
          Private RA contributions are deductible at 27.5% of income, capped at
          R{answers.taxYear === '2027' ? '430 000' : '350 000'}.
        </p>
        <Field label="Do you contribute to a private RA?">
          <div className="te-radio-group">
            <button className={`te-radio ${answers.hasRA ? 'active' : ''}`} onClick={() => set('hasRA', true)}>Yes</button>
            <button className={`te-radio ${!answers.hasRA ? 'active' : ''}`} onClick={() => set('hasRA', false)}>No</button>
          </div>
        </Field>
        {answers.hasRA && (
          <Field label="Monthly RA contribution" note="Your monthly debit order. Do not include employer contributions.">
            <MoneyInput value={answers.raMonthly} onChange={v => set('raMonthly', v)} placeholder="e.g. 3 000" />
          </Field>
        )}
      </div>
    )
  }

  function renderMedical() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Medical aid</h2>
        <Field label="Are you on a medical aid scheme?">
          <div className="te-radio-group">
            <button className={`te-radio ${answers.hasMedicalAid ? 'active' : ''}`} onClick={() => set('hasMedicalAid', true)}>Yes</button>
            <button className={`te-radio ${!answers.hasMedicalAid ? 'active' : ''}`} onClick={() => set('hasMedicalAid', false)}>No</button>
          </div>
        </Field>
        {answers.hasMedicalAid && (<>
          <Field label="Total people covered (including yourself)"
            note="You + dependants. E.g. you + spouse + 2 children = 4.">
            <input type="number" min="1" max="10" className="te-input te-input--small"
              value={answers.medicalAidMembers} onChange={e => set('medicalAidMembers', e.target.value)} />
          </Field>
          <Field label="Your monthly medical aid contribution"
            note="Total you pay monthly, including all dependant premiums.">
            <MoneyInput value={answers.medicalAidMonthly} onChange={v => set('medicalAidMonthly', v)} placeholder="e.g. 4 500" />
          </Field>
          <Field label="Qualifying out-of-pocket medical expenses (annual)"
            note="Co-payments, approved medicines, dentist, optometrist, specialist visits not covered. Keep receipts.">
            <MoneyInput value={answers.medicalOOP} onChange={v => set('medicalOOP', v)} placeholder="0" />
          </Field>
          <Field label="Do you, your spouse, or a dependant have a disability?">
            <div className="te-radio-group">
              <button className={`te-radio ${answers.hasDisability ? 'active' : ''}`} onClick={() => set('hasDisability', true)}>Yes</button>
              <button className={`te-radio ${!answers.hasDisability ? 'active' : ''}`} onClick={() => set('hasDisability', false)}>No</button>
            </div>
            {answers.hasDisability && (
              <p className="te-note" style={{ marginTop: 8 }}>
                33.3% credit rate applies and the 7.5% income floor is waived.
                Requires ITR-DD form confirmed by a registered medical practitioner.
              </p>
            )}
          </Field>
        </>)}
      </div>
    )
  }

  function renderDeductions() {
    const pct = answers.homeOfficeArea && answers.totalHomeArea
      ? ((num(answers.homeOfficeArea) / num(answers.totalHomeArea)) * 100).toFixed(1)
      : null
    return (
      <div className="te-step">
        <h2 className="te-step-title">Other deductions</h2>
        <Field label="Home office"
          note="Room used exclusively and regularly for work. Bond/mortgage interest is NOT deductible for employees from 2023.">
          <div className="te-inline-fields">
            <div>
              <label className="te-label">Office area (m²)</label>
              <input type="number" min="0" className="te-input te-input--small"
                value={answers.homeOfficeArea} onChange={e => set('homeOfficeArea', e.target.value)} placeholder="e.g. 18" />
            </div>
            <div>
              <label className="te-label">Total home area (m²)</label>
              <input type="number" min="0" className="te-input te-input--small"
                value={answers.totalHomeArea} onChange={e => set('totalHomeArea', e.target.value)} placeholder="e.g. 200" />
            </div>
          </div>
          {answers.homeOfficeArea && answers.totalHomeArea && (
            <div style={{ marginTop: 12 }}>
              <Field label="Annual home-running costs to apportion"
                note="Rent or rates, electricity, cleaning, repairs. Do NOT include bond interest.">
                <MoneyInput value={answers.homeOfficeCosts} onChange={v => set('homeOfficeCosts', v)} placeholder="e.g. 48 000" />
              </Field>
              {answers.homeOfficeCosts && (
                <p className="te-calc-preview">
                  Estimated deduction: {fmt(calcHomeOffice())} ({pct}% of R{Math.round(num(answers.homeOfficeCosts)).toLocaleString('en-ZA')})
                </p>
              )}
            </div>
          )}
        </Field>
        <Field label="Donations to registered charities (Section 18A)"
          note="Requires a Section 18A receipt. Deductible up to 10% of taxable income.">
          <MoneyInput value={answers.donationsAmount} onChange={v => set('donationsAmount', v)} placeholder="0" />
        </Field>
      </div>
    )
  }

  function renderRental() {
    return (
      <div className="te-step">
        <h2 className="te-step-title">Rental property</h2>
        <p className="te-step-sub">Annual figures for the full tax year.</p>
        <Field label="Total rental income received">
          <MoneyInput value={answers.rentalIncome} onChange={v => set('rentalIncome', v)} placeholder="e.g. 96 000" />
        </Field>
        <div className="te-section-label">Deductible expenses</div>
        <div className="te-expense-grid">
          {[
            { key: 'rentalBondInterest', label: 'Bond interest', note: 'Interest only — not capital repayment.' },
            { key: 'rentalRates',        label: 'Municipal rates and taxes', note: null },
            { key: 'rentalAgentFees',    label: 'Estate agent / management fees', note: null },
            { key: 'rentalInsurance',    label: 'Homeowners insurance', note: 'Building insurance only.' },
            { key: 'rentalRepairs',      label: 'Repairs and maintenance', note: 'Restoring, not improving.' },
            { key: 'rentalGarden',       label: 'Garden services', note: null },
            { key: 'rentalSecurity',     label: 'Security costs', note: null },
            { key: 'rentalAdvertising',  label: 'Tenant advertising', note: null },
            { key: 'rentalLevies',       label: 'Body corporate / sectional title levies', note: null },
          ].map(({ key, label, note }) => (
            <div key={key} className="te-expense-item">
              <label className="te-label">{label}</label>
              {note && <p className="te-note">{note}</p>}
              <MoneyInput value={answers[key]} onChange={v => set(key, v)} placeholder="0" />
            </div>
          ))}
        </div>
        <div className="te-inline-fields" style={{ marginTop: 16 }}>
          <div>
            <label className="te-label">% of property let</label>
            <p className="te-note">100 if fully let, less if only a room.</p>
            <input type="number" min="1" max="100" className="te-input te-input--small"
              value={answers.rentalLetPercent} onChange={e => set('rentalLetPercent', e.target.value)} />
          </div>
          <div>
            <label className="te-label">Months let this year</label>
            <input type="number" min="1" max="12" className="te-input te-input--small"
              value={answers.rentalMonths} onChange={e => set('rentalMonths', e.target.value)} />
          </div>
        </div>
        {answers.rentalIncome && (
          <div className="te-calc-preview">
            Net rental {calcRentalNet() >= 0 ? 'income' : 'loss'}: {fmt(Math.abs(calcRentalNet()))}
            {calcRentalNet() < 0 && ' (loss subject to ring-fencing rules)'}
          </div>
        )}
        {aiSuggestions.rental && (
          <div className="te-ai-suggestion">
            <span className="te-ai-label">bump. suggestion</span>
            <p>{aiSuggestions.rental}</p>
          </div>
        )}
      </div>
    )
  }

  function renderFreelance() {
    const net = Math.max(0, num(answers.freelanceIncome)
      - num(answers.freelanceProfSubs) - num(answers.freelanceSoftware)
      - num(answers.freelancePhone) - num(answers.freelanceTravel)
      - num(answers.freelanceTraining) - num(answers.freelanceInsurance)
      - num(answers.freelanceAccountant))
    return (
      <div className="te-step">
        <h2 className="te-step-title">Freelance / consulting income</h2>
        <p className="te-step-sub">Annual figures. Deductible expenses must be costs incurred to earn this income.</p>
        <Field label="Total gross freelance income (invoiced)">
          <MoneyInput value={answers.freelanceIncome} onChange={v => set('freelanceIncome', v)} placeholder="e.g. 120 000" />
        </Field>
        <div className="te-section-label">Deductible business expenses</div>
        <div className="te-expense-grid">
          {[
            { key: 'freelanceProfSubs',   label: 'Professional body memberships', note: null },
            { key: 'freelanceSoftware',   label: 'Business software subscriptions', note: null },
            { key: 'freelancePhone',      label: 'Business proportion of phone and data', note: 'E.g. 50% business use → 50% of annual bill.' },
            { key: 'freelanceTravel',     label: 'Business travel', note: 'Client visits. Not daily commuting.' },
            { key: 'freelanceTraining',   label: 'Professional development and training', note: null },
            { key: 'freelanceInsurance',  label: 'Professional indemnity insurance', note: null },
            { key: 'freelanceAccountant', label: 'Accountant or tax practitioner fees', note: null },
          ].map(({ key, label, note }) => (
            <div key={key} className="te-expense-item">
              <label className="te-label">{label}</label>
              {note && <p className="te-note">{note}</p>}
              <MoneyInput value={answers[key]} onChange={v => set(key, v)} placeholder="0" />
            </div>
          ))}
        </div>
        {answers.freelanceIncome && (
          <div className="te-calc-preview">Net freelance income: {fmt(net)}</div>
        )}
        {aiSuggestions.freelance && (
          <div className="te-ai-suggestion">
            <span className="te-ai-label">bump. suggestion</span>
            <p>{aiSuggestions.freelance}</p>
          </div>
        )}
      </div>
    )
  }

  function renderResults() {
    if (!result) return <div className="te-loading">Calculating...</div>
    const r = result
    const refundAmt = Math.abs(r.result)
    const isRefund = r.isRefund
    const taxYearLabel = r.taxYear === '2027' ? '1 Mar 2026 – 28 Feb 2027' : '1 Mar 2025 – 28 Feb 2026'

    const Row = ({ label, amount, bold, negative, highlight }) => (
      <div className={`te-row ${bold ? 'bold' : ''} ${highlight ? `highlight-${highlight}` : ''}`}>
        <span>{label}</span>
        <span className={negative ? 'te-neg' : ''}>{negative ? '- ' : ''}{fmt(amount)}</span>
      </div>
    )

    return (
      <div className="te-step te-results">
        <div className={`te-result-hero ${isRefund ? 'refund' : 'owing'}`}>
          <span className="te-result-label">{isRefund ? 'Estimated refund' : 'Estimated amount owing'}</span>
          <span className="te-result-amount">{fmt(refundAmt)}</span>
          <span className="te-result-sub">
            {isRefund
              ? 'SARS owes you this. Expect it once your assessment is finalised.'
              : 'You owe SARS this amount when you submit your return.'}
          </span>
        </div>

        <div className="te-breakdown">
          <div className="te-breakdown-title">How we calculated this ({taxYearLabel})</div>
          <div className="te-breakdown-section">
            <div className="te-breakdown-head">Income</div>
            {r.grossSalary > 0 && <Row label="Gross salary" amount={r.grossSalary} />}
            {r.travelTaxable > 0 && <Row label="Travel allowance (taxable portion)" amount={r.travelTaxable} />}
            {r.rentalNetIncome > 0 && <Row label="Net rental income" amount={r.rentalNetIncome} />}
            {r.freelanceNetIncome > 0 && <Row label="Net freelance income" amount={r.freelanceNetIncome} />}
            {r.taxableInterest > 0 && <Row label="Taxable interest (above exemption)" amount={r.taxableInterest} />}
            <Row label="Gross income" amount={r.grossIncome} bold />
          </div>
          {r.totalDeductions > 0 && (
            <div className="te-breakdown-section">
              <div className="te-breakdown-head">Deductions</div>
              {r.raDeduction > 0 && <Row label="Retirement annuity" amount={r.raDeduction} negative />}
              {r.homeOffice > 0 && <Row label="Home office" amount={r.homeOffice} negative />}
              {r.donations > 0 && <Row label="Donations (Section 18A)" amount={r.donations} negative />}
              <Row label="Total deductions" amount={r.totalDeductions} negative bold />
            </div>
          )}
          <div className="te-breakdown-section">
            <div className="te-breakdown-head">Tax calculation</div>
            <Row label="Taxable income" amount={r.taxableIncome} bold />
            <Row label="Tax on taxable income" amount={r.grossTax} />
            <Row label="Primary rebate" amount={r.rebates} negative />
            <Row label="Tax after rebates" amount={Math.max(0, r.grossTax - r.rebates)} />
            {r.msftc > 0 && <Row label="Medical scheme fees credit" amount={r.msftc} negative />}
            {r.additionalMedCredit > 0 && <Row label="Additional medical expenses credit" amount={r.additionalMedCredit} negative />}
            <Row label="Net tax payable" amount={r.netTax} bold />
          </div>
          <div className="te-breakdown-section">
            <div className="te-breakdown-head">PAYE reconciliation</div>
            <Row label="Net tax payable" amount={r.netTax} />
            <Row label="PAYE already paid" amount={r.payePaid} negative />
            <Row label={isRefund ? 'Refund due' : 'Amount owing'} amount={refundAmt} bold highlight={isRefund ? 'green' : 'red'} />
          </div>
        </div>

        <div className="te-meta-row">
          <span>Effective rate: <strong>{r.effectiveRate}%</strong></span>
          <span>Marginal rate: <strong>{r.marginalRate}%</strong></span>
        </div>

        {aiSuggestions.other && (
          <div className="te-ai-suggestion" style={{ marginTop: 16 }}>
            <span className="te-ai-label">bump. notes on your other income</span>
            <p>{aiSuggestions.other}</p>
          </div>
        )}


        {/* ── Tax Q&A ── */}
        <div className="te-chat">
          <div className="te-chat-head">
            <span>Questions about your estimate</span>
            <span className="te-chat-quota">{questionsUsed}/5 questions used</span>
          </div>
          {chatMessages.length === 0 && (
            <p className="te-chat-hint">
              Ask anything — why your marginal rate is what it is, what a forgotten deduction would save you,
              what provisional tax means for you, or anything else about this calculation.
            </p>
          )}
          <div className="te-chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`te-chat-msg te-chat-msg--${msg.role}`}>
                {msg.role === 'assistant' && <span className="te-chat-ai-label">bump.</span>}
                <p>{msg.content}</p>
              </div>
            ))}
            {chatLoading && (
              <div className="te-chat-msg te-chat-msg--assistant te-chat-msg--loading">
                <span className="te-chat-ai-label">bump.</span>
                <p>Thinking...</p>
              </div>
            )}
          </div>
          {questionsUsed < 5 ? (
            <div className="te-chat-input-row">
              <textarea
                className="te-chat-input"
                rows={2}
                placeholder="e.g. Why is my marginal rate 36%? Or: I forgot to include my RA of R2 000/month..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                disabled={chatLoading}
              />
              <button className="te-chat-send" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                Ask
              </button>
            </div>
          ) : (
            <p className="te-chat-limit">All 5 questions used. Start again if you want to recalculate with updated figures.</p>
          )}
        </div>

        {r.isProvisionalTaxpayer && (
          <div className="te-flag provisional">
            <strong>Provisional taxpayer notice:</strong> Rental or freelance income means you are likely
            a provisional taxpayer. Submit provisional returns by 31 Aug and last day of Feb each year.
            Register with SARS or contact a tax practitioner.
          </div>
        )}

        <div className="te-disclaimer">
          Planning estimate only — not a formal tax assessment. Actual SARS assessments may differ.
          bump. is not a registered tax practitioner. Consult a qualified practitioner before filing.
        </div>

        <div className="te-actions">
          <a href="https://efiling.sars.gov.za" target="_blank" rel="noopener noreferrer" className="te-btn-efiling">
            Go to SARS eFiling
          </a>
          <button className="te-btn-restart"
            onClick={() => { setAnswers({ ...INITIAL }); setResult(null); setStepIdx(0); setAiSuggestions({}) }}>
            Start again
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  const stepRenderer = {
    year: renderYear, basics: renderBasics, income: renderIncome, other: renderOther,
    paye: renderPaye, ra: renderRA, medical: renderMedical, deductions: renderDeductions,
    rental: renderRental, freelance: renderFreelance, results: renderResults,
  }

  return (
    <div className="te-wrap">
      <div className="te-banner-disclaimer">
        <span className="te-banner-icon">&#9432;</span>
        <span>
          Estimate only — not a tax return. Consult a registered tax practitioner before filing.{' '}
          <button className="te-banner-more" onClick={() => alert(TAX_DISCLAIMER)}>Full disclaimer</button>
        </span>
      </div>

      <div className="te-header">
        <div className="te-progress-bar">
          <div className="te-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="te-step-count">Step {stepIdx + 1} of {steps.length}</div>
      </div>

      <div className="te-body">
        {stepRenderer[currentStep]?.()}
      </div>

      {currentStep !== 'results' && (
        <div className="te-nav">
          {stepIdx > 0 && (
            <button className="te-btn-back" onClick={goBack} disabled={loading}>Back</button>
          )}
          <button className="te-btn-next" onClick={goNext} disabled={loading}>
            {loading ? 'Calculating...' : steps[stepIdx + 1] === 'results' ? 'Calculate' : 'Continue'}
          </button>
        </div>
      )}

      {error && <p className="te-error">{error}</p>}
    </div>
  )
}
