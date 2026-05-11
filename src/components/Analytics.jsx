import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed } from '../context/TierContext'
import { fetchTransactionsByRange } from '../services/transactions'
import { buildLedgerSummary } from '../utils/ledger'
import { buildAIPayload } from '../utils/financials'
import { analyseSpending, recategoriseAll } from '../services/ai'
import { supabase } from '../supabase'
import './Analytics.css'

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

const PERIODS = [
  { id: '1m',  label: '1 month' },
  { id: '3m',  label: '3 months' },
  { id: '6m',  label: '6 months' },
  { id: '12m', label: '12 months' },
  { id: 'custom', label: 'Custom' },
]

const CAT_COLORS = {
  Groceries:        '#4caf50',
  'Eating out':     '#ff7043',
  Transport:        '#2196f3',
  Entertainment:    '#9c27b0',
  Health:           '#e91e63',
  Subscriptions:    '#00bcd4',
  Fuel:             '#ff9800',
  Insurance:        '#607d8b',
  Utilities:        '#795548',
  Clothing:         '#f48fb1',
  Savings:          '#43a047',
  Education:        '#1565c0',
  Housing:          '#4e342e',
  Travel:           '#0288d1',
  'ATM / Cash':     '#78909c',
  'Fees & Charges': '#b71c1c',
  'Home & Garden':  '#558b2f',
  Gifts:            '#ad1457',
  Other:            '#9e9e9e',
}

function getDateRange(period, customFrom, customTo) {
  if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const starts = {
    '1m':  new Date(now.getFullYear(), now.getMonth(), 1),
    '3m':  new Date(now.getFullYear(), now.getMonth() - 2, 1),
    '6m':  new Date(now.getFullYear(), now.getMonth() - 5, 1),
    '12m': new Date(now.getFullYear(), now.getMonth() - 11, 1),
  }
  return { from: (starts[period] || starts['1m']).toISOString().slice(0, 10), to }
}

// Lightweight SVG bar chart — no external dependency
function MonthlyBars({ data }) {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.spend]), 1)
  const H = 140, BAR_W = 18, GAP = 6, PAD_L = 36, PAD_B = 22
  const slotW = BAR_W * 2 + GAP + 12
  const W = PAD_L + data.length * slotW + 8
  const barH = (v) => Math.max((v / maxVal) * H, v > 0 ? 3 : 0)
  const fmt_k = v => v >= 1000 ? `R${(v/1000).toFixed(0)}k` : `R${v}`
  return (
    <svg viewBox={`0 0 ${W} ${H + PAD_B + 4}`} width="100%" style={{display:'block',overflow:'visible'}}>
      {/* Y-axis guides */}
      {[0, 0.5, 1].map(f => {
        const y = H - f * H
        return <g key={f}>
          <line x1={PAD_L - 4} y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth={1} />
          <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--muted)">{fmt_k(Math.round(f * maxVal))}</text>
        </g>
      })}
      {data.map((d, i) => {
        const x = PAD_L + i * slotW
        const ih = barH(d.income)
        const sh = barH(d.spend)
        return (
          <g key={d.month}>
            <rect x={x} y={H - ih} width={BAR_W} height={ih} fill="var(--success)" rx={3} />
            <rect x={x + BAR_W + GAP} y={H - sh} width={BAR_W} height={sh} fill="var(--coral)" rx={3} />
            <text x={x + BAR_W} y={H + PAD_B - 4} textAnchor="middle" fontSize={10} fill="var(--muted)">{d.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Analytics() {
  const { user, profile } = useAuth()
  const tier = useTier()

  const [period, setPeriod]         = useState('3m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [txns, setTxns]             = useState([])
  const [budgets, setBudgets]       = useState({})
  const [loading, setLoading]       = useState(false)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [recat, setRecat]           = useState({ loading: false, result: null })

  const { from, to } = useMemo(
    () => getDateRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  )

  useEffect(() => {
    if (!from || !to || !user) return
    setLoading(true)
    setAiText('')
    Promise.all([
      fetchTransactionsByRange(user.id, from, to),
      supabase.from('budgets').select('category, amount').eq('user_id', user.id),
    ]).then(([txnData, { data: budgetRows }]) => {
      setTxns((txnData || []).filter(t => isDateAllowed(t.date, tier)))
      if (budgetRows) {
        const bmap = {}
        budgetRows.forEach(b => { bmap[b.category] = b.amount })
        setBudgets(bmap)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [from, to, user, tier])

  // ── Single source of truth ─────────────────────────────────────────────────
  const ledger = useMemo(
    () => buildLedgerSummary(txns, profile, { preferDeclared: false }),
    [txns, profile]
  )

  // Spend by category — sorted desc, top 12
  const catData = useMemo(() =>
    Object.entries(ledger.catTotals)
      .map(([cat, amount]) => ({ cat, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12),
    [ledger.catTotals]
  )
  const maxCat = catData[0]?.amount || 1

  // Monthly trend — sorted by month for recharts
  const monthlyChartData = useMemo(() =>
    Object.entries(ledger.monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month: month.slice(5),            // "MM"
        spend:  Math.round(d.spend  || 0),
        income: Math.round(d.income || 0),
      })),
    [ledger.monthlyData]
  )

  // Top merchants — group spendTxns by name, sum amounts
  const topMerchants = useMemo(() => {
    const map = {}
    ledger.spendTxns.forEach(t => {
      const key = t.name || t.description || 'Unknown'
      if (!map[key]) map[key] = { name: key, category: t.category, total: 0, count: 0 }
      map[key].total += t.amount
      map[key].count++
    })
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [ledger.spendTxns])

  // Budget vs actual — only categories with spend or a budget
  const budgetRows = useMemo(() => {
    const cats = new Set([...Object.keys(budgets), ...Object.keys(ledger.catTotals)])
    return [...cats]
      .map(cat => ({
        cat,
        budget: budgets[cat] || 0,
        spent:  Math.round(ledger.catTotals[cat] || 0),
      }))
      .filter(r => r.budget > 0)
      .sort((a, b) => b.budget - a.budget)
  }, [budgets, ledger.catTotals])

  async function handleAI() {
    setAiLoading(true)
    try {
      const top3 = catData.slice(0, 3).map(c => `${c.cat}: ${fmt(c.amount)}`).join(', ')
      const question = `Analytics for ${from} to ${to}. Spend: ${fmt(ledger.totalSpend)}, Income: ${fmt(ledger.income)}, Net: ${fmt(ledger.net)}. Top categories: ${top3}. What patterns stand out and what should I act on?`
      const payload = buildAIPayload(txns, profile, 200, {
        mode: 'analytics',
        monthlyData: ledger.monthlyData,
        question,
      })
      const data = await analyseSpending(payload)
      setAiText(data.analysis || '')
    } catch (e) { setAiText(e.message || 'Could not generate insights. Please try again.') }
    setAiLoading(false)
  }

  async function handleRecat() {
    setRecat({ loading: true, result: null })
    try {
      const result = await recategoriseAll()
      setRecat({ loading: false, result })
      // Reload transactions so the new categories are visible immediately
      const txnData = await fetchTransactionsByRange(user.id, from, to)
      setTxns((txnData || []).filter(t => isDateAllowed(t.date, tier)))
    } catch (e) {
      setRecat({ loading: false, result: { error: e.message } })
    }
  }

  const hasTxns = ledger.spendTxns.length > 0

  return (
    <div className="analytics-shell">

      {/* Period selector */}
      <div className="period-bar">
        {PERIODS.map(p => (
          <button
            key={p.id}
            className={`period-pill ${period === p.id ? 'active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >{p.label}</button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="custom-range">
          <input className="date-input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="custom-range-to">to</span>
          <input className="date-input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* Re-categorise strip */}
      <div className="recat-strip">
        <span className="recat-hint">Categories look wrong?</span>
        <button className="recat-btn" onClick={handleRecat} disabled={recat.loading}>
          {recat.loading ? 'Re-categorising…' : 'Re-categorise all'}
        </button>
        {recat.result && !recat.result.error && (
          <span className="recat-done">
            {recat.result.changed} of {recat.result.processed} updated
          </span>
        )}
        {recat.result?.error && (
          <span className="recat-err">Failed — try again</span>
        )}
      </div>

      {loading ? (
        <div className="analytics-loading">
          <div className="ai-spinner"><span /><span /><span /></div>
          <p>Loading transactions…</p>
        </div>
      ) : !hasTxns ? (
        <div className="analytics-empty">
          <div className="empty-icon">📊</div>
          <p>No spend transactions found for this period.<br />Import your bank statement to see analytics.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="summary-strip">
            <div className="summary-item">
              <span className="summary-val red">{fmt(ledger.totalSpend)}</span>
              <span className="summary-lbl">spent</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <span className="summary-val green">{fmt(ledger.income)}</span>
              <span className="summary-lbl">income</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <span className={`summary-val ${ledger.net >= 0 ? 'green' : 'red'}`}>{fmt(ledger.net)}</span>
              <span className="summary-lbl">net</span>
            </div>
          </div>

          {/* 1 — Spend by category */}
          <div className="a-card">
            <div className="a-card-head">
              <span className="a-card-title">Spend by category</span>
              <span className="a-card-sub">{from} – {to}</span>
            </div>
            <div className="cat-bar-list">
              {catData.map(({ cat, amount }) => (
                <div key={cat} className="cat-bar-row">
                  <div className="cat-bar-label">{cat}</div>
                  <div className="cat-bar-track">
                    <div
                      className="cat-bar-fill"
                      style={{
                        width: `${Math.max((amount / maxCat) * 100, 2)}%`,
                        background: CAT_COLORS[cat] || 'var(--coral)',
                      }}
                    />
                  </div>
                  <div className="cat-bar-amt">{fmt(amount)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2 — Monthly trend (only when multiple months) */}
          {monthlyChartData.length > 1 && (
            <div className="a-card">
              <div className="a-card-head">
                <span className="a-card-title">Monthly trend</span>
                <span className="a-card-sub">{ledger.monthCount} months</span>
              </div>
              <MonthlyBars data={monthlyChartData} />
              <div className="chart-legend">
                <span className="legend-pip" style={{ background: 'var(--success)' }} /> Income
                <span className="legend-pip" style={{ background: 'var(--coral)', marginLeft: 12 }} /> Spend
              </div>
            </div>
          )}

          {/* 3 — Top merchants */}
          <div className="a-card">
            <div className="a-card-head">
              <span className="a-card-title">Top merchants</span>
              <span className="a-card-sub">by total spend</span>
            </div>
            <div className="merchant-list">
              {topMerchants.map((m, i) => (
                <div key={m.name} className="merchant-row">
                  <span className="merchant-rank">{i + 1}</span>
                  <div className="merchant-info">
                    <span className="merchant-name">{m.name}</span>
                    <span className="merchant-cat-badge" style={{ background: CAT_COLORS[m.category] || '#9e9e9e' }}>
                      {m.category}
                    </span>
                  </div>
                  <div className="merchant-right">
                    <span className="merchant-amt">{fmt(m.total)}</span>
                    <span className="merchant-count">{m.count}×</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4 — Budget vs actual */}
          {budgetRows.length > 0 && (
            <div className="a-card">
              <div className="a-card-head">
                <span className="a-card-title">Budget vs actual</span>
                <span className="a-card-sub">this period</span>
              </div>
              <div className="bva-list">
                {budgetRows.map(({ cat, budget, spent }) => {
                  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
                  const over = spent > budget
                  return (
                    <div key={cat} className="bva-row">
                      <div className="bva-labels">
                        <span className="bva-cat">{cat}</span>
                        <span className={`bva-amt ${over ? 'over' : ''}`}>
                          {fmt(spent)} / {fmt(budget)}
                        </span>
                      </div>
                      <div className="bva-track">
                        <div
                          className="bva-fill"
                          style={{
                            width: `${Math.max(pct, spent > 0 ? 2 : 0)}%`,
                            background: over ? 'var(--coral)' : 'var(--success)',
                          }}
                        />
                      </div>
                      {over && (
                        <span className="bva-over-tag">{fmt(spent - budget)} over</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI interpretation */}
          <div className="a-card">
            <div className="a-card-head">
              <span className="a-card-title">AI interpretation</span>
              <button className="suggest-btn" disabled={aiLoading} onClick={handleAI}>
                {aiLoading ? 'Analysing…' : aiText ? 'Refresh' : 'Interpret this period'}
              </button>
            </div>
            {aiText
              ? <div className="suggest-msg">{aiText}</div>
              : <p className="ai-hint-text">Get an AI read of your spending patterns, what changed, and what to act on.</p>
            }
          </div>
        </>
      )}
    </div>
  )
}
