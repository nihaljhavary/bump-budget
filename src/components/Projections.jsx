import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchTransactionsByRange } from '../services/transactions'
import './Projections.css'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const fmtC = n => 'R' + Math.round(n / 100).toLocaleString('en-ZA')

function getMonthLabel(monthsFromNow) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthsFromNow)
  return d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })
}

function ProjectionChart({ currentPath, optimisedPath, view }) {
  const data = view === 'monthly'
    ? currentPath.map((v, i) => ({ month: getMonthLabel(i), current: v, optimised: optimisedPath[i] }))
    : currentPath.map((v, i) => ({ month: getMonthLabel(i), current: v, optimised: optimisedPath[i] }))
    .filter((_, i) => (i + 1) % 3 === 0)  // quarterly points for annual

  const allVals = data.flatMap(d => [d.current, d.optimised]).filter(v => !isNaN(v))
  const minVal = Math.min(...allVals, 0)
  const maxVal = Math.max(...allVals, 1)
  const range = maxVal - minVal || 1

  const W = 340, H = 160
  const PAD = { top: 16, right: 12, bottom: 28, left: 52 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const xPos = i => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
  const yPos = v => PAD.top + innerH - ((v - minVal) / range) * innerH
  const linePath = key => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d[key]).toFixed(1)}`).join(' ')

  const yTicks = [0, 0.5, 1].map(f => {
    const val = minVal + f * range
    return { val, y: yPos(val) }
  })

  const zeroY = yPos(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="proj-svg">
      {/* Zero line */}
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
      {/* Optimised path (green, dashed) */}
      <path d={linePath('optimised')} fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="5,3" strokeLinejoin="round" />
      {/* Current path */}
      <path d={linePath('current')} fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinejoin="round" />
      {/* Month labels */}
      {data.map((d, i) => {
        if (data.length > 6 && i % 2 !== 0) return null
        return (
          <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="var(--muted)">{d.month}</text>
        )
      })}
      {/* Dots */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xPos(i)} cy={yPos(d.current)} r="2.5" fill="var(--coral)" />
          <circle cx={xPos(i)} cy={yPos(d.optimised)} r="2" fill="#1D9E75" />
        </g>
      ))}
    </svg>
  )
}

export default function Projections() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [txns, setTxns] = useState([])
  const [view, setView] = useState('monthly')

  // Manual override inputs (in Rands)
  const [netIncomeInput, setNetIncomeInput] = useState('')
  const [debitOrdersInput, setDebitOrdersInput] = useState('')
  const [currentSavingsInput, setCurrentSavingsInput] = useState('')

  useEffect(() => {
    // Pre-fill from profile
    if (profile) {
      if (profile.net_income) setNetIncomeInput(String(Math.round(profile.net_income / 100)))
      if (profile.monthly_debit_orders) setDebitOrdersInput(String(Math.round(profile.monthly_debit_orders / 100)))
    }
  }, [profile])

  useEffect(() => {
    loadTransactions()
  }, [])

  async function loadTransactions() {
    setLoading(true)
    try {
      const to = new Date().toISOString().split('T')[0]
      const from = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().split('T')[0]
      const data = await fetchTransactionsByRange(user.id, from, to)
      setTxns(data || [])
    } catch (err) {
      console.error('Projections load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate averages from last 3 months of transactions
  const { avgVariableSpend, topVariableCategory, monthlyIncome } = useMemo(() => {
    const now = new Date()
    const last3Months = txns.filter(t => {
      const d = new Date(t.date)
      return (now - d) / (1000 * 60 * 60 * 24) <= 92
    })
    const income = last3Months.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0) / 3
    const variableCategories = ['Groceries', 'Eating out', 'Entertainment', 'Clothing', 'Health', 'Transport', 'Fuel', 'Other']
    const varSpend = {}
    for (const t of last3Months) {
      if (variableCategories.includes(t.category)) {
        varSpend[t.category] = (varSpend[t.category] || 0) + t.amount
      }
    }
    const totalVar = Object.values(varSpend).reduce((s, v) => s + v, 0) / 3
    const topCat = Object.entries(varSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'
    return { avgVariableSpend: totalVar / 100, topVariableCategory: topCat, monthlyIncome: income / 100 }
  }, [txns])

  const netIncome = parseFloat(netIncomeInput) || monthlyIncome || (profile?.net_income ? profile.net_income / 100 : 0)
  const debitOrders = parseFloat(debitOrdersInput) || (profile?.monthly_debit_orders ? profile.monthly_debit_orders / 100 : 0)
  const currentSavings = parseFloat(currentSavingsInput) || 0

  const monthlyFreeCashFlow = netIncome - debitOrders - avgVariableSpend
  const optimisedVariableSpend = avgVariableSpend * 0.9  // 10% reduction
  const optimisedFreeCashFlow = netIncome - debitOrders - optimisedVariableSpend

  // Build 12-month projection of savings balance
  const projections = useMemo(() => {
    const current = [currentSavings]
    const optimised = [currentSavings]
    for (let i = 1; i <= 12; i++) {
      current.push(current[i - 1] + monthlyFreeCashFlow)
      optimised.push(optimised[i - 1] + optimisedFreeCashFlow)
    }
    return { current, optimised }
  }, [monthlyFreeCashFlow, optimisedFreeCashFlow, currentSavings])

  const annualSavingsCurrent = monthlyFreeCashFlow * 12
  const annualSavingsOptimised = optimisedFreeCashFlow * 12
  const monthsToSavingsGoal = profile?.savings_goal && monthlyFreeCashFlow > 0
    ? Math.ceil((profile.savings_goal / 100) / monthlyFreeCashFlow)
    : null

  return (
    <div className="proj-shell">
      <div className="proj-header">
        <h2 className="proj-title">Cash flow projections</h2>
        <p className="proj-sub">Based on your last 3 months of spending.</p>
      </div>

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
          <label className="proj-input-lbl">Fixed debit orders</label>
          <div className="proj-input-wrap">
            <span className="proj-prefix">R</span>
            <input className="proj-input" type="number" placeholder="0"
              value={debitOrdersInput} onChange={e => setDebitOrdersInput(e.target.value)} />
          </div>
        </div>
        <div className="proj-input-group">
          <label className="proj-input-lbl">Current savings balance</label>
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
          <div className="proj-card-lbl">Current free cash flow</div>
          <div className={`proj-card-val ${monthlyFreeCashFlow >= 0 ? 'green' : 'red'}`}>{fmt(monthlyFreeCashFlow)}/mo</div>
          <div className="proj-card-sub">income − fixed − variable</div>
        </div>
        <div className="proj-card proj-card-highlight">
          <div className="proj-card-lbl">With bump. suggestions</div>
          <div className="proj-card-val green">{fmt(optimisedFreeCashFlow)}/mo</div>
          <div className="proj-card-sub">10% cut in {topVariableCategory}</div>
        </div>
      </div>

      {/* Annual view */}
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
            <span className="proj-annual-lbl">Months to reach savings goal ({fmtC(profile.savings_goal)})</span>
            <span className="proj-annual-val">{monthsToSavingsGoal} months</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="proj-chart-card">
        <div className="proj-chart-head">
          <span className="proj-chart-title">12-month savings balance</span>
          <div className="proj-view-toggle">
            <button className={`proj-view-btn ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
            <button className={`proj-view-btn ${view === 'annual' ? 'active' : ''}`} onClick={() => setView('annual')}>Quarterly</button>
          </div>
        </div>
        <div className="proj-chart-legend">
          <span className="proj-legend-dot" style={{ background: 'var(--coral)' }} /> Current path
          <span className="proj-legend-dot" style={{ background: '#1D9E75', marginLeft: 12 }} /> With optimisation
        </div>
        {loading ? (
          <div className="proj-loading">
            <div className="ai-spinner"><span /><span /><span /></div>
          </div>
        ) : (
          <ProjectionChart
            currentPath={projections.current}
            optimisedPath={projections.optimised}
            view={view}
          />
        )}
      </div>

      {/* Scenario explanation */}
      <div className="proj-scenario-card">
        <div className="proj-scenario-title">📉 What the optimised scenario assumes</div>
        <p className="proj-scenario-text">
          A 10% reduction in your top variable spending category (<strong>{topVariableCategory}</strong>),
          saving you <strong>{fmt((avgVariableSpend - optimisedVariableSpend) * 12)}</strong> per year.
          This could mean one less takeaway per week, switching one grocery shop to a cheaper store,
          or reviewing your subscription stack.
        </p>
      </div>
    </div>
  )
}
