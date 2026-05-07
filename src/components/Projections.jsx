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
    .filter((_, i) => (i + 1) % 3 === 0)

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
      <path d={linePath('optimised')} fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="5,3" strokeLinejoin="round" />
      <path d={linePath('current')} fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => {
        if (data.length > 6 && i % 2 !== 0) return null
        return (
          <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="var(--muted)">{d.month}</text>
        )
      })}
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

  const [netIncomeInput, setNetIncomeInput] = useState('')
  const [debitOrdersInput, setDebitOrdersInput] = useState('')
  const [currentSavingsInput, setCurrentSavingsInput] = useState('')

  const [dcfInsights, setDcfInsights] = useState('')
  const [dcfLoading, setDcfLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      if (profile.net_income) setNetIncomeInput(String(Math.round(profile.net_income / 100)))
      if (profile.monthly_debit_orders) setDebitOrdersInput(String(Math.round(profile.monthly_debit_orders / 100)))
    }
  }, [profile])

  useEffect(() => { loadTransactions() }, [])

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

  const { avgVariableSpend, topVariableCategory, monthlyIncome, dataLabel } = useMemo(() => {
    if (!txns.length) {
      return { avgVariableSpend: 0, topVariableCategory: 'Other', monthlyIncome: 0, dataLabel: null }
    }

    const allMonths = [...new Set(txns.map(t => t.date.slice(0, 7)))].sort()
    const recentMonths = allMonths.slice(-3)
    const numMonths = recentMonths.length

    let dataLabel
    if (numMonths === 1) {
      const [y, m] = recentMonths[0].split('-').map(Number)
      dataLabel = new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    } else {
      const [fy, fm] = recentMonths[0].split('-').map(Number)
      const [ty, tm] = recentMonths[numMonths - 1].split('-').map(Number)
      const fromLabel = new Date(fy, fm - 1, 1).toLocaleDateString('en-ZA', { month: 'short' })
      const toLabel   = new Date(ty, tm - 1, 1).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
      dataLabel = fromLabel + '–' + toLabel
    }

    const filteredTxns = txns.filter(t => recentMonths.includes(t.date.slice(0, 7)))

    const income = filteredTxns.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0) / numMonths
    const variableCategories = ['Groceries', 'Eating out', 'Entertainment', 'Clothing', 'Health', 'Transport', 'Fuel', 'Other']
    const varSpend = {}
    for (const t of filteredTxns) {
      if (variableCategories.includes(t.category)) {
        varSpend[t.category] = (varSpend[t.category] || 0) + t.amount
      }
    }
    const totalVar = Object.values(varSpend).reduce((s, v) => s + v, 0) / numMonths
    const topCat = Object.entries(varSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'
    return { avgVariableSpend: totalVar / 100, topVariableCategory: topCat, monthlyIncome: income / 100, dataLabel }
  }, [txns])

  const netIncome = parseFloat(netIncomeInput) || monthlyIncome || (profile?.net_income ? profile.net_income / 100 : 0)
  const debitOrders = parseFloat(debitOrdersInput) || (profile?.monthly_debit_orders ? profile.monthly_debit_orders / 100 : 0)
  const currentSavings = parseFloat(currentSavingsInput) || 0

  const monthlyFreeCashFlow = netIncome - debitOrders - avgVariableSpend
  const optimisedVariableSpend = avgVariableSpend * 0.9
  const optimisedFreeCashFlow = netIncome - debitOrders - optimisedVariableSpend

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

  if (!loading && !txns.length) {
    return (
      <div className="proj-shell">
        <div className="proj-header">
          <h2 className="proj-title">Cash flow projections</h2>
        </div>
        <div className="proj-empty">
          <div className="proj-empty-icon">📈</div>
          <p className="proj-empty-title">No data yet</p>
          <p className="proj-empty-sub">
            Import a bank statement or add some transactions to see your 12-month cash flow projections.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="proj-shell">
      <div className="proj-header">
        <h2 className="proj-title">Cash flow projections</h2>
        <p className="proj-sub">
          {dataLabel ? `Based on your ${dataLabel} spending.` : 'Calculating from your transaction history…'}
        </p>
      </div>

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

      <div className="proj-cards">
        <div className="proj-card">
          <div className="proj-card-lbl">Avg variable spend/mo</div>
          <div className="proj-card-val">{fmt(avgVariableSpend)}</div>
          <div className="proj-card-sub">based on {dataLabel || 'recent history'}</div>
        </div>
        <div className="proj-card">
          <div className="proj-card-lbl">Current free cash flow</div>
          <div className={`proj-card-val ${monthlyFreeCashFlow >= 0 ? 'green' : 'red'}`}>{fmt(monthlyFreeCashFlow)}/mo</div>
          <div className="proj-card-sub">income &minus; fixed &minus; variable</div>
        </div>
        <div className="proj-card proj-card-highlight">
          <div className="proj-card-lbl">With bump. suggestions</div>
          <div className="proj-card-val green">{fmt(optimisedFreeCashFlow)}/mo</div>
          <div className="proj-card-sub">10% cut in {topVariableCategory}</div>
        </div>
      </div>

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

      <div className="proj-scenario-card">
        <div className="proj-scenario-title">📉 What the optimised scenario assumes</div>
        <p className="proj-scenario-text">
          A 10% reduction in your top variable spending category (<strong>{topVariableCategory}</strong>),
          saving you <strong>{fmt((avgVariableSpend - optimisedVariableSpend) * 12)}</strong> per year.
          This could mean one less takeaway per week, switching one grocery shop to a cheaper store,
          or reviewing your subscription stack.
        </p>
      </div>

      <div className="proj-ai-card">
        <div className="proj-ai-header">
          <span className="proj-ai-label">AI projection insights</span>
          <button
            className="proj-ai-btn"
            disabled={dcfLoading || loading}
            onClick={async () => {
              setDcfLoading(true)
              try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) return
                const question = `Based on my cash flow projections: monthly income ${fmt(netIncome)}, fixed debit orders ${fmt(debitOrders)}, average variable spend ${fmt(avgVariableSpend)}, monthly free cash flow ${fmt(monthlyFreeCashFlow)}, top spending category "${topVariableCategory}". Give me 3-4 specific, plain-text insights about my projection. Include what savings milestone I might reach and when. Be concrete with rand amounts and timeframes.`
                const res = await fetch('/.netlify/functions/analyse', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                  body: JSON.stringify({ transactions: txns, question })
                })
                const data = await res.json()
                setDcfInsights(data.analysis || '')
              } catch { setDcfInsights('Could not load insights. Please try again.') }
              finally { setDcfLoading(false) }
            }}
          >
            {dcfLoading ? 'Analysing...' : dcfInsights ? 'Refresh' : 'Generate insights'}
          </button>
        </div>
        {dcfInsights
          ? <div className="proj-ai-text">{dcfInsights}</div>
          : <p className="proj-ai-hint">Get Claude's take on your projections - savings milestones, key drag categories, and optimisation opportunities.</p>
        }
      </div>
    </div>
  )
}
