import { useState } from 'react'
import { supabase } from '../supabase'
import { TAX_DISCLAIMER } from '../utils/legalText'
import './TaxEstimator.css'

// ── Constants ────────────────────────────────────────────────────────────────
const TAX_YEAR_LABELS = {
  '2026': '2026 tax year (1 Mar 2025 – 28 Feb 2026) — currently filing',
  '2027': '2027 tax year (1 Mar 2026 – 28 Feb 2027) — in progress',
}

const fmt = n => 'R ' + Math.abs(Math.round(n)).toLocaleString('en-ZA')

function getSteps(answers) {
  const base = ['year', 'basics', 'income', 'paye', 'ra', 'medical', 'deductions']
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
  // rental
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
  // freelance
  freelanceIncome: '',
  freelanceProfSubs: '',
  freelanceSoftware: '',
  freelancePhone: '',
  freelanceTravel: '',
  freelanceTraining: '',
  freelanceInsurance: '',
  freelanceAccountant: '',
}

export default function TaxEstimator() {
  const [answers, setAnswers] = useState({ ...INITIAL })
  const [stepIdx, setStepIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [aiSuggestions, setAiSuggestions] = useState({})
  const [error, setError] = useState('')

  const steps = getSteps(answers)
  const currentStep = steps[stepIdx]
  const progress = Math.round(((stepIdx) / (steps.length - 1)) * 100)

  const set = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }))
  const num = v => parseFloat(String(v).replace(/,/g, '')) || 0

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goNext = async () => {
    setError('')
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

  // ── Rental net income calculation ────────────────────────────────────────────
  function calcRentalNet() {
    const income = num(answers.rentalIncome)
    const letPct = num(answers.rentalLetPercent) / 100
    const expenses = [
      num(answers.rentalBondInterest),
      num(answers.rentalRates),
      num(answers.rentalAgentFees),
      num(answers.rentalInsurance),
      num(answers.rentalRepairs),
      num(answers.rentalGarden),
      num(answers.rentalSecurity),
      num(answers.rentalAdvertising),
      num(answers.rentalLevies),
    ]
    const totalExpenses = expenses.reduce((a, b) => a + b, 0) * (letPct < 1 ? letPct : 1)
    return income - totalExpenses
  }

  // ── Home office deduction ────────────────────────────────────────────────────
  function calcHomeOffice() {
    const officeArea = num(answers.homeOfficeArea)
    const totalArea = num(answers.totalHomeArea)
    const costs = num(answers.homeOfficeCosts)
    if (!officeArea || !totalArea || totalArea === 0) return 0
    return (officeArea / totalArea) * costs
  }

  // ── Travel deduction ─────────────────────────────────────────────────────────
  function calcTravelDeduction() {
    if (!answers.hasTravelLogbook) {
      return num(answers.travelAllowanceAnnual) * 0.20
    }
    const businessKm = num(answers.businessKm)
    return businessKm * 4.95
  }

  // ── Run full calculation ─────────────────────────────────────────────────────
  async function runCalculation() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Session expired. Please refresh.'); setLoading(false); return }

      const freelanceNet = answers.hasFreelance ? Math.max(0, num(answers.freelanceIncome)
        - num(answers.freelanceProfSubs) - num(answers.freelanceSoftware)
        - num(answers.freelancePhone) - num(answers.freelanceTravel)
        - num(answers.freelanceTraining) - num(answers.freelanceInsurance)
        - num(answers.freelanceAccountant)) : 0

      const payload = {
        taxYear: answers.taxYear,
        age: num(answers.age),
        grossSalary: num(answers.grossSalary),
        travelAllowanceAnnual: answers.travelAllowanceAnnual ? num(answers.travelAllowanceAnnual) * 0.8 : 0,
        travelDeduction: answers.hasTravelLogbook ? calcTravelDeduction() : 0,
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
    } catch (e) {
      setError('Could not complete calculation. Please check your inputs and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── AI suggestions ───────────────────────────────────────────────────────────
  async function fetchAiSuggestions(type) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const rentalAnswers = {
        bondInterest: num(answers.rentalBondInterest),
        rates: num(answers.rentalRates),
        agentFees: num(answers.rentalAgentFees),
        insurance: num(answers.rentalInsurance),
        repairs: num(answers.rentalRepairs),
        garden: num(answers.rentalGarden),
        security: num(answers.rentalSecurity),
        advertising: num(answers.rentalAdvertising),
        levies: num(answers.rentalLevies),
      }
      const freelanceAnswers = {
        profSubscriptions: num(answers.freelanceProfSubs),
        software: num(answers.freelanceSoftware),
        phone: num(answers.freelancePhone),
        travel: num(answers.freelanceTravel),
        training: num(answers.freelanceTraining),
        insurance: num(answers.freelanceInsurance),
        accountant: num(answers.freelanceAccountant),
      }

      const res = await fetch('/.netlify/functions/tax-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          incomeType: type,
          answers: type === 'rental' ? rentalAnswers : freelanceAnswers,
        }),
      })
      const data = await res.json()
      if (data.suggestion) {
        setAiSuggestions(prev => ({ ...prev, [type]: data.suggestion }))
      }
    } catch (e) {
      // silent — suggestions are optional
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────────
  const Field = ({ label, note, children }) => (
    <div className="te-field">
      <label className="te-label">{label}</label>
      {note && <p className="te-note">{note}</p>}
      {children}
    </div>
  )

  const MoneyInput = ({ value, onChange, placeholder = '0' }) => (
    <div className="te-money-wrap">
      <span className="te-currency">R</span>
      <input
        type="number" min="0" step="100"
        className="te-input te-input--money"
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )

  // ── Step renderers ───────────────────────────────────────────────────────────

  const StepYear = () => (
    <div className="te-step">
      <h2 className="te-step-title">Which tax year are you estimating?</h2>
      <p className="te-step-sub">Select the period you want to assess. Most people filing right now are completing their 2026 return.</p>
      <div className="te-year-cards">
        {Object.entries(TAX_YEAR_LABELS).map(([yr, label]) => (
          <button
            key={yr}
            className={`te-year-card ${answers.taxYear === yr ? 'active' : ''}`}
            onClick={() => set('taxYear', yr)}
          >
            <span className="te-year-num">{yr}</span>
            <span className="te-year-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const StepBasics = () => (
    <div className="te-step">
      <h2 className="te-step-title">A bit about you</h2>
      <Field label="Your age" note="This determines which rebates and exemptions apply.">
        <input
          type="number" min="18" max="100"
          className="te-input"
          value={answers.age}
          onChange={e => set('age', e.target.value)}
          placeholder="e.g. 34"
        />
      </Field>
    </div>
  )

  const StepIncome = () => (
    <div className="te-step">
      <h2 className="te-step-title">Your income sources</h2>
      <p className="te-step-sub">Enter your gross (before tax) amounts for the full tax year.</p>

      <Field label="Gross employment salary" note="Total salary before any deductions. Check your IRP5 — look for 'remuneration' or the gross amount.">
        <MoneyInput value={answers.grossSalary} onChange={v => set('grossSalary', v)} placeholder="e.g. 480000" />
      </Field>

      <Field label="Travel allowance from employer (annual)" note="Only if your employer pays you a separate travel allowance. Leave blank if travel costs are reimbursed at the end of the month.">
        <MoneyInput value={answers.travelAllowanceAnnual} onChange={v => set('travelAllowanceAnnual', v)} placeholder="0" />
      </Field>

      {num(answers.travelAllowanceAnnual) > 0 && (
        <Field label="Did you keep a logbook?" note="A logbook lets you claim actual business kilometres. Without one, 80% of the allowance is taxable.">
          <div className="te-radio-group">
            <button className={`te-radio ${answers.hasTravelLogbook ? 'active' : ''}`} onClick={() => set('hasTravelLogbook', true)}>Yes, I kept a logbook</button>
            <button className={`te-radio ${!answers.hasTravelLogbook ? 'active' : ''}`} onClick={() => set('hasTravelLogbook', false)}>No logbook</button>
          </div>
          {answers.hasTravelLogbook && (
            <div style={{ marginTop: 12 }}>
              <label className="te-label">Business kilometres driven</label>
              <input type="number" min="0" className="te-input" value={answers.businessKm} onChange={e => set('businessKm', e.target.value)} placeholder="e.g. 8000" />
              <p className="te-note">We will use the SARS safe-harbour rate of R4.95/km to calculate your deduction.</p>
            </div>
          )}
        </Field>
      )}

      <Field label="Interest income (annual)" note="Interest earned on savings accounts, fixed deposits, money market funds. Your bank will have sent you an IT3(b) certificate.">
        <MoneyInput value={answers.interestIncome} onChange={v => set('interestIncome', v)} placeholder="0" />
      </Field>

      <div className="te-divider" />
      <p className="te-step-sub" style={{ fontWeight: 600 }}>Other income sources</p>

      <div className="te-checkbox-group">
        <label className="te-checkbox">
          <input type="checkbox" checked={answers.hasRental} onChange={e => set('hasRental', e.target.checked)} />
          <span>I earn rental income from a property</span>
        </label>
        <label className="te-checkbox">
          <input type="checkbox" checked={answers.hasFreelance} onChange={e => set('hasFreelance', e.target.checked)} />
          <span>I earn freelance or consulting income</span>
        </label>
      </div>
    </div>
  )

  const StepPaye = () => (
    <div className="te-step">
      <h2 className="te-step-title">PAYE already deducted</h2>
      <p className="te-step-sub">This is the tax your employer has already paid to SARS on your behalf. It is deducted from what you owe (or added to your refund).</p>
      <Field label="Total PAYE deducted this tax year" note="Find this on your IRP5 certificate or your last payslip of the tax year. Look for 'PAYE' or 'employees tax'.">
        <MoneyInput value={answers.payePaid} onChange={v => set('payePaid', v)} placeholder="e.g. 68000" />
      </Field>
      <p className="te-hint">Tip: If you are not sure, check your last payslip for the year and look at the cumulative PAYE column. Or ask your payroll department for your tax certificate.</p>
    </div>
  )

  const StepRA = () => (
    <div className="te-step">
      <h2 className="te-step-title">Retirement annuity contributions</h2>
      <p className="te-step-sub">Contributions to an RA outside of your employer's pension or provident fund are tax deductible, up to 27.5% of your income (capped at R{answers.taxYear === '2027' ? '430 000' : '350 000'}).</p>

      <Field label="Do you contribute to a private RA?">
        <div className="te-radio-group">
          <button className={`te-radio ${answers.hasRA ? 'active' : ''}`} onClick={() => set('hasRA', true)}>Yes</button>
          <button className={`te-radio ${!answers.hasRA ? 'active' : ''}`} onClick={() => set('hasRA', false)}>No</button>
        </div>
      </Field>

      {answers.hasRA && (
        <Field label="Monthly RA contribution" note="Your monthly debit order or contribution amount. Do not include employer contributions.">
          <MoneyInput value={answers.raMonthly} onChange={v => set('raMonthly', v)} placeholder="e.g. 3000" />
        </Field>
      )}
    </div>
  )

  const StepMedical = () => (
    <div className="te-step">
      <h2 className="te-step-title">Medical aid</h2>

      <Field label="Are you on a medical aid scheme?">
        <div className="te-radio-group">
          <button className={`te-radio ${answers.hasMedicalAid ? 'active' : ''}`} onClick={() => set('hasMedicalAid', true)}>Yes</button>
          <button className={`te-radio ${!answers.hasMedicalAid ? 'active' : ''}`} onClick={() => set('hasMedicalAid', false)}>No</button>
        </div>
      </Field>

      {answers.hasMedicalAid && (<>
        <Field label="Total people covered (including yourself)" note="Count yourself plus any dependants on your plan. E.g. you + spouse + 2 children = 4.">
          <input type="number" min="1" max="10" className="te-input te-input--small" value={answers.medicalAidMembers} onChange={e => set('medicalAidMembers', e.target.value)} />
        </Field>

        <Field label="Your monthly contribution to medical aid" note="The total amount you personally pay each month, including dependant premiums.">
          <MoneyInput value={answers.medicalAidMonthly} onChange={v => set('medicalAidMonthly', v)} placeholder="e.g. 4500" />
        </Field>

        <Field label="Qualifying out-of-pocket medical expenses (annual)" note="Co-payments, approved medicines, dentist, optometrist, specialist visits not covered by your plan. Keep your receipts.">
          <MoneyInput value={answers.medicalOOP} onChange={v => set('medicalOOP', v)} placeholder="0" />
        </Field>

        <Field label="Do you, your spouse, or a dependant have a disability confirmed by a doctor?">
          <div className="te-radio-group">
            <button className={`te-radio ${answers.hasDisability ? 'active' : ''}`} onClick={() => set('hasDisability', true)}>Yes</button>
            <button className={`te-radio ${!answers.hasDisability ? 'active' : ''}`} onClick={() => set('hasDisability', false)}>No</button>
          </div>
          {answers.hasDisability && <p className="te-note" style={{ marginTop: 8 }}>A higher credit rate of 33.3% applies, and the 7.5% income floor is waived. The disability must be confirmed by a registered medical practitioner on an ITR-DD form.</p>}
        </Field>
      </>)}
    </div>
  )

  const StepDeductions = () => (
    <div className="te-step">
      <h2 className="te-step-title">Other deductions</h2>

      <Field label="Home office" note="Only if you have a room used EXCLUSIVELY and REGULARLY for work, specifically equipped as an office. Note: bond/mortgage interest is not deductible for employees from 2023 onwards.">
        <div className="te-home-office-fields">
          <div className="te-inline-fields">
            <div>
              <label className="te-label">Office area (m²)</label>
              <input type="number" min="0" className="te-input te-input--small" value={answers.homeOfficeArea} onChange={e => set('homeOfficeArea', e.target.value)} placeholder="e.g. 18" />
            </div>
            <div>
              <label className="te-label">Total home area (m²)</label>
              <input type="number" min="0" className="te-input te-input--small" value={answers.totalHomeArea} onChange={e => set('totalHomeArea', e.target.value)} placeholder="e.g. 200" />
            </div>
          </div>
          {answers.homeOfficeArea && answers.totalHomeArea && (
            <Field label="Annual costs (rent or rates, electricity, cleaning, repairs)" note="Total of all home-running costs you want to apportion. We will apply the m² ratio for you. Do NOT include bond interest or improvements.">
              <MoneyInput value={answers.homeOfficeCosts} onChange={v => set('homeOfficeCosts', v)} placeholder="e.g. 48000" />
            </Field>
          )}
          {answers.homeOfficeArea && answers.totalHomeArea && answers.homeOfficeCosts && (
            <p className="te-calc-preview">
              Estimated deduction: {fmt(calcHomeOffice())} ({((num(answers.homeOfficeArea) / num(answers.totalHomeArea)) * 100).toFixed(1)}% of R{Math.round(num(answers.homeOfficeCosts)).toLocaleString('en-ZA')})
            </p>
          )}
        </div>
      </Field>

      <Field label="Donations to registered charities (Section 18A)" note="Only donations to organisations with SARS-approved Section 18A status, and you need a receipt. Deductible up to 10% of taxable income.">
        <MoneyInput value={answers.donationsAmount} onChange={v => set('donationsAmount', v)} placeholder="0" />
      </Field>
    </div>
  )

  const StepRental = () => (
    <div className="te-step">
      <h2 className="te-step-title">Rental property</h2>
      <p className="te-step-sub">Enter annual figures (for the full tax year). If you only let part of the property or for part of the year, we will help you apportion.</p>

      <Field label="Total rental income received">
        <MoneyInput value={answers.rentalIncome} onChange={v => set('rentalIncome', v)} placeholder="e.g. 96000" />
      </Field>

      <div className="te-section-label">Deductible expenses</div>

      <div className="te-expense-grid">
        {[
          { key: 'rentalBondInterest', label: 'Bond interest', note: 'Interest portion only, not capital repayment. Get this from your bond statement.' },
          { key: 'rentalRates', label: 'Municipal rates and taxes', note: null },
          { key: 'rentalAgentFees', label: 'Estate agent / management fees', note: null },
          { key: 'rentalInsurance', label: 'Homeowners insurance', note: 'Building insurance only, not contents.' },
          { key: 'rentalRepairs', label: 'Repairs and maintenance', note: 'Restoring something broken, not improving it. Improvements are not deductible.' },
          { key: 'rentalGarden', label: 'Garden services', note: null },
          { key: 'rentalSecurity', label: 'Security costs', note: null },
          { key: 'rentalAdvertising', label: 'Tenant advertising', note: null },
          { key: 'rentalLevies', label: 'Body corporate / sectional title levies', note: null },
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
          <p className="te-note">If you let the full property, enter 100. If only a room, enter the percentage of floor area.</p>
          <div className="te-money-wrap">
            <input type="number" min="1" max="100" className="te-input te-input--small" value={answers.rentalLetPercent} onChange={e => set('rentalLetPercent', e.target.value)} />
            <span className="te-currency" style={{ left: 'auto', right: 8 }}>%</span>
          </div>
        </div>
        <div>
          <label className="te-label">Months let this year</label>
          <input type="number" min="1" max="12" className="te-input te-input--small" value={answers.rentalMonths} onChange={e => set('rentalMonths', e.target.value)} />
        </div>
      </div>

      {answers.rentalIncome && (
        <div className="te-calc-preview">
          Net rental {calcRentalNet() >= 0 ? 'income' : 'loss'}: {fmt(Math.abs(calcRentalNet()))}
          {calcRentalNet() < 0 && ' (loss may be set off against other income, subject to ring-fencing rules)'}
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

  const StepFreelance = () => (
    <div className="te-step">
      <h2 className="te-step-title">Freelance / consulting income</h2>
      <p className="te-step-sub">Enter annual figures. Deductible expenses are costs incurred to earn this income.</p>

      <Field label="Total gross freelance income (invoiced)">
        <MoneyInput value={answers.freelanceIncome} onChange={v => set('freelanceIncome', v)} placeholder="e.g. 120000" />
      </Field>

      <div className="te-section-label">Deductible business expenses</div>
      <div className="te-expense-grid">
        {[
          { key: 'freelanceProfSubs', label: 'Professional body memberships', note: null },
          { key: 'freelanceSoftware', label: 'Business software subscriptions', note: 'Accounting software, project tools, design tools, etc.' },
          { key: 'freelancePhone', label: 'Business proportion of phone and data', note: 'If your phone is used 50% for work, claim 50% of your annual bill.' },
          { key: 'freelanceTravel', label: 'Business travel', note: 'Client visits, business-related travel. Not daily commuting.' },
          { key: 'freelanceTraining', label: 'Professional development and training', note: 'Courses, books, conferences directly relevant to your work.' },
          { key: 'freelanceInsurance', label: 'Professional indemnity insurance', note: null },
          { key: 'freelanceAccountant', label: 'Accountant or tax practitioner fees', note: 'For work related to your freelance income.' },
        ].map(({ key, label, note }) => (
          <div key={key} className="te-expense-item">
            <label className="te-label">{label}</label>
            {note && <p className="te-note">{note}</p>}
            <MoneyInput value={answers[key]} onChange={v => set(key, v)} placeholder="0" />
          </div>
        ))}
      </div>

      {answers.freelanceIncome && (
        <div className="te-calc-preview">
          Net freelance income: {fmt(Math.max(0, num(answers.freelanceIncome)
            - num(answers.freelanceProfSubs) - num(answers.freelanceSoftware)
            - num(answers.freelancePhone) - num(answers.freelanceTravel)
            - num(answers.freelanceTraining) - num(answers.freelanceInsurance)
            - num(answers.freelanceAccountant)))}
        </div>
      )}

      {aiSuggestions.freelance && (
        <div className="te-ai-suggestion">
          <span className="te-ai-label">bump. suggestion</span>
          <p>{aiSuggestions.freelance}</p>
        </div>
      )}
    </div>
  )

  // ── Results ──────────────────────────────────────────────────────────────────
  const StepResults = () => {
    if (!result) return <div className="te-loading">Calculating...</div>
    const r = result
    const refundAmt = Math.abs(r.result)
    const isRefund = r.isRefund
    const taxYearLabel = r.taxYear === '2027' ? '1 Mar 2026 – 28 Feb 2027' : '1 Mar 2025 – 28 Feb 2026'

    return (
      <div className="te-step te-results">
        <div className={`te-result-hero ${isRefund ? 'refund' : 'owing'}`}>
          <span className="te-result-label">{isRefund ? 'Estimated refund' : 'Estimated amount owing'}</span>
          <span className="te-result-amount">{fmt(refundAmt)}</span>
          <span className="te-result-sub">
            {isRefund
              ? 'SARS owes you this amount, which you can expect when your assessment is finalised.'
              : 'You owe this to SARS. This should be paid when you submit your return.'}
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
            <Row
              label={isRefund ? 'Refund due' : 'Amount owing'}
              amount={refundAmt}
              bold
              highlight={isRefund ? 'green' : 'red'}
            />
          </div>
        </div>

        <div className="te-meta-row">
          <span>Effective tax rate: <strong>{r.effectiveRate}%</strong></span>
          <span>Marginal rate: <strong>{r.marginalRate}%</strong></span>
        </div>

        {r.isProvisionalTaxpayer && (
          <div className="te-flag provisional">
            <strong>Provisional taxpayer notice:</strong> Because you have rental or freelance income, you are likely a provisional taxpayer. You must submit provisional tax returns twice a year: by 31 August ({r.taxYear === '2027' ? '2026' : '2025'}) and by the last day of February ({r.taxYear === '2027' ? '2027' : '2026'}). Contact a tax practitioner to make sure you are registered.
          </div>
        )}

        <div className="te-disclaimer">
          This is a planning estimate only, not a formal tax assessment. Figures are approximate and based on the information you provided. Actual SARS assessments may differ. bump. is not a registered tax practitioner. Please consult a qualified tax practitioner before submitting your return to SARS.
        </div>

        <div className="te-actions">
          <a href="https://efiling.sars.gov.za" target="_blank" rel="noopener noreferrer" className="te-btn-efiling">
            Go to SARS eFiling
          </a>
          <button className="te-btn-restart" onClick={() => { setAnswers({ ...INITIAL }); setResult(null); setStepIdx(0); setAiSuggestions({}) }}>
            Start again
          </button>
        </div>
      </div>
    )
  }

  const Row = ({ label, amount, bold, negative, highlight }) => (
    <div className={`te-row ${bold ? 'bold' : ''} ${highlight ? `highlight-${highlight}` : ''}`}>
      <span>{label}</span>
      <span className={negative ? 'te-neg' : ''}>{negative ? '- ' : ''}{fmt(amount)}</span>
    </div>
  )

  // ── Main render ──────────────────────────────────────────────────────────────
  const stepMap = {
    year: <StepYear />,
    basics: <StepBasics />,
    income: <StepIncome />,
    paye: <StepPaye />,
    ra: <StepRA />,
    medical: <StepMedical />,
    deductions: <StepDeductions />,
    rental: <StepRental />,
    freelance: <StepFreelance />,
    results: <StepResults />,
  }

  return (
    <div className="te-wrap">
      <div className="te-banner-disclaimer">
        <span className="te-banner-icon">&#9432;</span>
        <span>Estimate only — not a tax return. Consult a registered tax practitioner before filing. <button className="te-banner-more" onClick={() => alert(TAX_DISCLAIMER)}>Full disclaimer</button></span>
      </div>
      <div className="te-header">
        <div className="te-progress-bar"><div className="te-progress-fill" style={{ width: `${progress}%` }} /></div>
        <div className="te-step-count">Step {stepIdx + 1} of {steps.length}</div>
      </div>

      <div className="te-body">
        {stepMap[currentStep]}
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
