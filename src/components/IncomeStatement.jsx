import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchTransactionsByRange } from '../services/transactions'
import './IncomeStatement.css'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

function getPeriodDates(period) {
  const now = new Date()
  if (period === '1m') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
  }
  if (period === '3m') {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
  }
  if (period === '6m') {
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
  }
  // 12m default
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
}

function getComparisonDates(period, fromDate, toDate) {
  const from = new Date(fromDate)
  const to = new Date(toDate)
  const diffMs = to - from
  const compTo = new Date(from - 1)
  const compFrom = new Date(compTo - diffMs)
  return { from: compFrom.toISOString().slice(0, 10), to: compTo.toISOString().slice(0, 10) }
}

function buildStatement(txns) {
  const income = txns.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)
  const catTotals = {}
  txns.filter(t => t.category !== 'Income').forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount
  })
  const totalExpenses = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const net = income - totalExpenses
  return { income, catTotals, totalExpenses, net }
}

function DeltaCell({ current, previous }) {
  if (previous === undefined || previous === null) return <td />
  const delta = current - previous
  const pct = previous !== 0 ? Math.round((delta / Math.abs(previous)) * 100) : null
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : ''
  return (
    <td>
      <span className={`is-delta ${cls}`}>
        {delta > 0 ? '+' : ''}{fmt(delta)}{pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
      </span>
    </td>
  )
}

export default function IncomeStatement() {
  const { user, profile } = useAuth()
  const [period, setPeriod] = useState('12m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showComparison, setShowComparison] = useState(false)
  const [txns, setTxns] = useState([])
  const [compTxns, setCompTxns] = useState([])
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const { from, to } = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
    return getPeriodDates(period)
  }, [period, customFrom, customTo])

  const compDates = useMemo(() => getComparisonDates(period, from, to), [from, to])

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    Promise.all([
      fetchTransactionsByRange(user.id, from, to),
      showComparison ? fetchTransactionsByRange(user.id, compDates.from, compDates.to) : Promise.resolve([])
    ]).then(([main, comp]) => {
      setTxns(main || [])
      setCompTxns(comp || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [from, to, showComparison, compDates.from, compDates.to])

  const stmt = useMemo(() => buildStatement(txns), [txns])
  const compStmt = useMemo(() => showComparison ? buildStatement(compTxns) : null, [compTxns, showComparison])

  const PERIODS = [
    { id: '1m', label: '1 month' },
    { id: '3m', label: '3 months' },
    { id: '6m', label: '6 months' },
    { id: '12m', label: '12 months' },
    { id: 'custom', label: 'Custom' },
  ]

  const allCats = [...new Set([
    ...Object.keys(stmt.catTotals),
    ...(compStmt ? Object.keys(compStmt.catTotals) : [])
  ])].sort((a, b) => (stmt.catTotals[b] || 0) - (stmt.catTotals[a] || 0))

  async function generateAI() {
    setAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const top3 = allCats.slice(0, 3).map(c => `${c}: ${fmt(stmt.catTotals[c] || 0)}`).join(', ')
      const question = `Here is my income statement for the period ${from} to ${to}. Total income: ${fmt(stmt.income)}. Total expenses: ${fmt(stmt.totalExpenses)}. Net: ${fmt(stmt.net)}. Top categories: ${top3}.${compStmt ? ` Previous period net was ${fmt(compStmt.net)}, expenses ${fmt(compStmt.totalExpenses)}.` : ''} Give me 3-4 plain-text insights about movements and what to watch. Be specific with rand amounts.`
      const res = await fetch('/.netlify/functions/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ transactions: txns, question })
      })
      const data = await res.json()
      setAiText(data.analysis || '')
    } catch { setAiText('Could not generate insights. Please try again.') }
    setAiLoading(false)
  }

  return (
    <div className="is-shell">
      <div className="is-header">
        <h2 className="is-title">Income Statement</h2>
        <p className="is-sub">Auto-generated from your transaction history</p>
      </div>

      <div className="is-controls">
        {PERIODS.map(p => (
          <button key={p.id} className={`is-period-btn ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
        {period === 'custom' && (
          <div className="is-date-range">
            <input className="is-date-input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span>to</span>
            <input className="is-date-input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
        <label className="is-compare-toggle">
          <input type="checkbox" checked={showComparison} onChange={e => setShowComparison(e.target.checked)} />
          Compare to prior period
        </label>
      </div>

      {loading ? (
        <div className="is-loading"><div className="ai-spinner"><span/><span/><span/></div></div>
      ) : (
        <div className="is-table-card">
          <table className="is-table">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Line item</th>
                <th>{from} to {to}</th>
                {showComparison && <th>{compDates.from} to {compDates.to}</th>}
                {showComparison && <th>Change</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="is-section-head"><td colSpan={showComparison ? 4 : 2}>Income</td></tr>
              <tr>
                <td>Total income</td>
                <td><span className="is-val green">{fmt(stmt.income)}</span></td>
                {showComparison && <td><span className="is-val green">{fmt(compStmt?.income || 0)}</span></td>}
                {showComparison && <DeltaCell current={stmt.income} previous={compStmt?.income} />}
              </tr>

              <tr className="is-section-head"><td colSpan={showComparison ? 4 : 2}>Expenses</td></tr>
              {allCats.map(cat => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td>{fmt(stmt.catTotals[cat] || 0)}</td>
                  {showComparison && <td>{fmt(compStmt?.catTotals[cat] || 0)}</td>}
                  {showComparison && <DeltaCell current={stmt.catTotals[cat] || 0} previous={compStmt?.catTotals[cat] || 0} />}
                </tr>
              ))}
              <tr className="is-subtotal">
                <td>Total expenses</td>
                <td>{fmt(stmt.totalExpenses)}</td>
                {showComparison && <td>{fmt(compStmt?.totalExpenses || 0)}</td>}
                {showComparison && <DeltaCell current={stmt.totalExpenses} previous={compStmt?.totalExpenses} />}
              </tr>

              <tr className="is-total">
                <td>Net surplus / (deficit)</td>
                <td><span className={`is-val ${stmt.net >= 0 ? 'green' : 'red'}`}>{fmt(stmt.net)}</span></td>
                {showComparison && <td><span className={`is-val ${(compStmt?.net || 0) >= 0 ? 'green' : 'red'}`}>{fmt(compStmt?.net || 0)}</span></td>}
                {showComparison && <DeltaCell current={stmt.net} previous={compStmt?.net} />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && stmt.income === 0 && (profile?.net_income || 0) > 0 && (
        <div className="is-income-hint">
          No income transactions found for this period. Your declared take-home salary is R{Math.round(profile.net_income / 100).toLocaleString('en-ZA')}/mo — log a transaction categorised as &quot;Income&quot; to include it in this statement.
        </div>
      )}

      <div className="is-ai-card">
        <div className="is-ai-header">
          <span className="is-ai-label">AI interpretation</span>
          <button className="is-ai-btn" disabled={aiLoading || loading || !txns.length} onClick={generateAI}>
            {aiLoading ? 'Analysing...' : aiText ? 'Refresh' : 'Interpret movements'}
          </button>
        </div>
        {aiText
          ? <div className="is-ai-text">{aiText}</div>
          : <p className="is-ai-hint">Get an AI-generated interpretation of your income statement movements, period-on-period changes, and what to act on.</p>
        }
      </div>
    </div>
  )
}
