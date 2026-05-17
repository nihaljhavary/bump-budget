import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { fetchTransactionsByRange } from '../services/transactions'
import { buildLedgerSummary, countCalendarMonths, formatLocalDate, validateProjectionInputs } from '../utils/ledger'
import { useTier, isDateAllowed } from '../context/TierContext'
import { DEFAULT_PROJECTION_ASSUMPTIONS } from '../utils/projection'
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

    // Events for this year -- granular tracking by type
    const yearEvents = (events || []).filter(e => Number(e.year) === year)
    let eventIncome = 0, eventExpense = 0
    let bonusIncome = 0, salaryEventIncome = 0
    let vehicleCosts = 0, schoolFees = 0, childCosts = 0
    let investmentContrib = 0, bondPayments = 0, otherEventExpense = 0
    let vehicleSaleIncome = 0, debtPayoffSaving = 0, otherEventIncome = 0

    for (const ev of yearEvents) {
      const amt = ev.monthly ? Number(ev.amount) * 12 : Number(ev.amount)
      if (ev.income) {
        eventIncome += amt
        if (ev.type === 'bonus' || ev.type === 'income')       bonusIncome       += amt
        else if (ev.type === 'vehicle_sell')                    vehicleSaleIncome += amt
        else if (ev.type === 'salary_change')                   salaryEventIncome += amt
        else if (ev.type === 'debt_payoff')                     debtPayoffSaving  += amt
        else                                                     otherEventIncome  += amt
      } else {
        eventExpense += amt
        if (ev.type === 'vehicle_buy')                          vehicleCosts      += amt
        else if (ev.type === 'school_fees')                     schoolFees        += amt
        else if (ev.type === 'children')                        childCosts        += amt
        else if (ev.type === 'investment')                      investmentContrib += amt
        else if (ev.type === 'bond_payment')                    bondPayments      += amt
        else                                                     otherEventExpense += amt
      }
    }

    // Investment growth on existing balance (compound annually)
    const investmentGrowth = Math.round(Math.max(balance, 0) * (investmentReturn / 100))
    const freeCashFlow     = annualIncome + eventIncome - annualFixed - annualVariable - eventExpense
    balance = balance + freeCashFlow + investmentGrowth

    rows.push({
      year,
      annualIncome,
      bonusIncome:        Math.round(bonusIncome),
      salaryEventIncome:  Math.round(salaryEventIncome),
      vehicleSaleIncome:  Math.round(vehicleSaleIncome),
      debtPayoffSaving:   Math.round(debtPayoffSaving),
      otherEventIncome:   Math.round(otherEventIncome),
      investmentGrowth,
      annualFixed,
      annualVariable,
      vehicleCosts:       Math.round(vehicleCosts),
      schoolFees:         Math.round(schoolFees),
      childCosts:         Math.round(childCosts),
      investmentContrib:  Math.round(investmentContrib),
      bondPayments:       Math.round(bondPayments),
      otherEventExpense:  Math.round(otherEventExpense),
      // Aggregates (preserved for compatibility)
      eventIncome:        Math.round(eventIncome),
      eventExpense:       Math.round(eventExpense),
      freeCashFlow:       Math.round(freeCashFlow),
      netWorth:           Math.round(balance),
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
    return acc + (acc === '' ? 'M' : 'L') + ' ' + xPos(i).toFixed(1) + ' ' + yPos(d[key]).toFixed(1) + ' '
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
            {Math.abs(t.val) >= 1000 ? (t.val < 0 ? '-' : '') + Math.round(Math.abs(t.val) / 1000) + 'k' : Math.round(t.val)}
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
  const linePath = rows => rows.map((r, i) => (i === 0 ? 'M' : 'L') + ' ' + xPos(i).toFixed(1) + ' ' + yPos(r.netWorth).toFixed(1)).join(' ')

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
// Multi-scenario comparison panel
// ---------------------------------------------------------------------------
function ScenarioComparisonPanel({ models, horizonYears }) {
  const scenarios = [
    { key: 'current',   label: 'Current Path', color: 'var(--coral)' },
    { key: 'optimised', label: 'Optimised',    color: '#1D9E75'      },
    { key: 'custom',    label: 'Custom',        color: '#7F77DD'      },
  ]

  const metrics = [
    { label: 'Net worth (' + horizonYears + 'yr)', getVal: rows => rows[rows.length - 1]?.netWorth ?? 0 },
    { label: 'Free cash flow (yr 1)',               getVal: rows => rows[0]?.freeCashFlow ?? 0 },
    { label: 'Investment growth (yr 1)',             getVal: rows => rows[0]?.investmentGrowth ?? 0 },
    { label: 'Yr 5 net worth',                      getVal: rows => rows[Math.min(4, rows.length - 1)]?.netWorth ?? 0 },
  ]

  return (
    <div className="proj-compare-body">
      <div className="proj-compare-grid">
        {scenarios.map(sc => {
          const rows = models[sc.key]
          if (!rows?.length) return null
          return (
            <div key={sc.key} className="proj-compare-col">
              <div className="proj-compare-col-label" style={{ color: sc.color }}>{sc.label}</div>
              {metrics.map(m => {
                const val = m.getVal(rows)
                return (
                  <div key={m.label} className="proj-compare-metric">
                    <div className="proj-compare-metric-label">{m.label}</div>
                    <div className={'proj-compare-metric-value' + (val < 0 ? ' red' : '')}>{fmtK(val)}</div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Year-by-year financial table (sticky left col, horizontal scroll on mobile)
// Shows only rows with non-zero values across any year.
// ---------------------------------------------------------------------------
const ALL_TABLE_ROWS = [
  { key: 'annualIncome',       label: 'Salary income',           type: 'income'   },
  { key: 'bonusIncome',        label: 'Bonuses / windfalls',     type: 'income'   },
  { key: 'salaryEventIncome',  label: 'Salary increase gains',   type: 'income'   },
  { key: 'vehicleSaleIncome',  label: 'Vehicle sale proceeds',   type: 'income'   },
  { key: 'debtPayoffSaving',   label: 'Debt cleared (saving)',   type: 'income'   },
  { key: 'investmentGrowth',   label: 'Investment growth',       type: 'income'   },
  { key: 'annualFixed',        label: 'Fixed obligations',       type: 'expense'  },
  { key: 'annualVariable',     label: 'Living expenses',         type: 'expense'  },
  { key: 'vehicleCosts',       label: 'Vehicle costs',           type: 'expense'  },
  { key: 'schoolFees',         label: 'School fees',             type: 'expense'  },
  { key: 'childCosts',         label: 'Child / childcare',       type: 'expense'  },
  { key: 'investmentContrib',  label: 'Investment contributions',type: 'expense'  },
  { key: 'bondPayments',       label: 'Bond repayments',         type: 'expense'  },
  { key: 'otherEventExpense',  label: 'Other event costs',       type: 'expense'  },
  { key: 'freeCashFlow',       label: 'Free cash flow',          type: 'net'      },
  { key: 'netWorth',           label: 'Net worth',               type: 'networth' },
]

const ALWAYS_SHOW = new Set(['annualIncome','annualFixed','annualVariable','investmentGrowth','freeCashFlow','netWorth'])

function YearlyTable({ model }) {
  if (!model?.length) return null

  const activeRows = ALL_TABLE_ROWS.filter(row => {
    if (ALWAYS_SHOW.has(row.key)) return true
    return model.some(r => (r[row.key] || 0) !== 0)
  })

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
          {activeRows.map(row => (
            <tr key={row.key} className={'proj-table-row proj-tr-' + row.type}>
              <td className="proj-table-sticky proj-table-label">{row.label}</td>
              {model.map(r => {
                const val = r[row.key] || 0
                if (val === 0 && !ALWAYS_SHOW.has(row.key)) {
                  return <td key={r.year} className="proj-table-cell proj-cell-muted">-</td>
                }
                const colorCls = (row.type === 'net' || row.type === 'networth')
                  ? (val < 0 ? 'proj-cell-red' : 'proj-cell-green') : ''
                return <td key={r.year} className={'proj-table-cell ' + colorCls}>{fmt(val)}</td>
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
// DEFAULT_PROJECTION_ASSUMPTIONS imported from src/utils/projection.js
// -- shared with Recommendations.jsx so both components reconcile on base case.
const DEFAULT_ASSUMPTIONS = DEFAULT_PROJECTION_ASSUMPTIONS

const EVENT_TEMPLATES = [
  { type: 'bonus',         label: 'Bonus / windfall',             income: true,  monthly: false, icon: '💰' },
  { type: 'salary_change', label: 'Salary increase (net/mo)',     income: true,  monthly: true,  icon: '📈' },
  { type: 'vehicle_buy',   label: 'Vehicle purchase',             income: false, monthly: false, icon: '🚗' },
  { type: 'vehicle_sell',  label: 'Vehicle sale proceeds',        income: true,  monthly: false, icon: '🚗' },
  { type: 'property',      label: 'Property deposit / costs',     income: false, monthly: false, icon: '🏠' },
  { type: 'bond_payment',  label: 'Bond repayment (mo)',          income: false, monthly: true,  icon: '🏠' },
  { type: 'children',      label: 'Child costs (mo)',             income: false, monthly: true,  icon: '👶' },
  { type: 'school_fees',   label: 'School fees (annual)',         income: false, monthly: false, icon: '📚' },
  { type: 'debt_payoff',   label: 'Debt cleared - saves (mo)',    income: true,  monthly: true,  icon: '✂' },
  { type: 'investment',    label: 'Investment contribution (mo)', income: false, monthly: true,  icon: '📊' },
  { type: 'expense',       label: 'One-off expense',              income: false, monthly: false, icon: '💸' },
  { type: 'income',        label: 'One-off income',               income: true,  monthly: false, icon: '💰' },
]

// ---------------------------------------------------------------------------
// localStorage persistence helpers for scenario planning state.
// Keys are scoped under 'bumpScenario_' to avoid collisions.
// Failures are silently swallowed -- persistence is best-effort.
// ---------------------------------------------------------------------------
const LS_PREFIX = 'bumpScenario_'
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw)
    // Basic type check: if parsed is an object/array, verify it's not empty-corrupted
    return parsed !== null && parsed !== undefined ? parsed : fallback
  } catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)) } catch {}
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Projections({ recurringMonthly }) {
  const { user, profile } = useAuth()
  const tier = useTier()
  const [loading, setLoading]   = useState(true)
  const [txns, setTxns]         = useState([])
  const [view, setView]         = useState('monthly')
  const [range, setRange]       = useState({ from: '', to: '' })

  const [netIncomeInput,     setNetIncomeInput]     = useState('')
  const [debitOrdersInput,   setDebitOrdersInput]   = useState('')
  const [currentSavingsInput,setCurrentSavingsInput]= useState('')

  const [forecastMode,     setForecastMode]    = useState(() => lsGet('forecastMode', 'current'))
  const [assumptions,      setAssumptions]     = useState(() => lsGet('assumptions', DEFAULT_ASSUMPTIONS))
  const [showAssumptions,  setShowAssumptions] = useState(false)
  const [showYearTable,    setShowYearTable]   = useState(false)
  const [showCompare,      setShowCompare]     = useState(false)
  const [horizonYears,     setHorizonYears]    = useState(() => lsGet('horizonYears', 10))
  const [customEvents,     setCustomEvents]    = useState(() => lsGet('customEvents', []))
  const [showEventForm,    setShowEventForm]   = useState(false)
  const [eventDraft,       setEventDraft]      = useState({
    type: 'bonus', year: new Date().getFullYear() + 1, amount: '', description: '',
  })

  const [aiPrompt,       setAiPrompt]       = useState('')
  const [aiLoading,      setAiLoading]      = useState(false)
  const [aiError,        setAiError]        = useState('')
  const [aiExplanation,  setAiExplanation]  = useState('')

  useEffect(() => {
    if (!profile) return
    if (profile.net_income) setNetIncomeInput(String(Math.round(profile.net_income / 100)))
    const debitBase = recurringMonthly || (profile.monthly_debit_orders ? profile.monthly_debit_orders / 100 : 0)
    if (debitBase) setDebitOrdersInput(String(Math.round(debitBase)))
  }, [profile, recurringMonthly])

  useEffect(() => { loadTransactions() }, [user?.id, tier])
  // Persist scenario planning state across sessions.
  // Only meaningful state is persisted -- inputs derived from profile/ledger are not.
  useEffect(() => { lsSet('forecastMode', forecastMode) }, [forecastMode])
  useEffect(() => { lsSet('assumptions',  assumptions)  }, [assumptions])
  useEffect(() => { lsSet('horizonYears', horizonYears) }, [horizonYears])
  useEffect(() => { lsSet('customEvents', customEvents) }, [customEvents])

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

  const { avgVariableSpend, topVariableCategory, monthlyIncome } = useMemo(() => {
    const ledger = buildLedgerSummary(txns, profile, {
      preferDeclared: false,
      monthCount: countCalendarMonths(range.from, range.to) || undefined,
      dedup: true,
      debugLabel: 'Projections ' + range.from + '..' + range.to,
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

  const netIncome     = parseFloat(netIncomeInput)     || monthlyIncome || (profile?.net_income     ? profile.net_income / 100     : 0)
  const debitOrders   = parseFloat(debitOrdersInput)   || (profile?.monthly_debit_orders             ? profile.monthly_debit_orders / 100 : 0)
  const currentSavings= parseFloat(currentSavingsInput)|| 0

  const _projIssues = useMemo(() => {
    if (!netIncome || !avgVariableSpend) return []
    return validateProjectionInputs({ resolvedMonthlyIncome: monthlyIncome || 0 }, {
      netIncomeMonthly: netIncome, fixedMonthly: debitOrders, variableMonthly: avgVariableSpend,
    })
  }, [netIncome, debitOrders, avgVariableSpend, monthlyIncome])

  const monthlyFreeCashFlow   = netIncome - debitOrders - avgVariableSpend
  const optimisedVariableSpend= avgVariableSpend * 0.9
  const optimisedFreeCashFlow = netIncome - debitOrders - optimisedVariableSpend

  const projections = useMemo(() => {
    const current   = [currentSavings]
    const optimised = [currentSavings]
    for (let i = 1; i <= 12; i++) {
      current.push(current[i - 1]   + monthlyFreeCashFlow)
      optimised.push(optimised[i - 1] + optimisedFreeCashFlow)
    }
    return { current, optimised }
  }, [monthlyFreeCashFlow, optimisedFreeCashFlow, currentSavings])

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

  const customMonthlyProjection = useMemo(() => {
    if (customEvents.length === 0) return null
    const cy = new Date().getFullYear()
    let bonus = 0, extra = 0
    for (const ev of customEvents.filter(e => Number(e.year) === cy || Number(e.year) === cy + 1)) {
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

  const activeModel   = yearModels[forecastMode] || yearModels.current
  const finalNetWorth = activeModel[activeModel.length - 1]?.netWorth || 0
  const currentNW10   = yearModels.current[yearModels.current.length - 1]?.netWorth || 0

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 15 }, (_, i) => currentYear + i)

  async function interpretScenario() {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true)
    setAiError('')
    setAiExplanation('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/scenario-interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ prompt: aiPrompt, currentYear, netIncome, debitOrders, variableSpend: avgVariableSpend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to interpret scenario')
      const newEvents = (data.events || []).map(ev => ({ ...ev, id: Date.now() + Math.random() }))
      if (newEvents.length === 0) {
        setAiError('No events could be extracted. Try rephrasing -- e.g. "R600k bonus in 2027" or "buy a car for R400k in 2026".')
        return
      }
      setCustomEvents(prev => [...prev, ...newEvents])
      setAiExplanation(data.explanation || '')
      setAiPrompt('')
      setForecastMode('custom')
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  function addEvent() {
    const tmpl = EVENT_TEMPLATES.find(t => t.type === eventDraft.type) || EVENT_TEMPLATES[0]
    setCustomEvents(prev => [...prev, { ...eventDraft, income: tmpl.income, monthly: tmpl.monthly, id: Date.now() }])
    setShowEventForm(false)
    setEventDraft({ type: 'bonus', year: currentYear + 1, amount: '', description: '' })
  }

  return (
    <div className="proj-shell">
      <div className="proj-header">
        <h2 className="proj-title">Scenario Planning</h2>
        <p className="proj-sub">Model your financial future. All calculations are deterministic -- no AI maths.</p>
      </div>

      {_projIssues.length > 0 && (
        <div className="proj-integrity-notice">
          {_projIssues.map((issue, i) => <div key={i} className="proj-integrity-item">&#x26A0; {issue}</div>)}
        </div>
      )}

      <div className="proj-mode-tabs">
        {[['current','Current Path'],['optimised','Optimised Path'],['custom','Custom Scenario']].map(([mode, label]) => (
          <button key={mode} className={'proj-mode-tab' + (forecastMode === mode ? ' active' : '')}
            onClick={() => setForecastMode(mode)}>{label}</button>
        ))}
      </div>

      <p className="proj-mode-desc">
        {forecastMode === 'current'   && 'Your current spending trajectory -- no behaviour changes assumed.'}
        {forecastMode === 'optimised' && 'Applies bump. optimisation: 10% variable spend reduction, boosting free cash flow.'}
        {forecastMode === 'custom'    && 'Add life events -- bonuses, salary changes, purchases, school fees -- to build your own scenario.'}
      </p>

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

      <div className="proj-cards">
        <div className="proj-card">
          <div className="proj-card-lbl">Avg variable spend/mo</div>
          <div className="proj-card-val">{fmt(avgVariableSpend)}</div>
          <div className="proj-card-sub">last 3 months average</div>
        </div>
        <div className="proj-card">
          <div className="proj-card-lbl">Free cash flow</div>
          <div className={'proj-card-val ' + (monthlyFreeCashFlow >= 0 ? 'green' : 'red')}>
            {fmt(forecastMode === 'optimised' ? optimisedFreeCashFlow : monthlyFreeCashFlow)}/mo
          </div>
          <div className="proj-card-sub">income - fixed - variable</div>
        </div>
        <div className="proj-card proj-card-highlight">
          <div className="proj-card-lbl">{horizonYears}yr net worth</div>
          <div className={'proj-card-val ' + (finalNetWorth >= 0 ? 'green' : 'red')}>{fmt(finalNetWorth)}</div>
          <div className="proj-card-sub">{forecastMode} path</div>
        </div>
      </div>

      <div className="proj-annual-strip">
        <div className="proj-annual-item">
          <span className="proj-annual-lbl">Annual savings (current path)</span>
          <span className={'proj-annual-val ' + (annualSavingsCurrent >= 0 ? 'green' : 'red')}>{fmt(annualSavingsCurrent)}</span>
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

      <div className="proj-chart-card">
        <div className="proj-chart-head">
          <span className="proj-chart-title">12-month savings balance</span>
          <div className="proj-view-toggle">
            <button className={'proj-view-btn ' + (view === 'monthly' ? 'active' : '')} onClick={() => setView('monthly')}>Monthly</button>
            <button className={'proj-view-btn ' + (view === 'annual'  ? 'active' : '')} onClick={() => setView('annual')}>Quarterly</button>
          </div>
        </div>
        <div className="proj-chart-legend">
          <span className="proj-legend-dot" style={{ background: 'var(--coral)' }} /> Current
          <span className="proj-legend-dot" style={{ background: '#1D9E75', marginLeft: 12 }} /> Optimised
          {customMonthlyProjection && (
            <span><span className="proj-legend-dot" style={{ background: '#7F77DD', marginLeft: 12 }} /> Custom</span>
          )}
        </div>
        {loading ? (
          <div className="proj-loading"><div className="ai-spinner"><span /><span /><span /></div></div>
        ) : (
          <ProjectionChart currentPath={projections.current} optimisedPath={projections.optimised}
            customPath={customMonthlyProjection} view={view} />
        )}
      </div>

      <div className="proj-chart-card">
        <div className="proj-chart-head">
          <span className="proj-chart-title">Net worth trajectory</span>
          <div className="proj-view-toggle">
            {[5, 10, 15].map(y => (
              <button key={y} className={'proj-view-btn ' + (horizonYears === y ? 'active' : '')}
                onClick={() => setHorizonYears(y)}>{y}yr</button>
            ))}
          </div>
        </div>
        <div className="proj-chart-legend">
          <span className="proj-legend-dot" style={{ background: 'var(--coral)' }} /> Current
          <span className="proj-legend-dot" style={{ background: '#1D9E75', marginLeft: 12 }} /> Optimised
          {customEvents.length > 0 && (
            <span><span className="proj-legend-dot" style={{ background: '#7F77DD', marginLeft: 12 }} /> Custom</span>
          )}
        </div>
        <YearChart models={yearModels} />
      </div>

      <div className="proj-compare-section">
        <button className="proj-compare-toggle" onClick={() => setShowCompare(v => !v)}>
          <span className="proj-compare-toggle-title">Scenario comparison</span>
          <span className="proj-compare-toggle-hint">
            current vs optimised{customEvents.length > 0 ? ' vs custom' : ''}
          </span>
          <span className="proj-toggle-arrow">{showCompare ? '▲' : '▼'}</span>
        </button>
        {showCompare && <ScenarioComparisonPanel models={yearModels} horizonYears={horizonYears} />}
      </div>

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
              { key: 'salaryGrowth',    label: 'Annual salary growth (%)',       hint: 'Expected net income increase per year' },
              { key: 'inflation',       label: 'Inflation / cost of living (%)', hint: 'How fast your expenses grow annually'  },
              { key: 'investmentReturn',label: 'Investment return (%)',           hint: 'Annual return on savings balance'      },
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

      {forecastMode === 'custom' && (
        <div className="proj-events-panel">
          <div className="proj-events-head">
            <span className="proj-events-title">Life events</span>
            <button className="proj-add-event-btn" onClick={() => setShowEventForm(v => !v)}>+ Add manually</button>
          </div>

          <div className="proj-ai-prompt-section">
            <div className="proj-ai-prompt-label">Describe a scenario in plain English</div>
            <div className="proj-ai-prompt-row">
              <input
                className="proj-ai-prompt-input"
                placeholder='e.g. "R600k bonus in 2027" or "buy a car for R400k, sell current for R200k in 2026"'
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && interpretScenario()}
              />
              <button
                className={'proj-ai-prompt-btn' + (aiLoading ? ' loading' : '')}
                onClick={interpretScenario}
                disabled={!aiPrompt.trim() || aiLoading}
              >
                {aiLoading ? '...' : 'Interpret'}
              </button>
            </div>
            {aiError && <div className="proj-ai-prompt-error">{aiError}</div>}
            {aiExplanation && !aiError && (
              <div className="proj-ai-prompt-explanation">{aiExplanation}</div>
            )}
            <div className="proj-ai-prompt-hint">AI extracts structured events. All calculations stay deterministic.</div>
          </div>

          {showEventForm && (
            <div className="proj-event-form">
              <div className="proj-event-form-row">
                <select className="proj-event-select" value={eventDraft.type}
                  onChange={e => setEventDraft(d => ({ ...d, type: e.target.value }))}>
                  {EVENT_TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.icon} {t.label}</option>)}
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
              No events yet. Use the interpreter above or add manually. Try: "salary increase of R5k/mo in 2026" or "school fees start 2028".
            </p>
          )}

          {customEvents.map(ev => {
            const tmpl = EVENT_TEMPLATES.find(t => t.type === ev.type) || EVENT_TEMPLATES[0]
            return (
              <div key={ev.id} className="proj-event-item">
                <div className="proj-event-item-info">
                  <span className={'proj-event-year-badge ' + (ev.income ? 'income' : 'expense')}>{ev.year}</span>
                  <span className="proj-event-type-icon" aria-hidden="true">{tmpl.icon}</span>
                  <span className="proj-event-item-label">{ev.description || tmpl.label}</span>
                  <span className="proj-event-item-amount">
                    {ev.income ? '+' : '-'}{fmt(Number(ev.amount))}{ev.monthly ? '/mo' : ''}
                  </span>
                </div>
                <button className="proj-event-remove-btn"
                  onClick={() => setCustomEvents(prev => prev.filter(e => e.id !== ev.id))}>
                  \xd7
                </button>
              </div>
            )
          })}

          {customEvents.length > 0 && (
            <button className="proj-events-clear-btn"
              onClick={() => { setCustomEvents([]); setAiExplanation('') }}>
              Clear all events
            </button>
          )}
        </div>
      )}

      <div className="proj-table-section">
        <button className="proj-table-toggle" onClick={() => setShowYearTable(v => !v)}>
          <span className="proj-table-toggle-title">Year-by-year financial model</span>
          <span className="proj-table-toggle-hint">{forecastMode} path · {horizonYears} years</span>
          <span className="proj-toggle-arrow">{showYearTable ? '▲' : '▼'}</span>
        </button>
        {showYearTable && <YearlyTable model={activeModel} />}
      </div>

      <div className="proj-scenario-card">
        <div className="proj-scenario-title">
          {forecastMode === 'current' ? '\u{1F4C9}' : forecastMode === 'optimised' ? '\u{1F4C8}' : '\u{1F527}'}{' '}
          {forecastMode === 'current' ? 'Current path' : forecastMode === 'optimised' ? 'Optimised path' : 'Custom scenario'}
        </div>
        <p className="proj-scenario-text">
          {forecastMode === 'current' && (
            'Your current trajectory projects ' + fmt(annualSavingsCurrent) + ' saved per year. Variable spend averages ' + fmt(avgVariableSpend) + '/mo, led by ' + topVariableCategory + '. Over ' + horizonYears + ' years at ' + assumptions.salaryGrowth + '% salary growth and ' + assumptions.investmentReturn + '% investment returns, your net worth reaches ' + fmt(currentNW10) + '.'
          )}
          {forecastMode === 'optimised' && (
            'A 10% reduction in ' + topVariableCategory + ' saves ' + fmt((avgVariableSpend - optimisedVariableSpend) * 12) + ' per year. Over ' + horizonYears + ' years (' + assumptions.salaryGrowth + '% salary growth, ' + assumptions.investmentReturn + '% returns), your net worth reaches ' + fmt(yearModels.optimised[yearModels.optimised.length - 1]?.netWorth || 0) + ' -- ' + fmt(Math.abs((yearModels.optimised[yearModels.optimised.length - 1]?.netWorth || 0) - currentNW10)) + ' more than the current path.'
          )}
          {forecastMode === 'custom' && (customEvents.length === 0
            ? 'Add life events above to build your custom scenario.'
            : 'You have ' + customEvents.length + ' event(s) modelled. Your custom path projects a net worth of ' + fmt(yearModels.custom[yearModels.custom.length - 1]?.netWorth || 0) + ' in ' + horizonYears + ' years.'
          )}
        </p>
      </div>
    </div>
  )
}
