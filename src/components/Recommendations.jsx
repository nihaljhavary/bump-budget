import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchRecentMonths } from '../services/transactions'
import './Recommendations.css'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

const QUESTIONS = [
  {
    id: 'income',
    label: 'What is your monthly take-home income?',
    hint: 'After tax, into your bank account',
    type: 'number',
    prefix: 'R',
    placeholder: '25000'
  },
  {
    id: 'savingsGoal',
    label: 'How much do you want to save per month?',
    hint: 'Your target, even if you\'re not hitting it yet',
    type: 'number',
    prefix: 'R',
    placeholder: '3000'
  },
  {
    id: 'goal',
    label: 'What is your main financial goal right now?',
    hint: 'What are you working towards?',
    type: 'select',
    options: [
      'Build an emergency fund',
      'Pay off debt',
      'Save for a house deposit',
      'Save for a car',
      'Build long-term wealth / invest',
      'Go on holiday',
      'Start a business',
      'Just survive month-to-month',
    ]
  },
  {
    id: 'stress',
    label: 'What is your biggest financial stress?',
    hint: 'Be honest — this helps us prioritise',
    type: 'select',
    options: [
      'I spend more than I earn',
      'I have no savings',
      'Debt repayments eat my income',
      'Unexpected expenses wipe me out',
      'I don\'t know where my money goes',
      'My income is irregular',
      'Rising cost of living',
    ]
  },
  {
    id: 'ownProperty',
    label: 'Do you own property or pay a bond?',
    type: 'select',
    options: ['No, I rent', 'Yes, I pay a bond', 'I live rent-free', 'I\'m saving for a deposit']
  },
  {
    id: 'dependants',
    label: 'Do you have financial dependants?',
    hint: 'Children, parents, siblings, etc.',
    type: 'select',
    options: ['No', 'Yes, 1 person', 'Yes, 2–3 people', 'Yes, 4+ people']
  },
  {
    id: 'emergencyFund',
    label: 'Do you have an emergency fund (3+ months of expenses)?',
    type: 'select',
    options: ['No, not at all', 'I have 1 month', 'I have 2 months', 'Yes, 3+ months ✓']
  }
]

export default function Recommendations() {
  const { user } = useAuth()
  const [step, setStep] = useState('intro')   // 'intro' | 'quiz' | 'loading' | 'results'
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [currentVal, setCurrentVal] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [spendingData, setSpendingData] = useState(null)
  const [budgets, setBudgets] = useState({})

  // Load spending data and budgets
  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    try {
      const [txns, { data: budgetRows }] = await Promise.all([
        fetchRecentMonths(user.id, 3),
        supabase.from('budgets').select('category, amount').eq('user_id', user.id)
      ])

      // Average monthly spend per category (excluding income)
      const totals = {}
      for (const t of txns) {
        if (t.category === 'Income') continue
        totals[t.category] = (totals[t.category] || 0) + t.amount
      }
      // Divide by 3 for monthly average
      const avg = {}
      for (const [cat, total] of Object.entries(totals)) {
        avg[cat] = total / 3
      }
      setSpendingData(avg)

      // Budgets map
      const bMap = {}
      for (const b of (budgetRows || [])) bMap[b.category] = b.amount
      setBudgets(bMap)
    } catch (e) {
      console.error('Failed to load spending data', e)
    }
  }

  const currentQ = QUESTIONS[qIndex]

  function handleNext() {
    if (!currentVal && currentVal !== 0) return
    setAnswers(a => ({ ...a, [currentQ.id]: currentVal }))
    setCurrentVal('')
    if (qIndex < QUESTIONS.length - 1) {
      setQIndex(i => i + 1)
    } else {
      // All answered — get recommendations
      const finalAnswers = { ...answers, [currentQ.id]: currentVal }
      getRecommendations(finalAnswers)
    }
  }

  function handleBack() {
    if (qIndex > 0) {
      setQIndex(i => i - 1)
      setCurrentVal(answers[QUESTIONS[qIndex - 1].id] || '')
    } else {
      setStep('intro')
    }
  }

  async function getRecommendations(finalAnswers) {
    setStep('loading')
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/get-recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          answers: finalAnswers,
          spendingData,
          budgets
        })
      })

      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to get recommendations')
      setResult(d.result)
      setStep('results')
    } catch (e) {
      setError(e.message)
      setStep('quiz')
    }
  }

  // ── Intro screen ─────────────────────────────────────────────────────────
  if (step === 'intro') {
    const totalSpend = spendingData
      ? Object.values(spendingData).reduce((a, b) => a + b, 0)
      : 0

    return (
      <div className="rec-shell">
        <div className="rec-intro-card">
          <div className="rec-intro-icon">🧠</div>
          <h2 className="rec-intro-title">Smart Money Analysis</h2>
          <p className="rec-intro-sub">
            Answer 7 quick questions and bump. will analyse your actual spending
            to give you a personalised plan.
          </p>

          {totalSpend > 0 && (
            <div className="rec-data-badge">
              📊 Based on {fmt(totalSpend)}/mo avg spending across{' '}
              {Object.keys(spendingData).length} categories
            </div>
          )}

          {!spendingData && (
            <div className="rec-no-data">
              ℹ️ Import your bank statement first for the best recommendations.
              You can still get general advice without it.
            </div>
          )}

          <button className="rec-start-btn" onClick={() => { setStep('quiz'); setQIndex(0); setCurrentVal('') }}>
            Start analysis →
          </button>
        </div>
      </div>
    )
  }

  // ── Loading screen ───────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="rec-shell rec-loading-shell">
        <div className="rec-spinner" />
        <p className="rec-loading-text">bump. is analysing your finances…</p>
        <p className="rec-loading-sub">This takes a few seconds</p>
      </div>
    )
  }

  // ── Quiz screen ──────────────────────────────────────────────────────────
  if (step === 'quiz') {
    const progress = ((qIndex) / QUESTIONS.length) * 100

    return (
      <div className="rec-shell">
        {/* Progress bar */}
        <div className="rec-progress-track">
          <div className="rec-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="rec-q-card">
          <div className="rec-q-counter">{qIndex + 1} of {QUESTIONS.length}</div>
          <h3 className="rec-q-label">{currentQ.label}</h3>
          {currentQ.hint && <p className="rec-q-hint">{currentQ.hint}</p>}

          {error && <div className="rec-error">{error}</div>}

          {currentQ.type === 'number' && (
            <div className="rec-input-wrap">
              {currentQ.prefix && <span className="rec-input-prefix">{currentQ.prefix}</span>}
              <input
                className="rec-input"
                type="number"
                placeholder={currentQ.placeholder}
                value={currentVal}
                onChange={e => setCurrentVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
                autoFocus
              />
            </div>
          )}

          {currentQ.type === 'select' && (
            <div className="rec-options">
              {currentQ.options.map(opt => (
                <button
                  key={opt}
                  className={`rec-option ${currentVal === opt ? 'selected' : ''}`}
                  onClick={() => setCurrentVal(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          <div className="rec-q-actions">
            <button className="rec-back-btn" onClick={handleBack}>← Back</button>
            <button
              className="rec-next-btn"
              onClick={handleNext}
              disabled={!currentVal && currentVal !== 0}
            >
              {qIndex === QUESTIONS.length - 1 ? 'Get my plan →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Results screen ───────────────────────────────────────────────────────
  if (step === 'results' && result) {
    const scoreColor = result.healthScore >= 7 ? 'var(--success)' : result.healthScore >= 4 ? 'var(--amber)' : 'var(--coral)'

    return (
      <div className="rec-shell rec-results-shell">
        {/* Health score */}
        <div className="rec-score-card">
          <div className="rec-score-ring" style={{ '--score-color': scoreColor }}>
            <span className="rec-score-num">{result.healthScore}</span>
            <span className="rec-score-denom">/10</span>
          </div>
          <div className="rec-score-info">
            <div className="rec-score-label">{result.healthLabel}</div>
            <div className="rec-score-summary">{result.healthSummary}</div>
          </div>
        </div>

        {/* Key insights */}
        {result.insights?.length > 0 && (
          <div className="rec-section">
            <h3 className="rec-section-title">Key Insights</h3>
            <div className="rec-insights">
              {result.insights.map((ins, i) => (
                <div key={i} className={`rec-insight rec-insight-${ins.type}`}>
                  <div className="rec-insight-title">{ins.title}</div>
                  <div className="rec-insight-body">{ins.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Where to cut */}
        {result.cuts?.length > 0 && (
          <div className="rec-section">
            <h3 className="rec-section-title">Where to Cut</h3>
            <div className="rec-cuts">
              {result.cuts.map((cut, i) => (
                <div key={i} className="rec-cut-card">
                  <div className="rec-cut-head">
                    <span className="rec-cut-cat">{cut.category}</span>
                    <span className="rec-cut-saving">Save {fmt(cut.saving)}/mo</span>
                  </div>
                  <div className="rec-cut-amounts">
                    <div className="rec-cut-amt">
                      <span className="rec-cut-lbl">Current</span>
                      <span className="rec-cut-val red">{fmt(cut.currentAvg)}</span>
                    </div>
                    <div className="rec-cut-arrow">→</div>
                    <div className="rec-cut-amt">
                      <span className="rec-cut-lbl">Target</span>
                      <span className="rec-cut-val green">{fmt(cut.recommended)}</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="rec-cut-bar-track">
                    <div
                      className="rec-cut-bar-fill"
                      style={{ width: `${Math.min(100, (cut.recommended / cut.currentAvg) * 100)}%` }}
                    />
                  </div>
                  <div className="rec-cut-tip">💡 {cut.tip}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Savings plan */}
        {result.savingsPlan && (
          <div className="rec-section">
            <h3 className="rec-section-title">Your Savings Plan</h3>
            <div className="rec-savings-card">
              <div className="rec-savings-target">
                <span className="rec-savings-amt">{fmt(result.savingsPlan.monthlyTarget)}</span>
                <span className="rec-savings-lbl">/month to save</span>
              </div>
              <div className="rec-savings-meta">
                <div>⏱ {result.savingsPlan.timeToGoal}</div>
                <div>💰 {result.savingsPlan.fundedBy}</div>
              </div>
            </div>
          </div>
        )}

        {/* Quick win */}
        {result.quickWin && (
          <div className="rec-section">
            <div className="rec-quickwin">
              <div className="rec-quickwin-icon">⚡</div>
              <div>
                <div className="rec-quickwin-title">Quick Win This Month</div>
                <div className="rec-quickwin-body">{result.quickWin}</div>
              </div>
            </div>
          </div>
        )}

        <button className="rec-redo-btn" onClick={() => { setStep('intro'); setResult(null); setAnswers({}) }}>
          Run analysis again
        </button>
      </div>
    )
  }

  return null
}
