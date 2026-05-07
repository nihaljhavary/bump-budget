import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './Onboarding.css'

const BANKS = ['FNB', 'Nedbank', 'ABSA', 'Capitec', 'Standard Bank', 'Discovery Bank', 'TymeBank']
const VITALITY_OPTIONS = [0, 10, 20, 25, 35, 48, 75]
const STEPS = ['declaration', 'welcome', 'income', 'bank', 'done']

const USAGE_OPTIONS = [
  { value: 'personal',    label: 'Just me (personal finances)',         icon: '\u{1F64B}' },
  { value: 'household',   label: 'Me + my household',                   icon: '\u{1F3E1}' },
  { value: 'side_hustle', label: 'My side hustle / freelance work',     icon: '\u{1F4BC}' },
  { value: 'sole_prop',   label: 'My small business (sole proprietor)', icon: '\u{1F3EA}' },
]

export default function Onboarding({ onComplete }) {
  const { user, refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    usage_type: '',
    full_name: '',
    gross_income: '',
    net_income: '',
    monthly_debit_orders: '',
    savings_goal: '',
    bank: '',
    has_discovery_vitality: false,
    vitality_cashback_pct: 0,
  })

  function update(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  function nextStep() {
    setError('')
    if (step === 0 && !form.usage_type) {
      setError('Please select how you plan to use bump.'); return
    }
    if (step === 2 && (!form.gross_income || !form.net_income)) {
      setError('Please fill in your income details.'); return
    }
    if (step === 3 && !form.bank) {
      setError('Please select your bank.'); return
    }
    setStep(s => s + 1)
  }

  async function finish() {
    setSaving(true); setError('')
    try {
      const toC = v => v ? Math.round(parseFloat(v) * 100) : null
      const { error: err } = await supabase.from('profiles').update({
        usage_type: form.usage_type || null,
        full_name: form.full_name || null,
        gross_income: toC(form.gross_income),
        net_income: toC(form.net_income),
        monthly_debit_orders: toC(form.monthly_debit_orders),
        savings_goal: toC(form.savings_goal),
        bank: form.bank || null,
        has_discovery_vitality: form.has_discovery_vitality,
        vitality_cashback_pct: form.has_discovery_vitality ? form.vitality_cashback_pct : 0,
        onboarding_complete: true,
      }).eq('id', user.id)
      if (err) throw err
      await refreshProfile()
      onComplete()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const stepName = STEPS[step]

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {[0,1,2,3].map(i => (
            <div key={i} className={`ob-dot ${step > i ? 'done' : step === i ? 'active' : ''}`} />
          ))}
        </div>

        {stepName === 'declaration' && (
          <div className="onboarding-step">
            <div className="ob-logo">bump.</div>
            <h1 className="ob-title">Who is bump. for?</h1>
            <p className="ob-sub">bump. is built for personal and household finances. Select what fits you best.</p>
            <div className="ob-usage-grid">
              {USAGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`ob-usage-card ${form.usage_type === opt.value ? 'selected' : ''}`}
                  onClick={() => update('usage_type', opt.value)}
                >
                  <span className="ob-usage-icon">{opt.icon}</span>
                  <span className="ob-usage-label">{opt.label}</span>
                </button>
              ))}
            </div>
            {form.usage_type === 'sole_prop' && (
              <div className="ob-usage-warning">
                bump. is designed for personal and sole proprietor finances. For full company accounting, consider tools like Xero or QuickBooks — but you are welcome to continue for personal tracking.
              </div>
            )}
            {error && <div className="ob-error">{error}</div>}
            <div className="ob-not-for">
              <strong>bump. is not designed for:</strong> medium or large businesses, payroll management, or company accounting.
            </div>
            <button className="ob-btn-primary" onClick={nextStep}>Continue &rarr;</button>
          </div>
        )}

        {stepName === 'welcome' && (
          <div className="onboarding-step">
            <div className="ob-logo">bump.</div>
            <h1 className="ob-title">{"Let's set up your"}<br />{"bump. profile"}</h1>
            <p className="ob-sub">A few quick questions so bump. can give you advice that actually fits your life.</p>
            <div className="ob-field">
              <label className="ob-label">What should we call you?</label>
              <input className="ob-input" type="text" placeholder="Your name" value={form.full_name}
                onChange={e => update('full_name', e.target.value)} autoFocus />
            </div>
            <button className="ob-btn-primary" onClick={nextStep}>{"Let's go →"}</button>
          </div>
        )}

        {stepName === 'income' && (
          <div className="onboarding-step">
            <div className="ob-step-lbl">Income &amp; commitments</div>
            <h2 className="ob-title">Tell us about<br />your money</h2>
            <p className="ob-sub">bump. uses this to calculate your real free cash flow each month.</p>
            <div className="ob-fields">
              {[
                { label: 'Gross monthly salary', field: 'gross_income', required: true, hint: '' },
                { label: 'Net (take-home) salary', field: 'net_income', required: true, hint: '' },
                { label: 'Fixed monthly debit orders', field: 'monthly_debit_orders', required: false, hint: 'Rent, loans, insurance — anything that debits automatically' },
                { label: 'Monthly savings goal', field: 'savings_goal', required: false, hint: '' },
              ].map(({ label, field, required, hint }) => (
                <div key={field} className="ob-field">
                  <label className="ob-label">{label}{required && <span className="ob-req"> *</span>}</label>
                  {hint && <div className="ob-hint">{hint}</div>}
                  <div className="ob-input-wrap">
                    <span className="ob-prefix">R</span>
                    <input className="ob-input ob-input-pfx" type="number" placeholder="0"
                      value={form[field]} onChange={e => update(field, e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            {error && <div className="ob-error">{error}</div>}
            <div className="ob-btn-row">
              <button className="ob-btn-ghost" onClick={() => setStep(s => s - 1)}>&larr; Back</button>
              <button className="ob-btn-primary" onClick={nextStep}>Continue &rarr;</button>
            </div>
          </div>
        )}

        {stepName === 'bank' && (
          <div className="onboarding-step">
            <div className="ob-step-lbl">Banking</div>
            <h2 className="ob-title">Your bank<br />&amp; perks</h2>
            <p className="ob-sub">bump. can factor in rewards like Discovery Vitality cashback on groceries.</p>
            <div className="ob-fields">
              <div className="ob-field">
                <label className="ob-label">Which bank do you use? <span className="ob-req">*</span></label>
                <div className="ob-bank-grid">
                  {BANKS.map(b => (
                    <button key={b} className={`ob-bank-pill ${form.bank === b ? 'selected' : ''}`}
                      onClick={() => update('bank', b)}>{b}</button>
                  ))}
                </div>
              </div>
              <div className="ob-field">
                <label className="ob-label">Do you have Discovery Vitality?</label>
                <div className="ob-toggle-row">
                  <button className={`ob-toggle ${form.has_discovery_vitality ? 'on' : 'off'}`}
                    onClick={() => update('has_discovery_vitality', !form.has_discovery_vitality)}>
                    <span className="ob-toggle-thumb" />
                  </button>
                  <span className="ob-toggle-lbl">{form.has_discovery_vitality ? 'Yes, I have Vitality' : 'No'}</span>
                </div>
              </div>
              {form.has_discovery_vitality && (
                <div className="ob-field ob-field-anim">
                  <label className="ob-label">Healthy food cashback %?</label>
                  <div className="ob-hint">Check your Vitality status in the Discovery app</div>
                  <div className="ob-cashback-grid">
                    {VITALITY_OPTIONS.map(pct => (
                      <button key={pct}
                        className={`ob-cashback-pill ${form.vitality_cashback_pct === pct ? 'selected' : ''}`}
                        onClick={() => update('vitality_cashback_pct', pct)}>{pct}%</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {error && <div className="ob-error">{error}</div>}
            <div className="ob-btn-row">
              <button className="ob-btn-ghost" onClick={() => setStep(s => s - 1)}>&larr; Back</button>
              <button className="ob-btn-primary" onClick={nextStep}>Continue &rarr;</button>
            </div>
          </div>
        )}

        {stepName === 'done' && (
          <div className="onboarding-step ob-done">
            <div className="ob-done-icon">&#x2736;</div>
            <h2 className="ob-title">{"You're all set."}</h2>
            <p className="ob-sub ob-done-sub">{"Let's look at your money."}</p>
            {form.full_name && <p className="ob-done-name">Welcome, {form.full_name}.</p>}
            <div className="ob-summary">
              {form.net_income && <div className="ob-summary-row"><span>Take-home salary</span><span>R{parseFloat(form.net_income).toLocaleString('en-ZA')}/mo</span></div>}
              {form.monthly_debit_orders && <div className="ob-summary-row"><span>Fixed debit orders</span><span>R{parseFloat(form.monthly_debit_orders).toLocaleString('en-ZA')}/mo</span></div>}
              {form.savings_goal && <div className="ob-summary-row"><span>Savings goal</span><span>R{parseFloat(form.savings_goal).toLocaleString('en-ZA')}/mo</span></div>}
              {form.bank && <div className="ob-summary-row"><span>Bank</span><span>{form.bank}</span></div>}
              {form.has_discovery_vitality && form.vitality_cashback_pct > 0 && (
                <div className="ob-summary-row"><span>Vitality cashback</span><span>{form.vitality_cashback_pct}%</span></div>
              )}
            </div>
            {error && <div className="ob-error">{error}</div>}
            <button className="ob-btn-primary ob-btn-lg" onClick={finish} disabled={saving}>
              {saving ? 'Saving…' : 'Go to my dashboard →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
