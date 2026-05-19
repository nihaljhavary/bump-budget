import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchRecentMonths } from '../services/transactions'
import { buildLedgerSummary } from '../utils/ledger'
import { detectRecurring } from '../utils/recurring'
import { computeBaselineProjection } from '../utils/projection'
import './Recommendations.css'
import Projections from './Projections'
import { useTier } from '../context/TierContext'
import LockedFeature from './LockedFeature'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

// Persists indefinitely -- no expiry. Planning answers are a living financial profile.
const LS_KEY = uid => `bump_rec_v2_${uid}`

const QUESTIONS = [
  {
    id: 'income',
    label: 'What is your monthly take-home income?',
    hint: 'After tax, into your bank account',
    type: 'number',
    prefix: 'R',
    placeholder: '25000',
  },
  {
    id: 'savingsGoal',
    label: 'How much do you want to save per month?',
    hint: "Your target, even if you're not hitting it yet",
    type: 'number',
    prefix: 'R',
    placeholder: '3000',
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
    ],
  },
  {
    id: 'stress',
    label: 'What is your biggest financial stress?',
    hint: 'Be honest -- this helps us prioritise',
    type: 'select',
    options: [
      'I spend more than I earn',
      'I have no savings',
      'Debt repayments eat my income',
      'Unexpected expenses wipe me out',
      "I don't know where my money goes",
      'My income is irregular',
      'Rising cost of living',
    ],
  },
  {
    id: 'ownProperty',
    label: 'Do you own property or pay a bond?',
    type: 'select',
    options: ['No, I rent', 'Yes, I pay a bond', 'I live rent-free', "I'm saving for a deposit"],
  },
  {
    id: 'dependants',
    label: 'Do you have financial dependants?',
    hint: 'Children, parents, siblings, etc.',
    type: 'select',
    options: ['No', 'Yes, 1 person', 'Yes, 2-3 people', 'Yes, 4+ people'],
  },
  {
    id: 'emergencyFund',
    label: 'Do you have an emergency fund (3+ months of expenses)?',
    type: 'select',
    options: ['No, not at all', 'I have 1 month', 'I have 2 months', 'Yes, 3+ months ✓'],
  },
]

function loadSaved(uid) {
  try {
    const raw = localStorage.getItem(LS_KEY(uid))
    if (!raw) return null
    // No age check -- planning answers persist indefinitely.
    // Legacy records have `savedAt`; new records have `answersUpdatedAt` + `analysisRunAt`.
    return JSON.parse(raw)
  } catch { return null }
}

// opts.answersUpdatedAt -- when the user last edited their goals (preserved across re-analyses)
// opts.analysisRunAt    -- when the AI analysis was last run (updated every run)
function persist(uid, answers, result, opts = {}) {
  try {
    const existing = loadSaved(uid) || {}
    localStorage.setItem(LS_KEY(uid), JSON.stringify({
      answers,
      result,
      answersUpdatedAt: opts.answersUpdatedAt ?? existing.answersUpdatedAt ?? existing.savedAt ?? Date.now(),
      analysisRunAt:    opts.analysisRunAt    ?? Date.now(),
    }))
  } catch {}
}

function clearSaved(uid) {
  try { localStorage.removeItem(LS_KEY(uid)) } catch {}
}

export default function Recommendations({ onImportSignal = 0 }) {
  const { user, profile } = useAuth()

  const [step, setStep]           = useState('intro')
  const [qIndex, setQIndex]       = useState(0)
  const [answers, setAnswers]     = useState({})
  const [currentVal, setCurrentVal] = useState('')
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState('')
  const [spendingData, setSpendingData] = useState(null)
  const [budgets, setBudgets]     = useState({})
  const [analysisDate, setAnalysisDate] = useState(null)   // when AI last ran
  const [goalsDate, setGoalsDate]       = useState(null)   // when user last edited goals
  const [dataLoaded, setDataLoaded] = useState(false)
  const [monthCount, setMonthCount] = useState(1)
  const [recurringMonthly, setRecurringMonthly] = useState(0)
  const [fixedMonthly, setFixedMonthly] = useState(0)
  const [categoryTrends, setCategoryTrends] = useState({})
  const [showProjections, setShowProjections] = useState(false)
  const [needsReanalysis, setNeedsReanalysis] = useState(false)
  // hydrated: true once Supabase profile has been checked. Fast-path: true if LS already has a result.
  const [hydrated, setHydrated] = useState(() => {
    try {
      if (!user?.id) return false
      const raw = localStorage.getItem(LS_KEY(user.id))
      if (!raw) return false
      return !!(JSON.parse(raw)?.result)
    } catch { return false }
  })
  const { canProjections } = useTier()

  // Ref so import-signal effect can check result without adding it to deps
  const resultRef = useRef(result)
  useEffect(() => { resultRef.current = result }, [result])

  // Only re-fetch when the user ID or net income changes -- not on every profile mutation
  // (billing date webhook updates, etc. must not blow away spending data)
  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [txns, { data: budgetRows }] = await Promise.all([
        fetchRecentMonths(user.id, 12),
        supabase.from('budgets').select('category, amount').eq('user_id', user.id),
      ])
      const ledger = buildLedgerSummary(txns || [], profile, { preferDeclared: false, dedup: true })
      const resolvedMonthCount = Math.max(ledger.monthCount, 1)
      setMonthCount(resolvedMonthCount)

      const recurring = detectRecurring(txns || [])
      const obligationTotal = recurring
        .filter(r => r.isObligation)
        .reduce((sum, r) => sum + r.medianAmount, 0)
      if (obligationTotal > 0) setRecurringMonthly(obligationTotal)

      // Track fixed monthly for projection context
      const FIXED_CATS = new Set(['Housing','Insurance','Utilities','Fees & Charges'])
      const fixedSpend = Object.entries(ledger.catTotals)
        .filter(([cat]) => FIXED_CATS.has(cat))
        .reduce((sum, [, v]) => sum + v, 0)
      setFixedMonthly(Math.round(fixedSpend / resolvedMonthCount))

      const avg = {}
      for (const [cat, total] of Object.entries(ledger.catTotals)) {
        avg[cat] = total / resolvedMonthCount
      }
      setSpendingData(avg)

      const bMap = {}
      for (const b of (budgetRows || [])) bMap[b.category] = b.amount
      setBudgets(bMap)
      setDataLoaded(true)

      // -- Compute per-category trends for coaching memory --
      // Shape: { category: { recent, avg, deltaVsAvg, months } }
      const catMonthly = {}
      for (const t of (txns || [])) {
        if (t.category === 'Income' || t.category === 'Transfer' || t.category === 'Savings') continue
        const month = t.date?.slice(0, 7)
        if (!month) continue
        if (!catMonthly[month]) catMonthly[month] = {}
        catMonthly[month][t.category] = (catMonthly[month][t.category] || 0) + (t.amount || 0)
      }
      const trendMonths = Object.keys(catMonthly).sort()
      if (trendMonths.length >= 2) {
        const allCats = new Set(trendMonths.flatMap(m => Object.keys(catMonthly[m] || {})))
        const computed = {}
        for (const cat of allCats) {
          const values = trendMonths.map(m => catMonthly[m]?.[cat] || 0)
          const avg = values.reduce((s, v) => s + v, 0) / values.length
          if (avg < 100) continue  // skip trivially small categories
          const recent = values[values.length - 1]
          const deltaVsAvg = avg > 0 ? Math.round((recent - avg) / avg * 100) : 0
          computed[cat] = { recent: Math.round(recent), avg: Math.round(avg), deltaVsAvg, months: trendMonths.length }
        }
        setCategoryTrends(computed)
      }
    } catch (e) {
      console.error('Failed to load spending data', e)
    }
  }, [user?.id, profile?.net_income])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  // New import: refresh spending data. If user already has results, flag for re-analysis.
  useEffect(() => {
    if (onImportSignal > 0) {
      loadData()
      if (resultRef.current != null) {
        setNeedsReanalysis(true)
      }
    }
  }, [onImportSignal, loadData])

  // Restore saved state from localStorage on mount (fast, before profile loads).
  // Depends on user?.id only so profile mutations (billing webhooks etc.) don't re-run this.
  useEffect(() => {
    if (!user?.id) return
    const saved = loadSaved(user.id)
    if (!saved?.result) return  // guard: only restore if result is present
    setAnswers(saved.answers || {})
    setResult(saved.result)
    setStep('results')
    // Support both new (analysisRunAt) and legacy (savedAt) records
    const aDate = saved.analysisRunAt || saved.savedAt
    if (aDate) setAnalysisDate(new Date(aDate))
    const gDate = saved.answersUpdatedAt || saved.savedAt
    if (gDate) setGoalsDate(new Date(gDate))
  }, [user?.id])

  // Supabase hydration -- fires when profile loads (authoritative cross-device sync).
  // Sets hydrated=true so UI knows it can gate correctly on planning_completed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user?.id || !profile) return
    const db = profile.planning_profile
    const lsData = loadSaved(user.id)
    const dbTs = db?.analysisRunAt || db?.savedAt || 0
    const lsTs = lsData?.analysisRunAt || lsData?.savedAt || 0

    if (dbTs > lsTs && db?.result) {
      // Supabase has newer data -- hydrate state and overwrite localStorage cache
      setAnswers(db.answers || {})
      setResult(db.result)
      setStep('results')
      const aDate = db.analysisRunAt || db.savedAt
      if (aDate) setAnalysisDate(new Date(aDate))
      const gDate = db.answersUpdatedAt || db.savedAt
      if (gDate) setGoalsDate(new Date(gDate))
      persist(user.id, db.answers, db.result, {
        answersUpdatedAt: db.answersUpdatedAt,
        analysisRunAt:    db.analysisRunAt || db.savedAt,
      })
    } else if (lsTs > dbTs && lsData?.result) {
      // localStorage has newer data -- silently push to Supabase (new-column bootstrap)
      ;(async () => {
        try {
          await supabase.from('profiles').upsert({
            id:                user.id,
            planning_completed: true,
            planning_profile: {
              answers:          lsData.answers,
              result:           lsData.result,
              answersUpdatedAt: lsData.answersUpdatedAt || lsTs,
              analysisRunAt:    lsData.analysisRunAt    || lsTs,
            },
          }, { onConflict: 'id' })
        } catch { /* best-effort bootstrap — never blocks hydration */ }
      })()
    }
    setHydrated(true)  // hydration complete
  }, [user?.id, profile?.planning_profile, profile?.planning_completed])  // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill income + savings goal from profile if not already set by user
  useEffect(() => {
    if (!profile) return
    setAnswers(prev => {
      const next = { ...prev }
      if (!next.income && profile.net_income)
        next.income = String(Math.round(profile.net_income / 100))
      if (!next.savingsGoal && profile.savings_goal)
        next.savingsGoal = String(Math.round(profile.savings_goal / 100))
      return next
    })
  }, [profile])

  // Deterministic projection context -- wired into get-recommendations for forward-looking advice
  const projectionContext = useMemo(() => {
    const netIncome = parseFloat(answers.income) || (profile?.net_income ? profile.net_income / 100 : 0)
    if (!netIncome || !spendingData) return null
    const VARIABLE_CATS = new Set(['Groceries','Eating out','Entertainment','Clothing','Health','Transport','Fuel','Other'])
    const varSpend = Object.entries(spendingData)
      .filter(([cat]) => VARIABLE_CATS.has(cat))
      .reduce((s, [, v]) => s + v, 0)
    const debitOrders = recurringMonthly || fixedMonthly || (profile?.monthly_debit_orders ? profile.monthly_debit_orders / 100 : 0)
    return computeBaselineProjection(netIncome, debitOrders, varSpend, 0)
  }, [answers.income, spendingData, recurringMonthly, fixedMonthly, profile])

  const currentQ = QUESTIONS[qIndex]

  function startQuiz() {
    setStep('quiz')
    setQIndex(0)
    setCurrentVal(answers[QUESTIONS[0].id] || '')
    setError('')
  }

  function handleNext() {
    if (!currentVal && currentVal !== 0) return
    const updatedAnswers = { ...answers, [currentQ.id]: currentVal }
    setAnswers(updatedAnswers)
    setCurrentVal('')
    if (qIndex < QUESTIONS.length - 1) {
      const nextQ = QUESTIONS[qIndex + 1]
      setQIndex(i => i + 1)
      setCurrentVal(updatedAnswers[nextQ.id] || '')
    } else {
      // Quiz completed -- answers are new/updated goals
      getRecommendations(updatedAnswers, { isNewGoals: true })
    }
  }

  function handleBack() {
    if (qIndex > 0) {
      const prevQ = QUESTIONS[qIndex - 1]
      setQIndex(i => i - 1)
      setCurrentVal(answers[prevQ.id] || '')
    } else {
      setStep('intro')
    }
  }

  // isNewGoals: true  = user edited their goals via quiz (updates answersUpdatedAt)
  // isNewGoals: false = re-analysis with existing goals and fresh spending data (preserves answersUpdatedAt)
  async function getRecommendations(finalAnswers, { isNewGoals = false } = {}) {
    setStep('loading')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/get-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          answers: finalAnswers,
          spendingData,
          budgets,
          monthCount,
          recurringMonthly,
          projectionContext,
          // Continuity: pass trends + prior result when re-analysing
          categoryTrends: Object.keys(categoryTrends).length > 0 ? categoryTrends : undefined,
          priorResult:    result || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to get recommendations')

      const now = Date.now()
      const existing = loadSaved(user?.id)
      const answersUpdatedAt = isNewGoals
        ? now
        : (existing?.answersUpdatedAt ?? existing?.savedAt ?? now)

      setResult(d.result)
      setStep('results')
      setNeedsReanalysis(false)
      setAnalysisDate(new Date(now))
      if (isNewGoals) setGoalsDate(new Date(now))
      persist(user?.id, finalAnswers, d.result, { answersUpdatedAt, analysisRunAt: now })
      // Sync to Supabase: planning_completed is the canonical flag — saved even if content sync fails.
      try {
        const { error: syncErr } = await supabase.from('profiles').upsert({
          id:                 user.id,
          planning_completed: true,
          planning_profile: {
            answers:          finalAnswers,
            result:           d.result,
            answersUpdatedAt: answersUpdatedAt,
            analysisRunAt:    now,
          },
        }, { onConflict: 'id' })
        if (syncErr) console.warn('[rec] Supabase sync failed:', syncErr.message)
      } catch (syncErr) {
        console.warn('[rec] Supabase sync failed:', syncErr.message)
      }
    } catch (e) {
      console.error('[rec] getRecommendations failed:', e.message)
      setError('Analysis could not complete. Check your connection and try again.')
      setStep('quiz')
    }
  }

  // Re-run analysis with existing goals + freshest spending data.
  // Does NOT clear localStorage or reset goals -- only updates the result.
  function handleReAnalyze() {
    setResult(null)
    setNeedsReanalysis(false)
    loadData().then(() => {
      if (Object.keys(answers).length >= QUESTIONS.length) {
        getRecommendations(answers, { isNewGoals: false })
      } else {
        setStep('quiz')
        setQIndex(0)
        setCurrentVal(answers[QUESTIONS[0].id] || '')
      }
    })
  }

  // Edit goals = back to quiz while keeping existing answers as defaults.
  function handleEditGoals() {
    setStep('quiz')
    setQIndex(0)
    setCurrentVal(answers[QUESTIONS[0].id] || '')
    setError('')
  }

  // Start fresh = explicit destructive reset. Only callable by user action.
  function handleStartFresh() {
    clearSaved(user?.id)
    // Also clear Supabase so other devices see the reset
    if (user?.id) {
      ;(async () => {
        try {
          await supabase.from('profiles').upsert(
            { id: user.id, planning_profile: null, planning_completed: false },
            { onConflict: 'id' }
          )
        } catch { /* best-effort reset — never blocks UI */ }
      })()
    }
    setResult(null)
    setAnalysisDate(null)
    setGoalsDate(null)
    setNeedsReanalysis(false)
    setAnswers({
      ...(profile?.net_income   ? { income:      String(Math.round(profile.net_income / 100))   } : {}),
      ...(profile?.savings_goal ? { savingsGoal: String(Math.round(profile.savings_goal / 100)) } : {}),
    })
    setStep('intro')
  }

  // ── Hydration gate: prevents 'Start analysis' flashing on device B ───────────
  if (!hydrated) {
    return (
      <div className="rec-shell">
        <div className="rec-hydrating" aria-label="Restoring your plan" />
      </div>
    )
  }

  if (step === 'intro') {
    const totalSpend = spendingData ? Object.values(spendingData).reduce((a, b) => a + b, 0) : 0
    const hasSaved = result != null
    // planning_completed=true but no result content = sync failed on previous device
    const isRestoreFailed = !hasSaved && profile?.planning_completed === true
    return (
      <div className="rec-shell">
        <div className="rec-intro-card">
          <div className="rec-intro-icon">🧠</div>
          <h2 className="rec-intro-title">Smart Money Analysis</h2>
          <p className="rec-intro-sub">
            Answer 7 quick questions and bump. will analyse your actual spending to give you a personalised plan.
          </p>
          {totalSpend > 0 && (
            <div className="rec-data-badge">
              📊 Based on {fmt(totalSpend)}/mo avg spending across {Object.keys(spendingData).length} categories
            </div>
          )}
          {!dataLoaded && (
            <div className="rec-no-data">
              ℹ️ Import your bank statement first for the best recommendations. You can still get general advice without it.
            </div>
          )}
          {isRestoreFailed && (
            <div className="rec-restore-notice">
              Your previous analysis could not be restored on this device. Re-run the questions to get your plan back.
            </div>
          )}
          {hasSaved && analysisDate && (
            <div className="rec-saved-notice">
              You have results from {analysisDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}.{' '}
              <button className="rec-link-btn" onClick={() => setStep('results')}>View them</button> or start a new analysis below.
            </div>
          )}
          <button className="rec-start-btn" onClick={startQuiz}>
            {hasSaved ? 'Start new analysis →' : isRestoreFailed ? 'Re-run analysis →' : 'Start analysis →'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div className="rec-shell rec-loading-shell">
        <div className="rec-spinner" />
        <p className="rec-loading-text">bump. is analysing your finances…</p>
        <p className="rec-loading-sub">This takes a few seconds</p>
      </div>
    )
  }

  if (step === 'quiz') {
    const progress = (qIndex / QUESTIONS.length) * 100
    return (
      <div className="rec-shell">
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

  if (step === 'results' && result) {
    const scoreColor = result.healthScore >= 7 ? 'var(--success)' : result.healthScore >= 4 ? 'var(--amber)' : 'var(--coral)'

    // Show separate goal/analysis dates only when they differ by more than a minute
    const showSeparateDates = goalsDate && analysisDate &&
      Math.abs(goalsDate.getTime() - analysisDate.getTime()) > 60000

    return (
      <div className="rec-shell rec-results-shell">

        {needsReanalysis && (
          <div className="rec-reanalysis-banner">
            📊 New bank data imported —{' '}
            <button className="rec-link-btn" onClick={handleReAnalyze}>Refresh analysis</button>
            {' '}to update your recommendations.
          </div>
        )}

        <div className="rec-persistence-bar">
          <div className="rec-persistence-dates">
            {showSeparateDates ? (
              <>
                <span className="rec-saved-date">
                  Goals updated {goalsDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="rec-saved-date rec-saved-date--secondary">
                  Analysis {analysisDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            ) : analysisDate ? (
              <span className="rec-saved-date">
                Last analysed {analysisDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            ) : null}
          </div>
          <div className="rec-persistence-actions">
            <button className="rec-action-btn" onClick={handleReAnalyze}>↻ Re-analyze</button>
            <button className="rec-action-btn" onClick={handleEditGoals}>✎ Edit goals</button>
            <button className="rec-action-btn secondary" onClick={handleStartFresh}>Start fresh</button>
          </div>
        </div>

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

        {/* DCF Projections -- expandable section */}
        <div className="rec-section" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            className="rec-section-toggle"
            onClick={() => setShowProjections(v => !v)}
          >
            <span className="rec-section-toggle-title">Financial Projections</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
              {showProjections ? '▲ Hide' : '▼ Show'}
            </span>
          </button>
          {showProjections && (
            canProjections
              ? <div style={{ padding: '0 16px 16px' }}><Projections recurringMonthly={recurringMonthly} /></div>
              : <LockedFeature locked feature="projections" message="Projections are available on the Growth plan and above." />
          )}
        </div>
      </div>
    )
  }

  return null
}
