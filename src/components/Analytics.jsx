import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed } from '../context/TierContext'
import { fetchTransactionsByRange } from '../services/transactions'
import { buildLedgerSummary, countCalendarDays } from '../utils/ledger'
import { buildAIPayload, buildTopMerchants } from '../utils/financials'
import { buildAiBudgets } from '../utils/budgets'
import { analyseSpending, recategoriseAll } from '../services/ai'
import { supabase } from '../supabase'
import './Analytics.css'
import IncomeStatement from './IncomeStatement'

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

function buildPeriodLabel(period, from, to, monthCount) {
  if (period === 'custom') return `${from} to ${to}`
  if (period === '1m') {
    const [y, m] = from.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  }
  return `last ${monthCount} month${monthCount !== 1 ? 's' : ''}`
}


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

export default function Analytics({ preferDeclared = true }) {
  const { user, profile } = useAuth()
  const tier = useTier()

  const [period, setPeriod]           = useState('3m')
  const [showIncomeStatement, setShowIncomeStatement] = useState(false)
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [txns, setTxns]               = useState([])
  const [userBudgets, setUserBudgets] = useState({})
  const [loading, setLoading]         = useState(false)
  const [aiText, setAiText]           = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [recat, setRecat]             = useState({ loading: false, result: null })
  const aiAbortRef = useRef(null)
  const [editBudget, setEditBudget]   = useState(null)   // { cat, value } when editing inline
  const [budgetMode, setBudgetMode]   = useState(() => {
    try { return localStorage.getItem('bumpBudgetMode') || 'my' } catch { return 'my' }
  })

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
        setUserBudgets(bmap)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [from, to, user, tier])

  async function saveBudget(cat, rawValue) {
    const amount = Math.round(parseFloat(rawValue) || 0)
    setEditBudget(null)
    if (amount <= 0) return
    setUserBudgets(prev => ({ ...prev, [cat]: amount }))
    try {
      await supabase.from('budgets').upsert(
        { user_id: user.id, category: cat, amount },
        { onConflict: 'user_id,category' }
      )
    } catch (e) { console.error('[bump] budget save failed', e) }
  }

  function handleBudgetModeChange(mode) {
    setBudgetMode(mode)
    try { localStorage.setItem('bumpBudgetMode', mode) } catch {}
  }

  // Explicit month count for standard period buttons.
  // Custom ranges don't have a clean monthCount; use periodDays instead.
  const periodMonthCount = useMemo(() => {
    if (period === 'custom') return null
    return { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period] ?? 1
  }, [period])

  // Calendar days — only computed (and used for income proration) on custom ranges.
  // Standard periods use monthCount×declared so Overview and Analytics stay in sync.
  const periodDays = useMemo(() => {
    if (period === 'custom') return countCalendarDays(from, to)
    return null
  }, [period, from, to])

  // Canonical ledger -- single source of truth
  const ledger = useMemo(
    () => buildLedgerSummary(txns, profile, {
      preferDeclared,
      periodDays,               // non-null only for custom ranges
      monthCount: periodMonthCount ?? undefined,
      from,
      to,
    }),
    [txns, profile, preferDeclared, periodDays, periodMonthCount, from, to]
  )

  const catData = useMemo(() =>
    Object.entries(ledger.catTotals)
      .map(([cat, amount]) => ({ cat, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12),
    [ledger.catTotals]
  )
  const maxCat = catData[0]?.amount || 1

  const monthlyChartData = useMemo(() =>
    Object.entries(ledger.monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month:  month.slice(5),
        spend:  Math.round(d.spend  || 0),
        income: Math.round(d.income || 0),
      })),
    [ledger.monthlyData]
  )

  // Top merchants from spend transactions
  const topMerchants = useMemo(
    () => buildTopMerchants(ledger.spendTxns, 15),
    [ledger.spendTxns]
  )

  // AI-suggested budgets from rolling averages (85% of avg spend)
  // AI-suggested budgets: 85% of avg spend for the selected period.
  // Formula is canonical via buildAiBudgets() -- same rule used in Dashboard.jsx.
  const aiSuggestedBudgets = useMemo(
    () => buildAiBudgets(ledger.catTotals, ledger.monthCount),
    [ledger.catTotals, ledger.monthCount]
  )

  const activeBudgets = budgetMode === 'ai' ? aiSuggestedBudgets : userBudgets

  const budgetRows = useMemo(() => {
    const cats = new Set([...Object.keys(activeBudgets), ...Object.keys(ledger.catTotals)])
    return [...cats]
      .map(cat => ({
        cat,
        budget: activeBudgets[cat] || 0,
        spent:  Math.round(ledger.catTotals[cat] || 0),
      }))
      .filter(r => r.budget > 0)
      .sort((a, b) => b.budget - a.budget)
  }, [activeBudgets, ledger.catTotals])

  const periodLabel = useMemo(
    () => buildPeriodLabel(period, from, to, ledger.monthCount),
    [period, from, to, ledger.monthCount]
  )

  async function handleAI() {
    if (aiAbortRef.current) aiAbortRef.current.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller

    setAiLoading(true)
    try {
      const payload = buildAIPayload(txns, profile, 200, {
        mode:                 'analytics',
        monthlyData:          ledger.monthlyData,
        topMerchants,
        incomeResolutionMode: ledger.incomeResolutionMode,
        effectiveIncome:      ledger.income,
        periodDays,
        periodLabel,
        budgets:              activeBudgets,
      })
      const data = await analyseSpending(payload, { signal: controller.signal })
      if (!controller.signal.aborted) setAiText(data.analysis || '')
    } catch (e) {
      if (!controller.signal.aborted) setAiText(e.message || 'Could not generate insights. Please try again.')
    } finally {
      if (!controller.signal.aborted) setAiLoading(false)
    }
  }

  // Abort in-flight AI call on unmount
  useEffect(() => () => { if (aiAbortRef.current) aiAbortRef.current.abort() }, [])

  async function handleRecat() {
    setRecat({ loading: true, result: null })
    try {
      const result = await recategoriseAll()
      setRecat({ loading: false, result })
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
          <span className="recat-done">{recat.result.changed} of {recat.result.processed} updated</span>
        )}
        {recat.result?.error && <span className="recat-err">Failed — try again</span>}
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
          {/* Income resolution badge */}
          {ledger.incomeResolutionMode && (
            <div className="income-mode-badge">
              <span className="income-mode-dot" />
              <span className="income-mode-label">
                {ledger.incomeResolutionMode === 'declared_prorated' && period === 'custom'
                  ? `Declared salary prorated over ${periodDays} days`
                  : ledger.incomeResolutionMode === 'transaction_derived'
                    ? 'Income from logged transactions'
                    : ledger.incomeResolutionMode === 'blended'
                      ? 'Declared salary (transaction income also present)'
                      : `Declared salary \xd7 ${ledger.monthCount} month${ledger.monthCount !== 1 ? 's' : ''}`
                }
              </span>
            </div>
          )}

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

          {/* 1 -- Spend by category */}
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

          {/* 2 -- Monthly trend */}
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

          {/* 3 -- Top merchants */}
          {topMerchants.length > 0 && (
            <div className="a-card">
              <div className="a-card-head">
                <span className="a-card-title">Top merchants</span>
                <span className="a-card-sub">by total spend</span>
              </div>
              <div className="merchant-list">
                {topMerchants.slice(0, 10).map((m, i) => (
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
                      <span className="merchant-count">{m.count}\xd7</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4 -- Budget vs actual */}
          {budgetRows.length > 0 && (
            <div className="a-card">
              <div className="a-card-head">
                <span className="a-card-title">Budget vs actual</span>
                <div className="budget-mode-toggle">
                  <button
                    className={`bm-btn ${budgetMode === 'my' ? 'active' : ''}`}
                    onClick={() => handleBudgetModeChange('my')}
                    title="Use your manually set budgets"
                  >My Budget</button>
                  <button
                    className={`bm-btn ${budgetMode === 'ai' ? 'active' : ''}`}
                    onClick={() => handleBudgetModeChange('ai')}
                    title="AI targets from your rolling averages"
                  >AI Suggested</button>
                </div>
              </div>
              {budgetMode === 'ai' && (
                <p className="bm-hint">Targets are 85% of your average monthly spend per category over this period — a gentle reduction from your baseline.</p>
              )}
              <div className="bva-list">
                {budgetRows.map(({ cat, budget, spent }) => {
                  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
                  const over = spent > budget
                  const isEditing = editBudget?.cat === cat
                  return (
                    <div key={cat} className="bva-row">
                      <div className="bva-labels">
                        <span className="bva-cat">{cat}</span>
                        <span className={`bva-amt ${over ? 'over' : ''}`}>
                          {fmt(spent)}{' / '}
                          {budgetMode === 'my' ? (
                            isEditing ? (
                              <input
                                className="bva-budget-input"
                                autoFocus
                                defaultValue={Math.round(budget)}
                                onBlur={e => saveBudget(cat, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.target.blur()
                                  if (e.key === 'Escape') setEditBudget(null)
                                }}
                              />
                            ) : (
                              <button
                                className="bva-budget-btn"
                                onClick={() => setEditBudget({ cat })}
                                title="Click to set your budget for this category"
                              >{fmt(budget)}</button>
                            )
                          ) : (
                            fmt(budget)
                          )}
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
                      {over && <span className="bva-over-tag">{fmt(spent - budget)} over</span>}
                    </div>
                  )
                })}
              </div>
              {budgetMode === 'my' && (
                <p className="bva-edit-hint">Click any budget amount to edit it — changes save automatically.</p>
              )}
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
              : <p className="ai-hint-text">Get a merchant-level AI read of your spending patterns, what changed, and what to act on.</p>
            }
          </div>

          {/* Income Statement — expandable section */}
          <div className="a-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              className="a-section-toggle"
              onClick={() => setShowIncomeStatement(v => !v)}
            >
              <span className="a-card-title" style={{ fontSize: '14px' }}>Income Statement</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                {showIncomeStatement ? '▲ Hide' : '▼ Show'}
              </span>
            </button>
            {showIncomeStatement && (
              <div style={{ padding: '0 16px 16px' }}>
                <IncomeStatement />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
