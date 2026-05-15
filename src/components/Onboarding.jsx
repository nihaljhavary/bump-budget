import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './Onboarding.css'

const BANKS = ['FNB', 'Nedbank', 'ABSA', 'Capitec', 'Standard Bank', 'Discovery Bank', 'TymeBank']
const VITALITY_OPTIONS = [0, 10, 20, 25, 35, 48, 75]
const STEPS = ['welcome', 'declaration', 'income', 'bank', 'done']

export default function Onboarding({ onComplete }) {
  const { user, refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    usage_type: 'personal',
    gross_income: '',
    net_income: '',
    monthly_debit_orders: '',
    savings_goal: '',
    bank: '',
    has_discovery_vitality: false,
    vitality_cashback_pct: 0,
  })

  function update(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function nextStep() {
    setError('')
    if (step === 1 && !form.usage_type) {
      setError('Please select how you will use bump.'); return
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
      const { error: err } = await supabase.from('profiles').upsert({
        id: user.id,
        usage_type: form.usage_type || 'personal',
        full_name: form.full_name || null,
        gross_income: toC(form.gross_income),
        net_income: toC(form.net_income),
        monthly_debit_orders: toC(form.monthly_debit_orders),
        savings_goal: toC(form.savings_goal),
        bank: form.bank || null,
        has_discovery_vitality: form.has_discovery_vitality,
        vitality_cashback_pct: form.has_discovery_vitality ? form.vitality_cashback_pct : 0,
        onboarding_complete: true,
      }, { onConflict: 'id' })
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

        {stepName === 'declaration' && (
          <div className="onboarding-step">
            <div className="ob-step-lbl">Usage type</div>
            <h2 className="ob-title">How will you<br />use bump.?</h2>
            <p className="ob-sub">bump. is built for personal finances. This helps us tailor your experience.</p>
            <div className="ob-fields">
              {[
                { value: 'personal', label: 'Personal', desc: 'Tracking my own income and spending' },
                { value: 'household', label: 'Household', desc: 'Managing a shared household budget' },
                { value: 'side_hustle', label: 'Side hustle', desc: 'A small side project alongside my main income' },
                { value: 'sole_prop', label: 'Sole proprietor', desc: 'Self-employed with personal and business mixed' },
              ].map(opt => (
                <div
                  key={opt.value}
                  className={`ob-usage-option ${form.usage_type === opt.value ? 'selected' : ''}`}
                  onClick={() => update('usage_type', opt.value)}
                >
                  <div className="ob-usage-label">{opt.label}</div>
                  <div className="ob-usage-desc">{opt.desc}</div>
                </div>
              ))}
            </div>
            <p className="ob-hint">bump. is for personal finance only. For full business accounting, tools like Xero or QuickBooks are a better fit.</p>
            {error && <div className="ob-error">{error}</div>}
            <button className="ob-btn-primary" onClick={nextStep}>Continue</button>
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
              <button className="ob-btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
              <button className="ob-btn-primary" onClick={nextStep}>Continue →</button>
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
                      <button key={pct} className={`ob-cashback-pill ${form.vitality_cashback_pct === pct ? 'selected' : ''}`}
                        onClick={() => update('vitality_cashback_pct', pct)}>{pct}%</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {error && <div className="ob-error">{error}</div>}
            <div className="ob-btn-row">
              <button className="ob-btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
              <button className="ob-btn-primary" onClick={nextStep}>Continue →</button>
            </div>
          </div>
        )}

        {stepName === 'done' && (
          <div className="onboarding-step ob-done">
            <div className="ob-done-icon">✦</div>
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
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={signOut} style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0,
        }}>
          Wrong account? Sign out
        </button>
      </div>
      </div>
    </div>
  )
}
