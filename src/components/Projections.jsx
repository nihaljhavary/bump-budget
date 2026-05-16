import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchTransactionsByRange } from '../services/transactions'
import { buildLedgerSummary, countCalendarMonths, formatLocalDate, validateProjectionInputs } from '../utils/ledger'
import { useTier, isDateAllowed } from '../context/TierContext'
import './Projections.css'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const fmtK = n => {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-R' : 'R'
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + 'm'
  if (abs >= 1000) return sign + Math.round(abs / 1000) + 'k'
  return sign + Math.round(abs)
}

function getMonthLabel(monthsFromNow) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthsFromNow)
  return d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })
}

// ---------------------------------------------------------------------------
// Deterministic year-by-year financial engine.
// No AI involved -- pure arithmetic on user-supplied assumptions.
// All inputs in rands; outputs in rands.
// ---------------------------------------------------------------------------
function buildYearModel({ netIncomeMonthly, fixedMonthly, variableMonthly,
  startingSavings, assumptions, events, varReduction = 1.0, horizonYears = 10 }) {
  const startYear = new Date().getFullYear()
  const { salaryGrowth, inflation, investmentReturn } = assumptions
  let balance = startingSavings
  const rows = []

  for (let i = 0; i < horizonYears; i++) {
    const year = startYear + i
    const gf  = Math.pow(1 + salaryGrowth  / 100, i)
    const inf = Math.pow(1 + inflation     / 100, i)

    const annualIncome   = Math.round(netIncomeMonthly  * 12 * gf)
    const annualFixed    = Math.round(fixedMonthly      * 12 * inf)
    const annualVariable = Math.round(variableMonthly   * 12 * inf * varReduction)

    // Events for this year
    const yearEvents = (events || []).filter(e => Number(e.year) === year)
    let eventIncome = 0, eventExpense = 0
    for (const ev of yearEvents) {
      const amt = ev.monthly ? Number(ev.amount) * 12 : Number(ev.amount)
      if (ev.income) eventIncome  += amt
      else           eventExpense += amt
    }

    // Investment growth on existing balance (compound annually)
    const investmentGrowth = Math.round(Math.max(balance, 0) * (investmentReturn / 100))
    const freeCashFlow     = annualIncome + eventIncome - annualFixed - annualVariable - eventExpense
    balance = balance + freeCashFlow + investmentGrowth

    rows.push({
      year,
      annualIncome,
      eventIncome:     Math.round(eventIncome),
      investmentGrowth,
      annualFixed,
      annualVariable,
      eventExpense:    Math.round(eventExpense),
      freeCashFlow:    Math.round(freeCashFlow),
      netWorth:        Math.round(balance),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// 12-month savings balance chart (preserved; extended for optional custom line)
// ---------------------------------------------------------------------------
function ProjectionChart({ currentPath, optimisedPath, customPath, view }) {
  const src = view === 'monthly' ? currentPath : currentPath.filter((_, i) => (i + 1) % 3 === 0)
  const data = src.map((v, i) => {
    const idx = view === 'monthly' ? i : i * 3
    return {
      month:     getMonthLabel(idx),
      current:   v,
      optimised: optimisedPath[idx] ?? null,
      custom:    customPath ? (customPath[idx] ?? null) : null,
    }
  })

  const allVals = data.flatMap(d => [d.current, d.optimised, d.custom]).filter(v => v != null && !isNaN(v))
  const minVal  = Math.min(...allVals, 0)
  const maxVal  = Math.max(...allVals, 1)
  const range   = maxVal - minVal || 1

  const W = 340, H = 160
  const PAD = { top: 16, right: 12, bottom: 28, left: 52 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom

  const xPos = i => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
  const yPos = v => PAD.top  + innerH - ((v - minVal) / range) * innerH
  const linePath = key => data.reduce((acc, d, i) => {
    if (d[key] == null) return acc
    return acc + `${acc === '' ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d[key]).toFixed(1)} `
  }, '').trim()

  const yTicks = [0, 0.5, 1].map(f => ({ val: minVal + f * range, y: yPos(minVal + f * range) }))
  const zeroY  = yPos(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="proj-svg">
      {minVal < 0 && maxVal > 0 && (
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
          stroke="#D85A30" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" />
      )}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="0.6" />
          <text x={PAD.left - 4} y={t.y + 3} textAnchor="end" fontSize="7.5" fill="var(--muted)">
            {Math.abs(t.val) >= 1000 ? `${t.val < 0 ? '-' : ''}${Math.round(Math.abs(t.val) / 1000)}k` : Math.round(t.val)}
          </text>
        </g>
      ))}
      {customPath && <path d={linePath('custom')}    fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeDasharray="4,2"  strokeLinejoin="round" />}
      <path d={linePath('optimised')} fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="5,3"  strokeLinejoin="round" />
      <path d={linePath('current')}   fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => {
        if (data.length > 6 && i % 2 !== 0) return null
        return (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(d.current)} r="2.5" fill="var(--coral)" />
            <circle cx={xPos(i)} cy={yPos(d.optimised)} r="2" fill="#1D9E75" />
            {d.custom != null && <circle cx={xPos(i)} cy={yPos(d.custom)} r="2" fill="#7F77DD" />}
            <text x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="var(--muted)">{d.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Net worth over years -- scenario comparison chart (3 paths)
// ---------------------------------------------------------------------------
function YearChart({ models }) {
  const { current, optimised, custom } = models
  if (!current?.length) return null

  const hasCustom = custom?.length > 0
  const allVals = [
    ...current.map(r => r.netWorth),
    ...optimised.map(r => r.netWorth),
    ...(hasCustom ? custom.map(r => r.netWorth) : []),
  ]
  const minVal = Math.min(...allVals, 0)
  const maxVal = Math.max(...allVals, 1)
  const range  = maxVal - minVal || 1

  const W = 340, H = 160
  const PAD = { top: 16, right: 12, bottom: 28, left: 60 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom
  const n = current.length

  const xPos = i => PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const yPos = v => PAD.top  + innerH - ((v - minVal) / range) * innerH
  const linePath = rows => rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(r.netWorth).toFixed(1)}`).join(' ')

  const yTicks = [0, 0.5, 1].map(f => ({ val: minVal + f * range, y: yPos(minVal + f * range) }))
  const zeroY  = yPos(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="proj-svg">
      {minVal < 0 && maxVal > 0 && (
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
          stroke="#D85A30" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" />
      )}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="0.6" />
          <text x={PAD.left - 4} y={t.y + 3} textAnchor="end" fontSize="7.5" fill="var(--muted)">{fmtK(t.val)}</text>
        </g>
      ))}
      {hasCustom && <path d={linePath(custom)}    fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeDasharray="4,2"  strokeLinejoin="round" />}
      <path d={linePath(optimised)} fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="5,3"  strokeLinejoin="round" />
      <path d={linePath(current)}   fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinejoin="round" />
      {current.map((r, i) => {
        if (n > 6 && i % 2 !== 0) return null
        return (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(r.netWorth)} r="2.5" fill="var(--coral)" />
            <circle cx={xPos(i)} cy={yPos(optimised[i].netWorth)} r="2" fill="#1D9E75" />
            {hasCustom && custom[i] && <circle cx={xPos(i)} cy={yPos(custom[i].netWorth)} r="2" fill="#7F77DD" />}
            <text x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="var(--muted)">{r.year}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Year-by-year financial table (sticky left col, horizontal scroll on mobile)
// ---------------------------------------------------------------------------
const TABLE_ROWS = [
  { key: 'annualIncome',    label: 'Salary income',     type: 'income'   },
  { key: 'eventIncome',     label: 'Bonus / events',    type: 'income'   },
  { key: 'investmentGrowth',label: 'Investment growth', type: 'income'   },
  { key: 'annualFixed',     label: 'Fixed obligations', type: 'expense'  },
  { key: 'annualVariable',  label: 'Living expenses',   type: 'expense'  },
  { key: 'eventExpense',    label: 'Event costs',       type: 'expense'  },
  { key: 'freeCashFlow',    label: 'Free cash flow',    type: 'net'      },
  { key: 'netWorth',        label: 'Net worth',         type: 'networth' },
]

function YearlyTable({ model }) {
  if (!model?.length) return null
  return (
    <div className="proj-table-wrap">
      <table className="proj-year-table">
        <thead>
          <tr>
            <th className="proj-table-sticky proj-table-th">Metric</th>
            {model.map(r => <th key={r.year} className="proj-table-th">{r.year}</th>)}
          </tr>
        </thead>
        <tbody>
          {TABLE_ROWS.map(row => (
            <tr key={row.key} className={`proj-table-row proj-tr-${row.type}`}>
              <td className="proj-table-sticky proj-table-label">{row.label}</td>
              {model.map(r => {
                const val = r[row.key]
                const zero = val === 0
                if (zero && (row.type === 'income' || row.type === 'expense')) {
                  return <td key={r.year} className="proj-table-cell proj-cell-muted">—</td>
                }
                const colorCls = (row.type === 'net' || row.type === 'networth')
                  ? (val < 0 ? 'proj-cell-red' : 'proj-cell-green') : ''
                return <td key={r.year} className={`proj-table-cell ${colorCls}`}>{fmt(val)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_ASSUMPTIONS = { salaryGrowth: 5, inflation: 6, investmentReturn: 8 }

const EVENT_TEMPLATES = [
  { type: 'salary_change', label: 'Salary increase (net/mo)', income: true,  monthly: true  },
  { type: 'bonus',         label: 'Bonus / lump sum income',  income: true,  monthly: false },
  { type: 'vehicle',       label: 'Vehicle purchase',         income: false, monthly: false },
  { type: 'property',      label: 'Property deposit',         income: false, monthly: false },
  { type: 'school_fees',   label: 'School fees (annual)',     income: false, monthly: false },
  { type: 'debt_payoff',   label: 'Debt payoff saving (mo)',  income: true,  monthly: true  },
  { type: 'expense',       label: 'One-off expense',          income: false, monthly: false },
  { type: 'income',        label: 'One-off income',           income: true,  monthly: false },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Projections({ recurringMonthly }) {
  const { user, profile } = useAuth()
  const tier = useTier()
  const [loading, setLoading]   = useState(true)
  const [projIntegrityIssues, setProjIntegrityIssues] = useState([])  // reconciliation issues
  const [txns, setTxns]         = useState([])
  const [view, setView]         = useState('monthly')
  const [range, setRange]       = useState({ from: '', to: '' })

  // Input overrides (existing)
  const [netIncomeInput,     setNetIncomeInput]     = useState('')
  const [debitOrdersInput,   setDebitOrdersInput]   = useState('')
  const [currentSavingsInput,setCurrentSavingsInput]= useState('')

  // New state
  const [forecastMode,     setForecastMode]    = useState('current')
  const [assumptions,      setAssumptions]     = useState(DEFAULT_ASSUMPTIONS)
  const [showAssumptions,  setShowAssumptions] = useState(false)
  const [showYearTable,    setShowYearTable]   = useState(false)
  const [horizonYears,     setHorizonYears]    = useState(10)
  const [customEvents,     setCustomEvents]    = useState([])
  const [showEventForm,    setShowEventForm]   = useState(false)
  const [eventDraft,       setEventDraft]      = useState({
    type: 'bonus', year: new Date().getFullYear() + 1, amount: '', description: '',
  })

  // Pre-fill from profile (existing behaviour) + recurringMonthly prop
  useEffect(() => {
    if (!profile) return
    if (profile.net_income) setNetIncomeInput(String(Math.round(profile.net_income / 100)))
    const debitBase = recurringMonthly || (profile.monthly_debit_orders ? profile.monthly_debit_orders / 100 : 0)
    if (debitBase) setDebitOrdersInput(String(Math.round(debitBase)))
  }, [profile, recurringMonthly])

  useEffect(() => { loadTransactions() }, [user?.id, tier])

  async function loadTransactions() {
    setLoading(true)
    try {
      const now = new Date()
      const to   = formatLocalDate(now)
      const from = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 2, 1))
      setRange({ from, to })
      const data = await fetchTransactionsByRange(user.id, from, to)
      setTxns((data || []).filter(t => isDateAllowed(t.date, tier)))
    } catch (err) {
      console.error('Projections load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // UNCHANGED: canonical ledger averages
  const { avgVariableSpend, topVariableCategory, monthlyIncome } = useMemo(() => {
    const ledger = buildLedgerSummary(txns, profile, {
      preferDeclared: false,
      monthCount: countCalendarMonths(range.from, range.to) || undefined,
      dedup: true,
      debugLabel: `Projections ${range.from}..${range.to}`,
      from: range.from, to: range.to,
    })
    const VARIABLE_CATS = new Set(['Groceries','Eating out','Entertainment','Clothing','Health','Transport','Fuel','Other'])
    const varSpend = {}
    for (const [cat, amt] of Object.entries(ledger.catTotals)) {
      if (VARIABLE_CATS.has(cat)) varSpend[cat] = amt
    }
    const totalVar  = Object.values(varSpend).reduce((s, v) => s + v, 0)
    const mc        = ledger.monthCount || 1
    const avgVar    = totalVar / mc
    const topCat    = Object.entries(varSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'
    return { avgVariableSpend: avgVar, topVariableCategory: topCat, monthlyIncome: ledger.avgMonthlyIncome }
  }, [txns, profile, range.from, range.to])

  // Derived values (existing)
  const netIncome     = parseFloat(netIncomeInput)     || monthlyIncome || (profile?.net_income     ? profile.net_income / 100     : 0)
  const debitOrders   = parseFloat(debitOrdersInput)   || (profile?.monthly_debit_orders             ? profile.monthly_debit_orders / 100 : 0)
  const currentSavings= parseFloat(currentSavingsInput)|| 0

  // Reconciliation check: validate projection inputs against canonical ledger
  // Uses validateProjectionInputs from integrity.js (pure, no side effects)
  // Runs synchronously so yearModels always reflect any detected drift
  const _projIssues = useMemo(() => {
    if (!netIncome || !avgVariableSpend) return []
    // Build a minimal ledger-compatible object from the useMemo output
    const approxLedger = { resolvedMonthlyIncome: monthlyIncome || 0 }
    return validateProjectionInputs(approxLedger, {
      netIncomeMonthly: netIncome,
      fixedMonthly: debitOrders,
      variableMonthly: avgVariableSpend,
    })
  }, [netIncome, debitOrders, avgVariableSpend, monthlyIncome])

  const monthlyFreeCashFlow   = netIncome - debitOrders - avgVariableSpend
  const optimisedVariableSpend= avgVariableSpend * 0.9
  const optimisedFreeCashFlow = netIncome - debitOrders - optimisedVariableSpend

  // UNCHANGED: 12-month monthly savings projection
  const projections = useMemo(() => {
    const current   = [currentSavings]
    const optimised = [currentSavings]
    for (let i = 1; i <= 12; i++) {
      current.push(current[i - 1]   + monthlyFreeCashFlow)
      optimised.push(optimised[i - 1] + optimisedFreeCashFlow)
    }
    return { current, optimised }
  }, [monthlyFreeCashFlow, optimisedFreeCashFlow, currentSavings])

  // NEW: year-by-year models (deterministic, all 3 scenarios)
  const yearModels = useMemo(() => {
    const base = { netIncomeMonthly: netIncome, fixedMonthly: debitOrders,
                   variableMonthly: avgVariableSpend, startingSavings: currentSavings,
                   assumptions, horizonYears }
    return {
      current:   buildYearModel({ ...base, varReduction: 1.0, events: [] }),
      optimised: buildYearModel({ ...base, varReduction: 0.9, events: [] }),
      custom:    buildYearModel({ ...base, varReduction: 1.0, events: customEvents }),
    }
  }, [netIncome, debitOrders, avgVariableSpend, currentSavings, assumptions, horizonYears, customEvents])

  // Custom monthly projection for 12-month chart (spread events across months)
  const customMonthlyProjection = useMemo(() => {
    if (customEvents.length === 0) return null
    const currentYear = new Date().getFullYear()
    let bonus = 0, extra = 0
    for (const ev of customEvents.filter(e => Number(e.year) === currentYear || Number(e.year) === currentYear + 1)) {
      const mo = ev.monthly ? Number(ev.amount) : Number(ev.amount) / 12
      if (ev.income) bonus += mo; else extra += mo
    }
    const fcf = monthlyFreeCashFlow + bonus - extra
    const arr = [currentSavings]
    for (let i = 1; i <= 12; i++) arr.push(arr[i - 1] + fcf)
    return arr
  }, [customEvents, monthlyFreeCashFlow, currentSavings])

  const annualSavingsCurrent   = monthlyFreeCashFlow   * 12
  const annualSavingsOptimised = optimisedFreeCashFlow * 12
  const monthsToSavingsGoal    = profile?.savings_goal && monthlyFreeCashFlow > 0
    ? Math.ceil((profile.savings_goal / 100) / monthlyFreeCashFlow) : null

  const activeModel = yearModels[forecastMode] || yearModels.current
  const finalNetWorth = activeModel[activeModel.length - 1]?.netWorth || 0

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 15 }, (_, i) => currentYear + i)

  function addEvent() {
    const tmpl = EVENT_TEMPLATES.find(t => t.type === eventDraft.type) || EVENT_TEMPLATES[0]
    setCustomEvents(prev => [...prev, {
      ...eventDraft, income: tmpl.income, monthly: tmpl.monthly, id: Date.now(),
    }])
    setShowEventForm(false)
    setEventDraft({ type: 'bonus', year: currentYear + 1, amount: '', description: '' })
  }

  // ---- Render ----------------------------------------------------------------
  return (
    <div className="proj-shell">
      <div className="proj-header">
        <h2 className="proj-title">Scenario Planning</h2>
        <p className="proj-sub">Model your financial future. All calculations are deterministic — no AI maths.</p>
      </div>

      {/* Integrity notice: shown only when projection inputs drift from canonical ledger */}
      {_projIssues.length > 0 && (
        <div className="proj-integrity-notice">
          {_projIssues.map((issue, i) => (
            <div key={i} className="proj-integrity-item">⚠ {issue}</div>
          ))}
        </div>
      )}

      {/* Forecast mode tabs */}
      <div className="proj-mode-tabs">
        {[['current','Current Path'],['optimised','Optimised Path'],['custom','Custom Scenario']].map(([mode, label]) => (
          <button key={mode} className={`proj-mode-tab ${forecastMode === mode ? 'active' : ''}`}
            onClick={() => setForecastMode(mode)}>{label}</button>
        ))}
      </div>

      {/* Mode description */}
      <p className="proj-mode-desc">
        {forecastMode === 'current'   && 'Your current spending trajectory — no behaviour changes assumed.'}
        {forecastMode === 'optimised' && 'Applies bump. optimisation: 10% variable spend reduction, boosting free cash flow.'}
        {forecastMode === 'custom'    && 'Add life events — bonuses, salary changes, purchases, school fees — to build your own scenario.'}
      </p>

      {/* Input overrides */}
      <div className="proj-inputs">
        <div className="proj-input-group">
          <label className="proj-input-lbl">Net monthly income</label>
          <div className="proj-input-wrap">
            <span className="proj-prefix">R</span>
            <input className="proj-input" type="number" placeholder="0"
              value={netIncomeInput} onChange={e => setNetIncomeInput(e.target.value)} />
          </div>
        </div>
        <div className="proj-input-group">
          <label className="proj-input-lbl">Fixed obligations</label>
          <div className="proj-input-wrap">
            <span className="proj-prefix">R</span>
            <input className="proj-input" type="number" placeholder="0"
              value={debitOrdersInput} onChange={e => setDebitOrdersInput(e.target.value)} />
          </div>
        </div>
        <div className="proj-input-group">
          <label className="proj-input-lbl">Starting savings</label>
          <div className="proj-input-wrap">
            <span className="proj-prefix">R</span>
            <input className="proj-input" type="number" placeholder="0"
              value={currentSavingsInput} onChange={e => setCurrentSavingsInput(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="proj-cards">
        <div className="proj-card">
          <div className="proj-card-lbl">Avg variable spend/mo</div>
          <div className="proj-card-val">{fmt(avgVariableSpend)}</div>
          <div className="proj-card-sub">last 3 months average</div>
        </div>
        <div className="proj-card">
          <div className="proj-card-lbl">Free cash flow</div>
          <div className={`proj-card-val ${monthlyFreeCashFlow >= 0 ? 'green' : 'red'}`}>
            {fmt(forecastMode === 'optimised' ? optimisedFreeCashFlow : monthlyFreeCashFlow)}/mo
          </div>
          <div className="proj-card-sub">income − fixed − variable</div>
        </div>
        <div className="proj-card proj-card-highlight">
          <div className="proj-card-lbl">{horizonYears}yr net worth</div>
          <div className={`proj-card-val ${finalNetWorth >= 0 ? 'green' : 'red'}`}>{fmt(finalNetWorth)}</div>
          <div className="proj-card-sub">{forecastMode} path</div>
        </div>
      </div>

      {/* Annual strip (existing) */}
      <div className="proj-annual-strip">
        <div className="proj-annual-item">
          <span className="proj-annual-lbl">Annual savings (current path)</span>
          <span className={`proj-annual-val ${annualSavingsCurrent >= 0 ? 'green' : 'red'}`}>{fmt(annualSavingsCurrent)}</span>
        </div>
        <div className="proj-annual-item">
          <span className="proj-annual-lbl">Annual savings (optimised)</span>
          <span className="proj-annual-val green">{fmt(annualSavingsOptimised)}</span>
        </div>
        {monthsToSavingsGoal && (
          <div className="proj-annual-item">
            <span className="proj-annual-lbl">Months to savings goal</span>
            <span className="proj-annual-val">{monthsToSavingsGoal} months</span>
          </div>
        )}
      </div>

      {/* 12-month savings chart (existing + extended) */}
      <div className="proj-chart-card">
        <div className="proj-chart-head">
          <span className="proj-chart-title">12-month savings balance</span>
          <div className="proj-view-toggle">
            <button className={`proj-view-btn ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
            <button className={`proj-view-btn ${view === 'annual'  ? 'active' : ''}`} onClick={() => setView('annual')}>Quarterly</button>
          </div>
        </div>
        <div className="proj-chart-legend">
          <span className="proj-legend-dot" style={{ background: 'var(--coral)' }} /> Current
          <span className="proj-legend-dot" style={{ background: '#1D9E75', marginLeft: 12 }} /> Optimised
          {customMonthlyProjection && (
            <><span className="proj-legend-dot" style={{ background: '#7F77DD', marginLeft: 12 }} /> Custom</>
          )}
        </div>
        {loading ? (
          <div className="proj-loading"><div className="ai-spinner"><span /><span /><span /></div></div>
        ) : (
          <ProjectionChart currentPath={projections.current} optimisedPath={projections.optimised}
            customPath={customMonthlyProjection} view={view} />
        )}
      </div>

      {/* Net worth trajectory chart */}
      <div className="proj-chart-card">
        <div className="proj-chart-head">
          <span className="proj-chart-title">Net worth trajectory</span>
          <div className="proj-view-toggle">
            {[5, 10, 15].map(y => (
              <button key={y} className={`proj-view-btn ${horizonYears === y ? 'active' : ''}`}
                onClick={() => setHorizonYears(y)}>{y}yr</button>
            ))}
          </div>
        </div>
        <div className="proj-chart-legend">
          <span className="proj-legend-dot" style={{ background: 'var(--coral)' }} /> Current
          <span className="proj-legend-dot" style={{ background: '#1D9E75', marginLeft: 12 }} /> Optimised
          {customEvents.length > 0 && (
            <><span className="proj-legend-dot" style={{ background: '#7F77DD', marginLeft: 12 }} /> Custom</>
          )}
        </div>
        <YearChart models={yearModels} />
      </div>

      {/* Assumptions panel */}
      <div className="proj-assumptions-panel">
        <button className="proj-assumptions-toggle" onClick={() => setShowAssumptions(v => !v)}>
          <span className="proj-assumptions-toggle-title">Growth assumptions</span>
          <span className="proj-assumptions-hint">
            salary {assumptions.salaryGrowth}% · inflation {assumptions.inflation}% · returns {assumptions.investmentReturn}%
          </span>
          <span className="proj-toggle-arrow">{showAssumptions ? '▲' : '▼'}</span>
        </button>
        {showAssumptions && (
          <div className="proj-assumptions-body">
            {[
              { key: 'salaryGrowth',    label: 'Annual salary growth (%)',      hint: 'Expected net income increase per year' },
              { key: 'inflation',       label: 'Inflation / cost of living (%)', hint: 'How fast your expenses grow annually' },
              { key: 'investmentReturn',label: 'Investment return (%)',          hint: 'Annual return on savings balance' },
            ].map(({ key, label, hint }) => (
              <div key={key} className="proj-assumption-row">
                <div className="proj-assumption-text">
                  <div className="proj-assumption-label">{label}</div>
                  <div className="proj-assumption-hint">{hint}</div>
                </div>
                <div className="proj-assumption-input-wrap">
                  <input
                    className="proj-assumption-input" type="number" min="0" max="50" step="0.5"
                    value={assumptions[key]}
                    onChange={e => setAssumptions(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="proj-assumption-pct">%</span>
                </div>
              </div>
            ))}
            <button className="proj-assumptions-reset" onClick={() => setAssumptions(DEFAULT_ASSUMPTIONS)}>
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* Custom scenario events (only in custom mode) */}
      {forecastMode === 'custom' && (
        <div className="proj-events-panel">
          <div className="proj-events-head">
            <span className="proj-events-title">Life events</span>
            <button className="proj-add-event-btn" onClick={() => setShowEventForm(v => !v)}>+ Add event</button>
          </div>

          {showEventForm && (
            <div className="proj-event-form">
              <div className="proj-event-form-row">
                <select className="proj-event-select" value={eventDraft.type}
                  onChange={e => setEventDraft(d => ({ ...d, type: e.target.value }))}>
                  {EVENT_TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
                <select className="proj-event-select" value={eventDraft.year}
                  onChange={e => setEventDraft(d => ({ ...d, year: Number(e.target.value) }))}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="proj-event-form-row">
                <div className="proj-input-wrap" style={{ flex: 1 }}>
                  <span className="proj-prefix">R</span>
                  <input className="proj-input" type="number" placeholder="Amount"
                    value={eventDraft.amount}
                    onChange={e => setEventDraft(d => ({ ...d, amount: e.target.value }))} />
                </div>
                <input className="proj-event-desc-input" type="text" placeholder="Label (optional)"
                  value={eventDraft.description}
                  onChange={e => setEventDraft(d => ({ ...d, description: e.target.value }))} />
              </div>
              <div className="proj-event-form-actions">
                <button className="proj-event-cancel-btn" onClick={() => setShowEventForm(false)}>Cancel</button>
                <button className="proj-event-add-btn" onClick={addEvent} disabled={!eventDraft.amount}>Add</button>
              </div>
            </div>
          )}

          {customEvents.length === 0 && !showEventForm && (
            <p className="proj-events-empty">
              No events added yet. Model bonuses, salary changes, vehicle purchases, school fees, and more.
            </p>
          )}

          {customEvents.map(ev => {
            const tmpl = EVENT_TEMPLATES.find(t => t.type === ev.type) || EVENT_TEMPLATES[0]
            return (
              <div key={ev.id} className="proj-event-item">
                <div className="proj-event-item-info">
                  <span className={`proj-event-year-badge ${ev.income ? 'income' : 'expense'}`}>{ev.year}</span>
                  <span className="proj-event-item-label">{ev.description || tmpl.label}</span>
                  <span className="proj-event-item-amount">
                    {ev.income ? '+' : '-'}{fmt(Number(ev.amount))}{ev.monthly ? '/mo' : ''}
                  </span>
                </div>
                <button className="proj-event-remove-btn"
                  onClick={() => setCustomEvents(prev => prev.filter(e => e.id !== ev.id))}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Year-by-year table (expandable) */}
      <div className="proj-table-section">
        <button className="proj-table-toggle" onClick={() => setShowYearTable(v => !v)}>
          <span className="proj-table-toggle-title">Year-by-year financial model</span>
          <span className="proj-table-toggle-hint">{forecastMode} path · {horizonYears} years</span>
          <span className="proj-toggle-arrow">{showYearTable ? '▲' : '▼'}</span>
        </button>
        {showYearTable && <YearlyTable model={activeModel} />}
      </div>

      {/* Scenario explanation (existing, evolved) */}
      <div className="proj-scenario-card">
        <div className="proj-scenario-title">
          {forecastMode === 'current'   ? '\u{1F4C9}' : forecastMode === 'optimised' ? '\u{1F4C8}' : '\u{1F527}'}{' '}
          {forecastMode === 'current'   ? 'Current path' : forecastMode === 'optimised' ? 'Optimised path' : 'Custom scenario'}
        </div>
        <p className="proj-scenario-text">
          {forecastMode === 'current' && (
            <>Your current trajectory projects <strong>{fmt(annualSavingsCurrent)}</strong> saved per year.
            Variable spend averages <strong>{fmt(avgVariableSpend)}/mo</strong>, led by <strong>{topVariableCategory}</strong>.</>
          )}
          {forecastMode === 'optimised' && (
            <>A 10% reduction in <strong>{topVariableCategory}</strong> saves <strong>{fmt((avgVariableSpend - optimisedVariableSpend) * 12)}</strong> per year.
            Over {horizonYears} years ({assumptions.salaryGrowth}% salary growth, {assumptions.investmentReturn}% returns),
            your net worth reaches <strong>{fmt(yearModels.optimised[yearModels.optimised.length - 1]?.netWorth || 0)}</strong>.</>
          )}
          {forecastMode === 'custom' && (customEvents.length === 0
            ? 'Add life events above to build your custom scenario.'
            : <>You have <strong>{customEvents.length} event(s)</strong> modelled.
              Your custom path projects a net worth of <strong>{fmt(yearModels.custom[yearModels.custom.length - 1]?.netWorth || 0)}</strong> in {horizonYears} years.</>
          )}
        </p>
      </div>
    </div>
  )
}
