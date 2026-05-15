import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed } from '../context/TierContext'
import { fetchTransactionsByRange } from '../services/transactions'
import { buildAIPayload } from '../utils/financials'
import { buildLedgerSummary, countCalendarMonths, formatLocalDate, getCalendarMonthRange } from '../utils/ledger'
import { analyseSpending } from '../services/ai'
import './Analytics.css'

const CATEGORIES = [
  'Housing','Groceries','Eating out','Transport','Entertainment',
  'Health','Clothing','Subscriptions','Education','Insurance',
  'Savings','Fuel','ATM / Cash','Fees & Charges','Utilities',
  'Travel','Gifts','Other'
]

const CAT_COLORS = {
  Housing:'#378ADD',Groceries:'#1D9E75','Eating out':'#D85A30',
  Transport:'#BA7517',Entertainment:'#7F77DD',Health:'#D4537E',
  Clothing:'#639922',Subscriptions:'#888780',
  Education:'#0891B2',Insurance:'#7C3AED',Savings:'#059669',
  Fuel:'#D97706','ATM / Cash':'#6B7280','Fees & Charges':'#DC2626',
  Utilities:'#0D9488',Travel:'#2563EB',Gifts:'#EC4899',Other:'#888'
}

// fmt removed: was incorrectly dividing rands by 100. Use fmtR throughout.
const fmtR = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const PERIODS = ['1M','3M','1Y','Custom','Max']

function getMonthRange(month) {
  return getCalendarMonthRange(month)
}

function getDateRange(period, customFrom, customTo, selectedMonth) {
  // Ranges use calendar-month start boundaries so they reconcile with
  // the Dashboard month picker and IncomeStatement period logic.
  const now = new Date()
  const toToday = formatLocalDate(now)
  const [sy, sm] = selectedMonth.split('-').map(Number)
  const endOfSelectedMonth = formatLocalDate(new Date(sy, sm, 0))
  if (period === '1M') {
    // Selected dashboard calendar month, matching Overview exactly.
    return getMonthRange(selectedMonth)
  }
  if (period === '3M') {
    // Three calendar months ending in selectedMonth (same anchor as Overview month).
    const first = new Date(sy, sm - 1 - 2, 1)
    return { from: formatLocalDate(first), to: endOfSelectedMonth }
  }
  if (period === '1Y') {
    const first = new Date(sy, sm - 1 - 11, 1)
    return { from: formatLocalDate(first), to: endOfSelectedMonth }
  }
  if (period === 'Custom') return { from: customFrom || toToday, to: customTo || toToday }
  // Max: full history through today (not clipped to selected month)
  return { from: '2020-01-01', to: toToday }
}

// Financial summaries come from buildLedgerSummary so totals, averages, and
// non-spend categories reconcile with Overview.

// ── SVG Line Chart ──────────────────────────────────────────────────────────
function TrendChart({ monthlyData }) {
  const months = Object.keys(monthlyData).sort()
  if (months.length < 2) return <div className="chart-empty">Import more months to see your trend.</div>
  const spends = months.map(m => monthlyData[m].spend)
  const incomes = months.map(m => monthlyData[m].income)
  const maxVal = Math.max(...spends, ...incomes, 1)
  const W=320,H=160,PAD={top:16,right:12,bottom:28,left:44}
  const innerW=W-PAD.left-PAD.right, innerH=H-PAD.top-PAD.bottom
  const xPos = i => PAD.left + (months.length>1?(i/(months.length-1))*innerW:innerW/2)
  const yPos = v => PAD.top + innerH - (v/maxVal)*innerH
  const linePath = vals => vals.map((v,i)=>`${i===0?'M':'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(' ')
  const areaPath = vals => {
    const line = vals.map((v,i)=>`${i===0?'M':'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(' ')
    return `${line} L ${xPos(vals.length-1).toFixed(1)} ${(PAD.top+innerH).toFixed(1)} L ${xPos(0).toFixed(1)} ${(PAD.top+innerH).toFixed(1)} Z`
  }
  const yTicks = [0,0.5,1].map(f => ({val:maxVal*f,y:yPos(maxVal*f)}))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg">
      {yTicks.map((t,i)=>(
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W-PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="0.8"/>
          <text x={PAD.left-4} y={t.y+3} textAnchor="end" fontSize="8" fill="var(--muted)">{t.val>=1000?`${Math.round(t.val/1000)}k`:Math.round(t.val)}</text>
        </g>
      ))}
      <path d={areaPath(incomes)} fill="#1D9E75" opacity="0.07"/>
      <path d={linePath(incomes)} fill="none" stroke="#1D9E75" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d={areaPath(spends)} fill="#D85A30" opacity="0.07"/>
      <path d={linePath(spends)} fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinejoin="round"/>
      {months.map((m,i)=>{
        if(months.length>9&&i%2!==0) return null
        const [y,mo]=m.split('-')
        const label=new Date(Number(y),Number(mo)-1,1).toLocaleDateString('en-ZA',{month:'short',...(months.length>6?{year:'2-digit'}:{})})
        return <text key={m} x={xPos(i)} y={H-4} textAnchor="middle" fontSize="7.5" fill="var(--muted)">{label}</text>
      })}
      {spends.map((v,i)=><circle key={`s${i}`} cx={xPos(i)} cy={yPos(v)} r="2.5" fill="var(--coral)"/>)}
      {incomes.map((v,i)=>v>0&&<circle key={`inc${i}`} cx={xPos(i)} cy={yPos(v)} r="2.5" fill="#1D9E75"/>)}
    </svg>
  )
}

// ── Bar Chart: Actual vs Budget ─────────────────────────────────────────────
function ActualVsBudgetChart({ catSpend, budgets, monthCount }) {
  const entries = Object.entries(catSpend)
    .filter(([, v]) => v > 0)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 8)
  if (!entries.length) return null
  const maxVal = Math.max(...entries.flatMap(([cat, val]) => [val/monthCount, budgets[cat]||0]), 1)
  const BAR_H = 14, GAP = 28, LABEL_W = 80, CHART_W = 220, PAD_RIGHT = 8
  const svgH = entries.length * (BAR_H*2 + GAP)
  return (
    <svg viewBox={`0 0 ${LABEL_W+CHART_W+PAD_RIGHT} ${svgH}`} className="avb-svg">
      {entries.map(([cat, total], i) => {
        const actual = total / monthCount
        const budget = budgets[cat] || 0
        const aW = Math.round((actual/maxVal)*CHART_W)
        const bW = budget > 0 ? Math.round((budget/maxVal)*CHART_W) : 0
        const y = i*(BAR_H*2+GAP)
        const over = budget>0 && actual>budget
        return (
          <g key={cat}>
            <text x={LABEL_W-6} y={y+BAR_H-2} textAnchor="end" fontSize="9" fill={CAT_COLORS[cat]||'#888'} fontWeight="500">{cat}</text>
            {/* Actual bar */}
            <rect x={LABEL_W} y={y} width={aW} height={BAR_H} rx="3" fill={over?'#D85A30':(CAT_COLORS[cat]||'#888')} opacity="0.85"/>
            <text x={LABEL_W+aW+3} y={y+BAR_H-2} fontSize="8" fill="var(--muted)">{fmtR(actual)}</text>
            {/* Budget bar */}
            {budget>0 && (
              <>
                <rect x={LABEL_W} y={y+BAR_H+2} width={bW} height={BAR_H} rx="3" fill={CAT_COLORS[cat]||'#888'} opacity="0.25"/>
                <text x={LABEL_W+bW+3} y={y+BAR_H*2} fontSize="8" fill="var(--muted)">{fmtR(budget)}</text>
              </>
            )}
          </g>
        )
      })}
      {/* Legend */}
      <rect x={LABEL_W} y={svgH-12} width={12} height={8} rx="2" fill="#D85A30" opacity="0.85"/>
      <text x={LABEL_W+15} y={svgH-5} fontSize="8" fill="var(--muted)">Actual/mo</text>
      <rect x={LABEL_W+70} y={svgH-12} width={12} height={8} rx="2" fill="#888" opacity="0.25"/>
      <text x={LABEL_W+85} y={svgH-5} fontSize="8" fill="var(--muted)">Budget</text>
    </svg>
  )
}

// ── Donut Chart ─────────────────────────────────────────────────────────────
function DonutChart({ catSpend }) {
  const entries = Object.entries(catSpend).sort((a,b)=>b[1]-a[1])
  const total = entries.reduce((s,[,v])=>s+v,0)
  if (!total || !entries.length) return null
  const top = entries.slice(0,7)
  const otherVal = entries.slice(7).reduce((s,[,v])=>s+v,0)
  const display = otherVal>0?[...top,['Other',otherVal]]:top
  const R=54,CX=70,CY=70,INNER=32
  let angle=-Math.PI/2
  const slices = display.map(([cat,val])=>{
    const sweep=(val/total)*2*Math.PI
    const x1=CX+R*Math.cos(angle),y1=CY+R*Math.sin(angle)
    angle+=sweep
    const x2=CX+R*Math.cos(angle),y2=CY+R*Math.sin(angle)
    const ix1=CX+INNER*Math.cos(angle-sweep),iy1=CY+INNER*Math.sin(angle-sweep)
    const ix2=CX+INNER*Math.cos(angle),iy2=CY+INNER*Math.sin(angle)
    const large=sweep>Math.PI?1:0
    return {cat,val,d:`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${INNER} ${INNER} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`}
  })
  return (
    <div className="donut-container">
      <svg viewBox="0 0 140 140" className="donut-svg">
        {slices.map(s=><path key={s.cat} d={s.d} fill={CAT_COLORS[s.cat]||'#aaa'}/>)}
        <text x={CX} y={CY-5} textAnchor="middle" fontSize="7" fill="var(--muted)">total spend</text>
        <text x={CX} y={CY+8} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text)">{fmtR(total)}</text>
      </svg>
      <div className="donut-legend">
        {display.slice(0,6).map(([cat,val])=>(
          <div key={cat} className="donut-legend-row">
            <span className="donut-dot" style={{background:CAT_COLORS[cat]||'#aaa'}}/>
            <span className="donut-legend-cat">{cat}</span>
            <span className="donut-legend-val">{Math.round((val/total)*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── AI Trend Analysis ───────────────────────────────────────────────────────
function AITrendAnalysis({ txns, period, budgets, parentLedger }) {
  const { user, profile } = useAuth()
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setAnalysis('')
    setLoaded(false)
  }, [txns, period])

  async function runAnalysis() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const payload = buildAIPayload(txns, profile, 200, {
        mode: 'analytics',
        budgets: budgets || {},
        monthlyData: parentLedger?.monthlyData || {},
      })
      const data = await analyseSpending(payload)
      setAnalysis(data.analysis || 'Analysis complete.')
      setLoaded(true)
    } catch (err) {
      setAnalysis('Could not load analysis right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="a-card ai-analysis-card">
      <div className="a-card-head">
        <span className="a-card-title">✦ AI trend analysis</span>
        {!loaded && !loading && (
          <button className="suggest-btn" onClick={runAnalysis}>Analyse →</button>
        )}
        {loaded && (
          <button className="suggest-btn" onClick={() => { setLoaded(false); setAnalysis(''); runAnalysis() }}>Refresh</button>
        )}
      </div>
      {loading && (
        <div className="ai-analysis-loading">
          <div className="ai-spinner"><span/><span/><span/></div>
          <p>bump. is reading your spending patterns…</p>
        </div>
      )}
      {!loading && !loaded && (
        <p className="ai-analysis-prompt">
          Click <strong>Analyse</strong> to get a plain-English summary of your spending trends, biggest wins, and where to cut.
        </p>
      )}
      {!loading && analysis && (
        <div className="ai-analysis-text">{analysis}</div>
      )}
    </div>
  )
}

// ── Budget Q&A Chat ─────────────────────────────────────────────────────────
function BudgetChat({ txns, budgets }) {
  const { user, profile } = useAuth()
  const tier = useTier()
  const INIT_MSG = { role:'bot', text:'Ask me anything about your spending. Try: "Where can I cut?" or "How long until I save R10k?"' }
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(`bump_chat_${user?.id}`)
      if (saved) { const p = JSON.parse(saved); if (p.length > 0) return p }
    } catch {}
    return [INIT_MSG]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    if (user?.id && messages.length > 1) {
      localStorage.setItem(`bump_chat_${user.id}`, JSON.stringify(messages.slice(-30)))
    }
  }, [messages])

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, {role:'user', text:q}])
    setLoading(true)
    try {
      const { data:{session} } = await supabase.auth.getSession()
      const history = messages
        .filter(m => m.role !== 'bot' || messages.indexOf(m) > 0)
        .slice(-6)
        .map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.text}))
      const resp = await fetch('/.netlify/functions/budget-chat', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}`},
        body: JSON.stringify({
          question: q,
          transactions: txns,
          profile,
          monthlyBudgets: budgets,
          conversationHistory: history,
        })
      })
      const data = await resp.json()
      if (data.paywall) {
        setMessages(prev=>[...prev,{role:'bot',text:data.answer,paywall:true}])
      } else {
        setMessages(prev=>[...prev,{role:'bot',text:data.answer}])
        setUsage({used:data.questionsUsed, limit:data.questionsLimit, plan:data.plan})
      }
    } catch (err) {
      setMessages(prev=>[...prev,{role:'bot',text:'Something went wrong. Please try again.'}])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="a-card budget-chat-card">
      <div className="a-card-head">
        <span className="a-card-title">💬 Budget Q&amp;A</span>
        {usage && usage.limit && (
          <span className="chat-usage">{usage.limit - usage.used} questions left this month</span>
        )}
      </div>
      <div className="chat-messages">
        {messages.map((m,i) => (
          <div key={i} className={`chat-msg ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'}`}>
            {m.paywall ? (
              <div>
                <p>{m.text}</p>
                <button className="chat-upgrade-btn" onClick={() => window.location.href='/app'}>
                  Upgrade to Budget Coach →
                </button>
              </div>
            ) : m.text}
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg-bot">
            <div className="ai-spinner chat-spinner"><span/><span/><span/></div>
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Ask about your budget…"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
          disabled={loading}
        />
        <button className="chat-send-btn" onClick={send} disabled={loading||!input.trim()}>→</button>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Analytics({ selectedMonth, preferDeclared = true }) {
  const { user, profile } = useAuth()
  const tier = useTier()
  const [period, setPeriod] = useState('1M')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [txns, setTxns] = useState([])
  const [budgets, setBudgets] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingCat, setEditingCat] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggestMsg, setSuggestMsg] = useState('')

  const effectiveMonth = selectedMonth || formatLocalDate(new Date()).slice(0, 7)
  const range = useMemo(
    () => getDateRange(period, customFrom, customTo, effectiveMonth),
    [period, customFrom, customTo, effectiveMonth]
  )
  const rangeMonthCount = useMemo(
    () => countCalendarMonths(range.from, range.to) || 1,
    [range.from, range.to]
  )

  useEffect(() => { loadData() }, [range.from, range.to, tier, user?.id])

  async function loadData() {
    if (period==='Custom'&&(!customFrom||!customTo)) return
    setLoading(true)
    try {
      const [txnData,{data:budgetData}] = await Promise.all([
        fetchTransactionsByRange(user.id,range.from,range.to),
        supabase.from('budgets').select('category, amount').eq('user_id',user.id)
      ])
      // Apply tier date filter -- free users must see the same date window as Overview
      const filtered = (txnData||[]).filter(t => isDateAllowed(t.date, tier))
      setTxns(filtered)
      const bmap={}
      for (const b of (budgetData||[])) bmap[b.category]=b.amount
      setBudgets(bmap)
    } catch (err) {
      console.error('Analytics load error:',err)
    } finally {
      setLoading(false)
    }
  }

  const ledger = useMemo(
    () => buildLedgerSummary(txns, profile, {
      preferDeclared,
      monthCount: rangeMonthCount,
      dedup: true,
      debugLabel: `Analytics ${period} ${range.from}..${range.to}`,
      from: range.from,
      to: range.to,
    }),
    [txns, profile, preferDeclared, rangeMonthCount, period, range.from, range.to]
  )
  const catSpend = ledger.catTotals
  const monthlyData = ledger.monthlyData
  const monthCount = ledger.monthCount
  const totalSpend = ledger.totalSpend
  const totalIncome = ledger.income
  const incomeSource = ledger.incomeSource
  const net = ledger.net

  // Spend "per month" uses months that actually have spend in-range, capped by the
  // selected period length — avoids dividing by 12 when only 1 month has rows.
  const spendAvgMonths = useMemo(() => {
    const md = ledger.monthlyData || {}
    const withSpend = Object.keys(md).filter(k => (md[k]?.spend || 0) > 0).length
    const cap = rangeMonthCount
    if (withSpend === 0) return Math.max(1, cap)
    return Math.max(1, Math.min(cap, withSpend))
  }, [ledger.monthlyData, rangeMonthCount])

  const suggestedBudgets = useMemo(()=>{
    const sugg={}
    for (const [cat,val] of Object.entries(catSpend)) sugg[cat]=Math.ceil((val/spendAvgMonths)/100)*100
    return sugg
  },[catSpend,spendAvgMonths])

  const sortedCats = useMemo(()=>Object.entries(catSpend).sort((a,b)=>b[1]-a[1]),[catSpend])

  async function saveBudget(cat, amount) {
    setSaving(true)
    try {
      await supabase.from('budgets').upsert(
        {user_id:user.id,category:cat,amount:Number(amount),updated_at:new Date().toISOString()},
        {onConflict:'user_id,category'}
      )
      setBudgets(prev=>({...prev,[cat]:Number(amount)}))
    } finally { setSaving(false); setEditingCat(null) }
  }

  async function applySuggested() {
    setSaving(true); setSuggestMsg('')
    try {
      const rows=Object.entries(suggestedBudgets).map(([cat,amount])=>({user_id:user.id,category:cat,amount,updated_at:new Date().toISOString()}))
      await supabase.from('budgets').upsert(rows,{onConflict:'user_id,category'})
      setBudgets(prev=>({...prev,...suggestedBudgets}))
      setSuggestMsg('Budgets updated based on your spending averages.')
      setTimeout(()=>setSuggestMsg(''),3000)
    } finally { setSaving(false) }
  }

  return (
    <div className="analytics-shell">
      <div className="period-bar">
        {PERIODS.map(p=>(
          <button key={p} className={`period-pill ${period===p?'active':''}`} onClick={()=>setPeriod(p)}>{p}</button>
        ))}
      </div>
      {period==='Custom'&&(
        <div className="custom-range">
          <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="date-input"/>
          <span className="custom-range-to">to</span>
          <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="date-input"/>
        </div>
      )}
      {loading ? (
        <div className="analytics-loading">
          <div className="ai-spinner"><span/><span/><span/></div>
          <p>bump. is crunching the numbers...</p>
        </div>
      ) : txns.length===0 ? (
        <div className="analytics-empty">
          <div className="empty-icon">📊</div>
          <p>No transactions found for this period.<br/>Import a bank statement to get started.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="summary-strip">
            <div className="summary-item">
              <div className="summary-val red">{fmtR(totalSpend)}</div>
              <div className="summary-lbl">spent</div>
            </div>
            <div className="summary-divider"/>
            <div className="summary-item">
              <div className="summary-val green">{fmtR(totalIncome)}</div>
              <div className="summary-lbl">
                {monthCount > 1 ? `${monthCount}mo income total` : 'income'}
                {incomeSource === 'declared' ? ' (declared)' : ''}
              </div>
            </div>
            <div className="summary-divider"/>
            <div className="summary-item">
              <div className={`summary-val ${net>=0?'green':'red'}`}>{fmtR(Math.abs(net))}</div>
              <div className="summary-lbl">{net>=0?'surplus':'deficit'}</div>
            </div>
          </div>

          {/* Spending trend line chart */}
          <div className="a-card">
            <div className="a-card-head">
              <span className="a-card-title">Spending trend</span>
              <div className="chart-legend">
                <span className="legend-pip" style={{background:'var(--coral)'}}/> Spend
                <span className="legend-pip" style={{background:'#1D9E75'}}/> Income
              </div>
            </div>
            <TrendChart monthlyData={monthlyData}/>
          </div>

          {/* Category donut */}
          <div className="a-card">
            <div className="a-card-head"><span className="a-card-title">Category breakdown</span></div>
            <DonutChart catSpend={catSpend}/>
          </div>

          {/* Actual vs Budget bar chart */}
          <div className="a-card">
            <div className="a-card-head">
              <span className="a-card-title">Actual vs budget</span>
              <button className="suggest-btn" onClick={applySuggested} disabled={saving}>✦ bump. suggest</button>
            </div>
            {suggestMsg && <div className="suggest-msg">{suggestMsg}</div>}
            <p className="a-card-sub">Per-month spend average uses {spendAvgMonths} month{spendAvgMonths!==1?'s':''} with outflows (of {rangeMonthCount} in range).</p>
            <ActualVsBudgetChart catSpend={catSpend} budgets={budgets} monthCount={spendAvgMonths}/>

            {/* Editable budget list below chart */}
            <div className="budget-list" style={{marginTop:16}}>
              {sortedCats.map(([cat,total])=>{
                const monthly=total/spendAvgMonths
                const budget=budgets[cat]||0
                const isEditing=editingCat===cat
                const over=budget>0&&monthly>budget
                const pct=budget>0?Math.min((monthly/budget)*100,100):100
                return (
                  <div key={cat} className="budget-row">
                    <div className="budget-row-top">
                      <span className="budget-cat-name" style={{color:CAT_COLORS[cat]||'#888'}}>{cat}</span>
                      <div className="budget-row-right">
                        <span className={`budget-monthly ${over?'over':''}`}>{fmtR(monthly)}/mo</span>
                        {isEditing ? (
                          <form className="budget-edit-form" onSubmit={e=>{e.preventDefault();saveBudget(cat,editVal)}}>
                            <span className="budget-edit-r">R</span>
                            <input autoFocus type="number" value={editVal} onChange={e=>setEditVal(e.target.value)} className="budget-edit-input" placeholder="0"/>
                            <button type="submit" className="bef-confirm" disabled={saving}>✓</button>
                            <button type="button" className="bef-cancel" onClick={()=>setEditingCat(null)}>✕</button>
                          </form>
                        ) : (
                          <button className="budget-tag" onClick={()=>{setEditingCat(cat);setEditVal(budget||suggestedBudgets[cat]||'')}}>
                            {budget>0?fmtR(budget):'+ budget'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${over?'bar-over':''}`} style={{width:`${pct}%`,background:over?'var(--coral)':(CAT_COLORS[cat]||'#888')}}/>
                      <div className={`bar-fill ${over?'bar-over':''}`} style={{width:`${pct}%`,background:over?'var(--coral)':(CAT_COLORS[cat]||'#888')}}/>
                    </div>
                    {over&&<div className="budget-over-label">{fmtR(monthly-budget)} over budget this month</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI Trend Analysis */}
          <AITrendAnalysis txns={txns} period={period} budgets={budgets} parentLedger={ledger} />

          {/* Budget Q&A */}
          <BudgetChat txns={txns} budgets={budgets}/>
        </>
      )}
    </div>
  )
}
