import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed, PLAN_PRICES } from '../context/TierContext'
import { fetchTransactions, fetchTransactionsByMonth, fetchRecentMonths, addTransaction, updateTransaction, deleteTransaction } from '../services/transactions'
import { buildAIPayload, buildTopMerchants } from '../utils/financials'
import { buildLedgerSummary, getCalendarMonthRange } from '../utils/ledger'
import { parseTransaction, analyseSpending, recategoriseAll } from '../services/ai'
import ImportTransactions from './ImportTransactions'
import Analytics from './Analytics'
import Recommendations from './Recommendations'
import Projections from './Projections'
import GroceryComparison from './GroceryComparison'
import LockedFeature, { LockedRow } from './LockedFeature'
import IncomeStatement from './IncomeStatement'
import SupportChat from './SupportChat'
import FAQ from './FAQ'
import './Dashboard.css'

// Default budget fallbacks — used when user hasn't set budgets in Analytics yet.
// These are replaced by real user budgets loaded from Supabase.
const DEFAULT_BUDGETS = {
  Housing: 9500, Groceries: 3000, 'Eating out': 2000, Transport: 2500,
  Entertainment: 1500, Health: 1000, Clothing: 1000, Subscriptions: 500, Other: 1000
}

const CAT_COLORS = {
  Housing: '#378ADD', Groceries: '#1D9E75', 'Eating out': '#D85A30',
  Transport: '#BA7517', Entertainment: '#7F77DD', Health: '#D4537E',
  Clothing: '#639922', Subscriptions: '#888780', Income: '#1a6b45',
  Education: '#0891B2', Insurance: '#7C3AED', Savings: '#059669',
  Fuel: '#D97706', 'ATM / Cash': '#6B7280', 'Fees & Charges': '#DC2626',
  Utilities: '#0D9488', Travel: '#2563EB', Gifts: '#EC4899', Transfer: '#94A3B8', 'Home & Garden': '#65A30D', Other: '#888'
}

const CAT_ICONS = {
  Housing: '\u{1F3E0}', Groceries: '\u{1F6D2}', 'Eating out': '\u{1F37D}\u{FE0F}',
  Transport: '\u{1F697}', Entertainment: '\u{1F389}', Health: '\u{1F48A}',
  Clothing: '\u{1F455}', Subscriptions: '\u{1F4F1}', Income: '\u{1F4B0}',
  Education: '\u{1F393}', Insurance: '\u{1F6E1}\u{FE0F}', Savings: '\u{1F4B9}',
  Fuel: '\u{26FD}', 'ATM / Cash': '\u{1F4B5}', 'Fees & Charges': '\u{1F4CB}',
  Utilities: '\u{1F4A1}', Travel: '\u{2708}\u{FE0F}', Gifts: '\u{1F381}', Transfer: '\u{1F504}', 'Home & Garden': '\u{1F3E1}', Other: '\u{1F4E6}'
}

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const monthLabel = () => new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

export default function Dashboard({ onNavigate }) {
  const { user, profile, updateProfile } = useAuth()
  const tier = useTier()
  const [tab, setTab] = useState('overview')
  const [transactions, setTransactions] = useState([])
  const [excludeSalary, setExcludeSalary] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    { id: 0, type: 'bot', text: "Hey -- just type what you spent, paste transactions, or upload a statement. I'll handle the rest." }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  // Budget mode toggle: 'personal' = user-set budgets, 'ai' = AI-suggested (85% of recent avg)
  const [budgetMode, setBudgetMode] = useState('personal')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showAccountCentre, setShowAccountCentre] = useState(false)
  // Real user-set budgets from Supabase (set in the Analytics tab).
  // Overrides DEFAULT_BUDGETS for the category cards in Overview.
  const [userBudgets, setUserBudgets] = useState(DEFAULT_BUDGETS)
  // Increments each time an import completes — signals Recommendations to refresh.
  const [importSignal, setImportSignal] = useState(0)
  const [savingsBal, setSavingsBal]             = useState('')
  const [savingsBalSaving, setSavingsBalSaving] = useState(false)
  const profileMenuRef = useRef(null)
  const chatEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Consultation state
  const [consultRequests, setConsultRequests] = useState([])
  const [consultActionId, setConsultActionId] = useState(null)

  // Recategorisation state for transaction list
  const [recatId, setRecatId] = useState(null)        // which txn is being edited
  const [recatSaving, setRecatSaving] = useState(false)
  const [recatPrompt, setRecatPrompt] = useState(null) // { id, name, category } - show "save as rule?" dialog
  const [selectedCat, setSelectedCat] = useState(null)   // drill-down: which category card was tapped
  const [recatAll, setRecatAll] = useState({ loading: false, result: null })

  useEffect(() => {
    loadTransactions()
    loadConsultRequests()
    loadBudgets()
  }, [selectedMonth])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function loadTransactions() {
    try {
      const data = await fetchTransactionsByMonth(user.id, selectedMonth)
      setTransactions(data)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    }
  }

  async function loadBudgets() {
    try {
      const { data } = await supabase.from('budgets').select('category, amount').eq('user_id', user.id)
      if (data && data.length > 0) {
        const bmap = { ...DEFAULT_BUDGETS }
        for (const b of data) bmap[b.category] = b.amount
        setUserBudgets(bmap)
      }
    } catch (err) {
      console.error('Failed to load budgets:', err)
    }
  }

  function changeMonth(delta) {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthDisplayLabel = () => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  }

  async function loadConsultRequests() {
    try {
      const { data } = await supabase
        .from('consultant_access')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setConsultRequests(data || [])
    } catch (err) {
      console.error('Failed to load consult requests:', err)
    }
  }

  async function handleConsultResponse(requestId, status, podcastConsent = false) {
    setConsultActionId(requestId)
    try {
      const update = { status }
      if (status === 'approved') {
        update.granted_at = new Date().toISOString()
        update.podcast_consent = podcastConsent
      }
      await supabase
        .from('consultant_access')
        .update(update)
        .eq('id', requestId)
      await loadConsultRequests()
    } catch (err) {
      console.error('Consult response failed:', err)
    }
    setConsultActionId(null)
  }

  // Only use transactions within the tier's allowed date window for metrics & AI
  const allowedTransactions = useMemo(
    () => transactions.filter(t => isDateAllowed(t.date, tier)),
    [transactions, tier]
  )
  const hasLockedTransactions = transactions.some(t => !isDateAllowed(t.date, tier))

  // Canonical financial summary for the selected month.
  const ledger = useMemo(
    () => {
      const range = getCalendarMonthRange(selectedMonth)
      return buildLedgerSummary(allowedTransactions, profile, {
        preferDeclared: excludeSalary,
        monthCount: 1,
        dedup: true,
        debugLabel: `Overview ${selectedMonth}`,
        from: range.from,
        to: range.to,
      })
    },
    [allowedTransactions, profile, excludeSalary, selectedMonth]
  )
  const spendTxns = ledger.spendTxns
  const income = ledger.income
  const totalSpend = ledger.totalSpend
  const net = ledger.net
  const catTotals = ledger.catTotals
  const maxCat = Math.max(...Object.values(catTotals), 1)

  // AI-suggested budget: 85% of this month's actual spend per category.
  // Used when budgetMode === 'ai'. Gives a realistic stretch target.
  const aiSuggestedBudgets = useMemo(() => {
    const suggested = {}
    for (const [cat, total] of Object.entries(catTotals)) {
      if (total > 0) suggested[cat] = Math.round(total * 0.85)
    }
    return suggested
  }, [catTotals])

  // Active budgets depend on mode — personal (DB-set) or AI-suggested
  const activeBudgets = budgetMode === 'ai' ? aiSuggestedBudgets : userBudgets

  // Savings drawdown detection
  const EXCEPTIONAL_CATS_OV = new Set(['Gifts', 'Travel', 'Entertainment', 'Clothing', 'Home & Garden'])
  const exceptionalSpendOV  = Object.entries(catTotals)
    .filter(([cat]) => EXCEPTIONAL_CATS_OV.has(cat))
    .reduce((s, [, v]) => s + v, 0)
  const regularNet     = income - (totalSpend - exceptionalSpendOV)
  const likelyDrawdown = net < 0 && exceptionalSpendOV > 0

  // Bulk re-categorise all transactions via AI
  async function handleRecatAll() {
    setRecatAll({ loading: true, result: null })
    try {
      const r = await recategoriseAll()
      setRecatAll({ loading: false, result: r })
      await loadTransactions()
    } catch (e) {
      setRecatAll({ loading: false, result: { error: e.message || 'Failed — try again.' } })
    }
  }

  // Handle inline recategorisation
  async function handleRecat(txnId, txnName, newCategory) {
    setRecatSaving(true)
    try {
      await updateTransaction(txnId, { category: newCategory })
      setTransactions(prev => prev.map(t => t.id === txnId ? { ...t, category: newCategory } : t))
      setRecatId(null)
      setRecatPrompt({ id: txnId, name: txnName, category: newCategory })
    } catch (e) {
      console.error('Recategorise failed', e)
    }
    setRecatSaving(false)
  }

  async function handleSaveRule(merchantPattern, category, applyToHistory) {
    if (!merchantPattern) return
    setRecatPrompt(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/.netlify/functions/manage-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ merchant_pattern: merchantPattern.toLowerCase(), category })
      })
      if (applyToHistory) {
        // Update all matching transactions in current month view
        const pattern = merchantPattern.toLowerCase()
        const ids = transactions.filter(t => t.name?.toLowerCase().includes(pattern)).map(t => t.id)
        if (ids.length > 0) {
          await Promise.all(ids.map(id => updateTransaction(id, { category })))
          setTransactions(prev => prev.map(t =>
            t.name?.toLowerCase().includes(pattern) ? { ...t, category } : t
          ))
        }
      }
    } catch (e) {
      console.error('Save rule failed', e)
    }
  }

  async function handleSendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    textareaRef.current.style.height = 'auto'

    const userMsgId = Date.now()
    setChatMessages(prev => [...prev, { id: userMsgId, type: 'user', text: msg }])
    setChatLoading(true)

    try {
      const result = await parseTransaction(msg)
      if (result.parsed) {
        setChatMessages(prev => [...prev, { id: userMsgId + 1, type: 'confirm', txn: result }])
      } else {
        setChatMessages(prev => [...prev, { id: userMsgId + 1, type: 'bot', text: result.reply }])
      }
    } catch {
      setChatMessages(prev => [...prev, {
        id: userMsgId + 1, type: 'bot', text: "Couldn't parse that. Try \"Woolies R340\" or \"Uber Eats R180\"."
      }])
    }
    setChatLoading(false)
  }

  async function confirmTxn(txn, msgId) {
    try {
      const saved = await addTransaction(user.id, {
        name: txn.name, amount: txn.amount, category: txn.category
      })
      setTransactions(prev => [saved, ...prev])
      setChatMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, type: 'confirmed', text: `Added -- ${txn.name} ${fmt(txn.amount)} to ${txn.category}.` }
          : m
      ))
    } catch {
      setChatMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, type: 'bot', text: 'Failed to save. Try again.' } : m
      ))
    }
  }

  function dismissTxn(msgId) {
    setChatMessages(prev => prev.filter(m => m.id !== msgId))
  }

  async function handleDelete(id) {
    try {
      await deleteTransaction(id)
      setTransactions(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  async function runAnalysis() {
    setAiLoading(true)
    setAiText('')
    try {
      // Build merchant summary from spend transactions for richer AI context
      const topMerchants = buildTopMerchants(spendTxns, 15)
      const payload = buildAIPayload(allowedTransactions, profile, 200, {
        mode: 'overview',
        budgets: activeBudgets,
        monthlyData: ledger.monthlyData,
        topMerchants,
        effectiveIncome: ledger.income,
        incomeResolutionMode: ledger.incomeResolutionMode,
        periodLabel: monthDisplayLabel(),
      })
      const result = await analyseSpending(payload)
      setAiText(result.analysis)
    } catch (e) {
      setAiText(e.message || 'Analysis failed -- check your connection and try again.')
    }
    setAiLoading(false)
  }

  function handleTextareaKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() }
  }

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // Close profile menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setShowProfileMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const pendingRequests = consultRequests.filter(r => r.status === 'pending')
  const approvedRequest = consultRequests.find(r => r.status === 'approved')

  return (
    <div className="app-shell">
      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">bump<span className="logo-dot" aria-hidden="true" /></div>
        <div className="nav-right">
          <div className="nav-month-picker">
            <button className="month-arrow" onClick={() => changeMonth(-1)}>‹</button>
            <span className="nav-month">{monthDisplayLabel()}</span>
            <button className="month-arrow" onClick={() => changeMonth(1)}>›</button>
          </div>
          {!tier.isAdmin && profile?.subscription_plan && profile.subscription_plan !== 'free' && (
            <span className="nav-plan-badge">{profile.subscription_plan}</span>
          )}
          {(profile?.role === 'admin' || profile?.is_admin || tier.isAdmin) && (
            <button
              className="nav-admin-btn"
              onClick={() => onNavigate('admin')}
              title="Admin Dashboard"
            >
              &#9881;
            </button>
          )}
          <div className="avatar-wrap" ref={profileMenuRef} style={{position:'relative'}}>
            <button className="avatar" onClick={() => setShowProfileMenu(m => !m)} title="Profile">
              {user.email?.[0]?.toUpperCase() || 'U'}
            </button>
            {showProfileMenu && (
              <div className="profile-dropdown">
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setShowAccountCentre(true) }}>My Profile</button>
                <div className="profile-dropdown-divider" />
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setTab('support') }}>Support</button>
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setTab('faq') }}>FAQs</button>
                <div className="profile-dropdown-divider" />
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setTab('privacy') }}>Privacy</button>
                <button className="profile-dropdown-item red" onClick={() => supabase.auth.signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Tier simulation banner — always visible for admins */}
      {(tier.isAdmin || tier.simulating) && (
        <div className="sim-banner">
          <span className="sim-banner-label">
            {tier.simulating ? `🔧 Simulating ${tier.simulating}` : '🔧 Admin mode'}
          </span>
          <select
            className="sim-select-inline"
            value={tier.simulatedPlan || ''}
            onChange={e => tier.setSimulatedPlan(e.target.value || null)}
          >
            <option value="">No simulation (admin)</option>
            <option value="free">Simulate: Free</option>
            <option value="starter">Simulate: Starter</option>
            <option value="growth">Simulate: Growth</option>
            <option value="pro">Simulate: Pro</option>
          </select>
          {tier.simulating && (
            <button className="sim-banner-exit" onClick={() => tier.setSimulatedPlan(null)}>Exit</button>
          )}
        </div>
      )}

      {/* DESKTOP TABS — scrollable horizontal strip, hidden on mobile */}
      <div className="tabs desktop-tabs">
        {['overview', 'income statement', 'analytics', 'projections', 'groceries', 'budget', 'add spend', 'import', 'transactions'].map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'import' ? '↑ import' : t === 'groceries' ? '🛒 groceries' : t === 'projections' ? '📈 projections' : t === 'income statement' ? '📋 income' : t}
          </button>
        ))}
      </div>

      {/* MOBILE BOTTOM NAV — primary 5-tab navigation for small screens */}
      <nav className="mobile-bottom-nav">
        {[
          { id: 'overview',      icon: '🏠', label: 'Overview' },
          { id: 'analytics',     icon: '📊', label: 'Analytics' },
          { id: 'groceries',     icon: '🛒', label: 'Groceries' },
          { id: 'budget',        icon: '🧠', label: 'Budget' },
          { id: 'transactions',  icon: '📋', label: 'Transactions' },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            className={`mbn-item ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <span className="mbn-icon">{icon}</span>
            <span className="mbn-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="tab-body">

          {/* Consultant access banner */}
          {approvedRequest && (
            <div className="consult-banner">
              <span className="consult-banner-dot" />
              <span>Your consultant has view access to your budget.</span>
            </div>
          )}

          {/* Pending consultation requests */}
          {pendingRequests.length > 0 && (
            <div className="consult-requests-section">
              <div className="section-head">Consultation Requests</div>
              {pendingRequests.map(req => (
                <ConsultRequestCard
                  key={req.id}
                  request={req}
                  loading={consultActionId === req.id}
                  onRespond={handleConsultResponse}
                />
              ))}
            </div>
          )}

          {/* Salary toggle */}
          <div className="salary-row">
            <div>
              <div className="salary-title">Income source</div>
              <div className="salary-sub">{excludeSalary ? 'Using declared salary' : 'Using logged transactions'}</div>
            </div>
            <div className="pill-toggle">
              <button className={excludeSalary ? 'active' : ''} onClick={() => setExcludeSalary(true)}>Declared</button>
              <button className={!excludeSalary ? 'active' : ''} onClick={() => setExcludeSalary(false)}>Transactions</button>
            </div>
          </div>

          {/* Metrics */}
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Total spend</div>
              <div className="metric-val">{fmt(totalSpend)}</div>
              <div className="metric-sub">{excludeSalary ? 'salary excluded' : 'all transactions'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Income</div>
              <div className="metric-val green">{fmt(income)}</div>
              <div className="metric-sub">{excludeSalary && profile?.net_income ? 'declared salary' : 'logged this month'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Net position</div>
              <div className={`metric-val ${net >= 0 ? 'green' : 'red'}`}>{fmt(net)}</div>
              <div className="metric-sub">{net >= 0 ? 'surplus' : 'deficit'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Transactions</div>
              <div className="metric-val">{spendTxns.length}</div>
              <div className="metric-sub">logged this month</div>
            </div>
          </div>

          {/* Categories */}
          {Object.keys(catTotals).length > 0 && (
            <>
              <div className="section-head-row">
                <span className="section-head">Spend by category</span>
                <div className="budget-mode-toggle">
                  <button
                    className={`bmt-btn ${budgetMode === 'personal' ? 'active' : ''}`}
                    onClick={() => setBudgetMode('personal')}
                    title="Use your manually-set budgets"
                  >Personal</button>
                  <button
                    className={`bmt-btn ${budgetMode === 'ai' ? 'active' : ''}`}
                    onClick={() => setBudgetMode('ai')}
                    title="AI-suggested budgets: 85% of this month's actuals"
                  >AI Suggested</button>
                </div>
              </div>
              {budgetMode === 'ai' && (
                <div className="bmt-hint">AI budgets target 85% of your current month spend per category.</div>
              )}
              <div className="cats">
                {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const budget = activeBudgets[cat] || 1000
                  const over = amt > budget
                  const near = !over && amt > budget * 0.8
                  return (
                    <div className="cat-card" key={cat} onClick={() => setSelectedCat(cat)} style={{cursor:'pointer'}}>
                      <div className="cat-top">
                        <span className="cat-name">{cat}</span>
                        <span className={`cat-badge ${over ? 'over' : near ? 'near' : 'ok'}`}>
                          {over ? 'over budget' : near ? 'near limit' : 'on track'}
                        </span>
                      </div>
                      <div className="cat-amts">
                        <span>{fmt(amt)}</span>
                        <span>budget {fmt(budget)}</span>
                      </div>
                      <div className="bar-bg">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.min(Math.round(amt / maxCat * 100), 100)}%`,
                            background: CAT_COLORS[cat] || '#888'
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Category drill-down drawer */}
          {selectedCat && (
            <div className="cat-drawer-overlay" onClick={() => setSelectedCat(null)}>
              <div className="cat-drawer" onClick={e => e.stopPropagation()}>
                <div className="cat-drawer-header">
                  <div className="cat-drawer-title">
                    <span style={{fontSize:'1.4rem'}}>{CAT_ICONS[selectedCat] || '📦'}</span>
                    <span>{selectedCat}</span>
                    <span className="cat-drawer-total">{fmt(catTotals[selectedCat] || 0)}</span>
                  </div>
                  <button className="cat-drawer-close" onClick={() => setSelectedCat(null)}>✕</button>
                </div>
                <div className="cat-drawer-list">
                  {transactions
                    .filter(t => t.category === selectedCat)
                    .sort((a, b) => b.amount - a.amount)
                    .map(t => (
                      <div key={t.id} className="cat-drawer-row">
                        <div className="cat-drawer-row-info">
                          <span className="cat-drawer-row-name">{t.name || t.description}</span>
                          <span className="cat-drawer-row-date">{fmtDate(t.date)}</span>
                        </div>
                        <div className="cat-drawer-row-right">
                          <span className="cat-drawer-row-amt">{fmt(t.amount)}</span>
                          <select
                            className="cat-drawer-recat"
                            value={t.category}
                            onChange={e => {
                              handleRecat(t.id, t.name, e.target.value)
                              setTransactions(prev => prev.map(tx => tx.id === t.id ? {...tx, category: e.target.value} : tx))
                            }}
                          >
                            {['Groceries','Eating out','Transport','Entertainment','Health','Clothing',
                              'Subscriptions','Education','Insurance','Savings','Fuel','ATM / Cash',
                              'Fees & Charges','Utilities','Travel','Gifts','Home & Garden','Housing',
                              'Income','Transfer','Other'].map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  {transactions.filter(t => t.category === selectedCat).length === 0 && (
                    <p style={{color:'var(--muted)',textAlign:'center',padding:'1rem'}}>No transactions in this category this month.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Import CTA */}
          <button className="import-cta-btn" onClick={() => setTab('import')}>
            <span className="import-cta-icon">↑</span>
            <div>
              <div className="import-cta-title">Import bank statement</div>
              <div className="import-cta-sub">Upload CSV or Excel — bump. categorises everything</div>
            </div>
          </button>

          {transactions.length === 0 && (
            <div className="empty-state">
              <p>No transactions yet.</p>
              <p>Import a statement above or tap <strong>Add spend</strong> to log manually.</p>
            </div>
          )}

          {/* Savings drawdown prompt */}
          {likelyDrawdown && (
            <div className="savings-drawdown-card">
              <div className="sdc-header">
                <span className="sdc-icon">💰</span>
                <div>
                  <div className="sdc-title">Looks like you dipped into savings this month</div>
                  <div className="sdc-sub">
                    You spent {fmt(exceptionalSpendOV)} on exceptional items (gifts, travel, entertainment)
                    that likely came from savings. Strip those out and your underlying position is{' '}
                    <strong className={regularNet >= 0 ? 'sdc-pos' : 'sdc-neg'}>
                      {fmt(Math.abs(regularNet))} {regularNet >= 0 ? 'surplus' : 'deficit'}
                    </strong> — {regularNet >= 0 ? 'your regular spending is healthy.' : 'worth keeping an eye on.'}
                  </div>
                </div>
              </div>
              {profile?.savings_balance > 0 && (
                <div className="sdc-balance-row">
                  <div>
                    <span className="sdc-balance-label">Estimated savings balance after this month: </span>
                    <strong>{fmt(Math.max(Math.round(profile.savings_balance / 100) + net, 0))}</strong>
                    <span className="sdc-balance-was"> (was {fmt(Math.round(profile.savings_balance / 100))})</span>
                  </div>
                  <span className="sdc-balance-hint">Update below if this looks off</span>
                </div>
              )}
              {!profile?.savings_balance && (
                <div className="sdc-balance-hint sdc-balance-hint--nudge">
                  Add your savings balance in Account Centre so bump. can track drawdowns accurately.
                </div>
              )}
              <div className="sdc-edit-row">
                <label className="sdc-edit-label">Update savings balance</label>
                <div className="sdc-edit-wrap">
                  <span className="sdc-prefix">R</span>
                  <input
                    className="sdc-input"
                    type="number"
                    placeholder={profile?.savings_balance ? String(Math.round(profile.savings_balance / 100)) : '0'}
                    value={savingsBal}
                    onChange={e => setSavingsBal(e.target.value)}
                  />
                  <button
                    className="sdc-save-btn"
                    disabled={!savingsBal || savingsBalSaving}
                    onClick={async () => {
                      if (!savingsBal) return
                      setSavingsBalSaving(true)
                      await updateProfile({ savings_balance: Math.round(parseFloat(savingsBal) * 100) })
                      setSavingsBal('')
                      setSavingsBalSaving(false)
                    }}
                  >{savingsBalSaving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className="ai-panel">
            <div className="ai-head">
              <div className="ai-dot" />
              <span className="ai-head-label">bump. insights</span>
            </div>
            <div className="ai-body">
              {aiLoading
                ? <div className="typing"><span/><span/><span/></div>
                : aiText
                  ? <div dangerouslySetInnerHTML={{ __html: aiText.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>') }} />
                  : <p>Tap below and bump. will analyse your spending, flag overspends and suggest where to cut.</p>
              }
            </div>
            <div className="ai-chips">
              <button className="chip" onClick={() => setTab('add spend')}>Add a transaction</button>
            </div>
          </div>
          <button className="analyse-btn" onClick={runAnalysis} disabled={aiLoading || transactions.length === 0}>
            {aiLoading ? 'bump. is working on it...' : aiText ? 'Re-analyse' : 'Analyse my spending'}
          </button>

          {/* Re-categorise all transactions */}
          <div className="recat-all-strip">
            <div className="recat-all-text">
              <strong>Transactions landing in Other?</strong>
              <span> Re-run AI categorisation on all your transactions.</span>
            </div>
            {recatAll.result && !recatAll.result.error && (
              <span className="recat-all-badge">✓ {recatAll.result.changed} updated</span>
            )}
            {recatAll.result?.error && (
              <span className="recat-all-badge error">{recatAll.result.error}</span>
            )}
            <button className="recat-all-btn" onClick={handleRecatAll} disabled={recatAll.loading}>
              {recatAll.loading ? 'Re-categorising...' : 'Re-categorise all'}
            </button>
          </div>

          {/* Book a Consultation CTA — Pro only */}
          <LockedFeature locked={!tier.canConsult} feature="consult" label="Upgrade to Pro — R199/mo">
            <button className="book-consult-btn" onClick={() => onNavigate('book-consult')}>
              Book a financial consultation
            </button>
          </LockedFeature>

          {/* Tier upgrade nudge for free users */}
          {!tier.isAdmin && tier.plan === 'free' && (
            <div className="tier-nudge">
              🚀 <strong>Free plan:</strong> showing last 30 days. <a href="#upgrade" className="tier-nudge-link">Upgrade from R49/mo</a> for full history, bump. insights & more.
            </div>
          )}

        </div>
      )}

      {/* INCOME STATEMENT */}
      {tab === 'income statement' && (
        <div className="tab-body">
          <IncomeStatement />
        </div>
      )}

      {/* ANALYTICS */}
      {tab === 'analytics' && (
        tier.canAnalytics
          ? <Analytics preferDeclared={excludeSalary} />
          : <div className="tab-body">
              <LockedFeature locked feature="analytics">
                <div className="locked-placeholder">
                  <div className="locked-placeholder-title">Spend analytics</div>
                  <p className="locked-placeholder-sub">Detailed category breakdowns, trends and spending patterns over your full history.</p>
                </div>
              </LockedFeature>
            </div>
      )}

      {/* PROJECTIONS */}
      {tab === 'projections' && (
        <div className="tab-body">
          {tier.canProjections
            ? <Projections />
            : <LockedFeature locked feature="projections">
                <div className="locked-placeholder">
                  <div className="locked-placeholder-title">Financial projections</div>
                  <p className="locked-placeholder-sub">Model your savings, debt payoff and investment growth over 1, 5 or 10 years.</p>
                </div>
              </LockedFeature>
          }
        </div>
      )}

      {/* GROCERY COMPARISON */}
      {tab === 'groceries' && (
        <div className="tab-body">
          {tier.canGroceries
            ? <GroceryComparison />
            : <LockedFeature locked feature="groceries">
                <div className="locked-placeholder">
                  <div className="locked-placeholder-title">Grocery price comparison</div>
                  <p className="locked-placeholder-sub">See whether Checkers, Pick n Pay, Woolworths or Shoprite is cheaper for your actual shopping list.</p>
                </div>
              </LockedFeature>
          }
        </div>
      )}

      {/* BUDGET RECOMMENDATIONS */}
      {tab === 'budget' && <Recommendations onImportSignal={importSignal} />}

      {/* ADD SPEND */}
      {tab === 'add spend' && (
        <div className="chat-shell">
          <div className="chat-body">
            {chatMessages.map(msg => (
              <div key={msg.id} className="fade-up">
                {msg.type === 'user' && (
                  <div className="chat-bubble user">{msg.text}</div>
                )}
                {(msg.type === 'bot' || msg.type === 'confirmed') && (
                  <div className={`chat-bubble bot ${msg.type === 'confirmed' ? 'confirmed' : ''}`}>
                    {msg.text}
                  </div>
                )}
                {msg.type === 'confirm' && (
                  <div className="chat-bubble bot">
                    <span>Got it -- does this look right?</span>
                    <div className="txn-preview">
                      <div className="txn-preview-row"><span>Merchant</span><strong>{msg.txn.name}</strong></div>
                      <div className="txn-preview-row"><span>Amount</span><strong>{fmt(msg.txn.amount)}</strong></div>
                      <div className="txn-preview-row"><span>Category</span><strong>{msg.txn.category}</strong></div>
                    </div>
                    <div className="confirm-btns">
                      <button className="confirm-yes" onClick={() => confirmTxn(msg.txn, msg.id)}>Yes, add it</button>
                      <button className="confirm-no" onClick={() => dismissTxn(msg.id)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble bot fade-up">
                <div className="typing"><span/><span/><span/></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-hint">Try: "Woolies R340" - "Uber Eats R180 last night" - "Salary R35000"</div>
          <div className="chat-input-bar">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={e => { setChatInput(e.target.value); autoResize(e.target) }}
              onKeyDown={handleTextareaKey}
              placeholder="What did you spend?"
              rows={1}
            />
            <button className="send-btn" onClick={handleSendChat} disabled={chatLoading}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* TRANSACTIONS */}
      {tab === 'transactions' && (
        <div className="tab-body">
          {recatPrompt && (
            <div className="recat-prompt fade-up">
              <span>Save &quot;{recatPrompt.name}&quot; → {recatPrompt.category} as a rule?</span>
              <div className="recat-prompt-btns">
                <button className="recat-rule-btn" onClick={() => handleSaveRule(recatPrompt.name, recatPrompt.category, false)}>Save rule</button>
                <button className="recat-rule-btn recat-rule-history" onClick={() => handleSaveRule(recatPrompt.name, recatPrompt.category, true)}>Save + reclassify all</button>
                <button className="recat-dismiss-btn" onClick={() => setRecatPrompt(null)}>Dismiss</button>
              </div>
            </div>
          )}
          {transactions.length === 0 ? (
            <div className="empty-state">
              <p>No transactions yet.</p>
              <p>Tap <strong>Add spend</strong> to get started.</p>
            </div>
          ) : (
            <>
              {transactions.map(t => {
                const locked = !isDateAllowed(t.date, tier)
                const isEditing = recatId === t.id
                return (
                  <LockedRow key={t.id} locked={locked}>
                    <div className="txn-item fade-up">
                      <div className="txn-icon" style={{ background: (CAT_COLORS[t.category] || '#888') + '22' }}>
                        {CAT_ICONS[t.category] || '\u{1F4E6}'}
                      </div>
                      <div className="txn-detail">
                        <div className="txn-name">{t.name}</div>
                        <div className="txn-meta">
                          {isEditing ? (
                            <select
                              className="recat-select"
                              defaultValue={t.category}
                              disabled={recatSaving}
                              autoFocus
                              onChange={e => handleRecat(t.id, t.name, e.target.value)}
                              onBlur={() => setRecatId(null)}
                            >
                              {['Income','Transfer','Housing','Groceries','Eating out','Transport','Entertainment','Health','Clothing','Subscriptions','Education','Insurance','Savings','Fuel','ATM / Cash','Fees & Charges','Utilities','Travel','Gifts','Home & Garden','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <button
                              className="txn-cat-btn"
                              onClick={() => !locked && setRecatId(t.id)}
                              title="Click to change category"
                            >
                              {t.category}
                            </button>
                          )}
                          {' · '}{fmtDate(t.date)}
                        </div>
                      </div>
                      <div className={`txn-amt ${t.category === 'Income' ? 'inc' : ''}`}>
                        {t.category === 'Income' ? '+' : ''}{fmt(t.amount)}
                      </div>
                      {!locked && (
                        <button className="txn-del" onClick={() => handleDelete(t.id)} title="Delete">x</button>
                      )}
                    </div>
                  </LockedRow>
                )
              })}
              {hasLockedTransactions && (
                <div className="txn-locked-banner">
                  🔒 Older transactions are hidden on your current plan.{' '}
                  <strong>Upgrade from {PLAN_PRICES['starter']}</strong> to unlock your full history.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SUPPORT */}
      {tab === 'support' && (
        <div className="tab-body">
          <SupportChat />
        </div>
      )}

      {/* FAQ */}
      {tab === 'faq' && (
        <div className="tab-body">
          <FAQ />
        </div>
      )}

      {/* IMPORT */}
      {tab === 'import' && (
        <ImportTransactions
          onImportComplete={() => {
            loadTransactions()
            setImportSignal(s => s + 1)
            setTab('overview')
          }}
        />
      )}
    {showAccountCentre && <AccountCentreModal user={user} profile={profile} tier={tier} onClose={() => setShowAccountCentre(false)} onNavigate={onNavigate} />}

      {/* PRIVACY */}
      {tab === 'privacy' && (
        <div className="tab-body">
          <div className="privacy-shell">
            <h2 className="privacy-title">Privacy &amp; Data</h2>
            <p className="privacy-body">bump. stores your transaction data securely in Supabase. Your data is never shared with advertisers. AI analysis runs on anonymised summaries — your raw transactions are never sent to third parties in bulk.</p>
            <p className="privacy-body">You can export or delete your data at any time from Account Centre.</p>
            <button className="privacy-account-btn" onClick={() => { setTab('overview'); setShowAccountCentre(true) }}>Open Account Centre</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ProfileModal sub-component
function ProfileModal({ user, profile, onClose }) {
  const { updateProfile } = useAuth()
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    gross_income: profile?.gross_income ? String(Math.round(profile.gross_income / 100)) : '',
    net_income: profile?.net_income ? String(Math.round(profile.net_income / 100)) : '',
    monthly_debit_orders: profile?.monthly_debit_orders ? String(Math.round(profile.monthly_debit_orders / 100)) : '',
    savings_goal: profile?.savings_goal ? String(Math.round(profile.savings_goal / 100)) : '',
    bank: profile?.bank || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    const toC = v => v ? Math.round(parseFloat(v) * 100) : null
    await updateProfile({
      full_name: form.full_name || null,
      gross_income: toC(form.gross_income),
      net_income: toC(form.net_income),
      monthly_debit_orders: toC(form.monthly_debit_orders),
      savings_goal: toC(form.savings_goal),
      bank: form.bank || null,
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-modal-head">
          <span className="profile-modal-title">My Profile</span>
          <button className="profile-modal-close" onClick={onClose}>x</button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-modal-email">{user.email}</div>
          {[
            { label: 'Full name', field: 'full_name', type: 'text', prefix: '' },
            { label: 'Gross monthly salary', field: 'gross_income', type: 'number', prefix: 'R' },
            { label: 'Net (take-home) salary', field: 'net_income', type: 'number', prefix: 'R' },

            { label: 'Fixed monthly debit orders', field: 'monthly_debit_orders', type: 'number', prefix: 'R' },
            { label: 'Monthly savings goal', field: 'savings_goal', type: 'number', prefix: 'R' },
          ].map(({ label, field, type, prefix }) => (
            <div className="profile-modal-field" key={field}>
              <label className="profile-modal-label">{label}</label>
              <div className="profile-modal-input-wrap">
                {prefix && <span className="profile-modal-prefix">{prefix}</span>}
                <input
                  className="profile-modal-input"
                  type={type}
                  value={form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  style={prefix ? { paddingLeft: '22px' } : {}}
                />
              </div>
            </div>
          ))}
        </div>
        <button className="profile-modal-save" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ConsultRequestCard sub-component
function ConsultRequestCard({ request, loading, onRespond }) {
  const [podcastConsent, setPodcastConsent] = useState(false)

  return (
    <div className="consult-request-card">
      <div className="consult-request-head">
        <span className="consult-request-icon">&#128276;</span>
        <div>
          <div className="consult-request-title">Your consultant is requesting budget access</div>
          <div className="consult-request-sub">
            This lets them view your transactions before your session.
          </div>
        </div>
      </div>
      <label className="consult-consent-row">
        <input
          type="checkbox"
          checked={podcastConsent}
          onChange={e => setPodcastConsent(e.target.checked)}
        />
        <span>I am happy for anonymised insights from my session to be used on a podcast.</span>
      </label>
      <div className="consult-request-actions">
        <button
          className="consult-btn-approve"
          disabled={loading}
          onClick={() => onRespond(request.id, 'approved', podcastConsent)}
        >
          {loading ? '...' : 'Approve access'}
        </button>
        <button
          className="consult-btn-deny"
          disabled={loading}
          onClick={() => onRespond(request.id, 'denied')}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

// AccountCentreModal -- financial profile, subscription, data controls
function AccountCentreModal({ user, profile, tier, onClose, onNavigate }) {
  const { updateProfile } = useAuth()
  const [section, setSection]   = useState('profile')
  const [form, setForm]         = useState({
    full_name:             profile?.full_name || '',
    gross_income:          profile?.gross_income          ? String(Math.round(profile.gross_income / 100))          : '',
    net_income:            profile?.net_income            ? String(Math.round(profile.net_income / 100))            : '',
    monthly_debit_orders:  profile?.monthly_debit_orders  ? String(Math.round(profile.monthly_debit_orders / 100))  : '',
    savings_goal:          profile?.savings_goal          ? String(Math.round(profile.savings_goal / 100))          : '',
    additional_income:     profile?.additional_income     ? String(Math.round(profile.additional_income / 100))     : '',
    savings_balance:       profile?.savings_balance       ? String(Math.round(profile.savings_balance / 100))       : '',
    bank:                  profile?.bank || '',
  })
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const planLabel = { free: 'Free', starter: 'Starter (R49/mo)', growth: 'Growth (R99/mo)', pro: 'Pro (R199/mo)', admin: 'Admin' }

  async function saveProfile() {
    setSaving(true)
    const toC = v => v ? Math.round(parseFloat(v) * 100) : null
    await updateProfile({
      full_name:            form.full_name || null,
      gross_income:         toC(form.gross_income),
      net_income:           toC(form.net_income),
      monthly_debit_orders: toC(form.monthly_debit_orders),
      savings_goal:         toC(form.savings_goal),
      additional_income:    toC(form.additional_income),
      savings_balance:      toC(form.savings_balance),
      bank:                 form.bank || null,
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const SECTIONS = [
    { id: 'profile',      label: 'Financial Profile' },
    { id: 'subscription', label: 'Subscription' },
    { id: 'data',         label: 'Data & Privacy' },
  ]

  return (
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal" onClick={e => e.stopPropagation()}>
        <div className="ac-header">
          <span className="ac-title">Account Centre</span>
          <button className="ac-close" onClick={onClose}>&#x2715;</button>
        </div>

        {/* Section tabs */}
        <div className="ac-section-tabs">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`ac-section-tab ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >{s.label}</button>
          ))}
        </div>

        <div className="ac-body">

          {/* -- Financial Profile -- */}
          {section === 'profile' && (
            <div className="ac-section-content">
              <p className="ac-section-hint">{user.email}</p>
              {[
                { label: 'Full name',                  field: 'full_name',            type: 'text',   prefix: '' },
                { label: 'Gross monthly salary',       field: 'gross_income',         type: 'number', prefix: 'R' },
                { label: 'Net (take-home) salary',     field: 'net_income',           type: 'number', prefix: 'R' },
                { label: 'Fixed monthly debit orders', field: 'monthly_debit_orders', type: 'number', prefix: 'R' },
                { label: 'Monthly savings goal',       field: 'savings_goal',         type: 'number', prefix: 'R' },
                { label: 'Additional monthly income',  field: 'additional_income',    type: 'number', prefix: 'R' },
                { label: 'Current savings balance',    field: 'savings_balance',      type: 'number', prefix: 'R' },
                { label: 'Primary bank',               field: 'bank',                 type: 'text',   prefix: '' },
              ].map(({ label, field, type, prefix }) => (
                <div className="ac-field" key={field}>
                  <label className="ac-field-label">{label}</label>
                  <div className="ac-field-input-wrap">
                    {prefix && <span className="ac-field-prefix">{prefix}</span>}
                    <input
                      className="ac-field-input"
                      type={type}
                      value={form[field]}
                      onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      style={prefix ? { paddingLeft: '22px' } : {}}
                    />
                  </div>
                </div>
              ))}
              <button className="ac-save-btn" onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
              </button>
            </div>
          )}

          {/* -- Subscription -- */}
          {section === 'subscription' && (() => {
            const sub = tier.subscription || {}
            const fmtDate = d => d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : null
            return (
            <div className="ac-section-content">
              <div className="ac-sub-current">
                <span className="ac-sub-label">Current plan</span>
                <span className="ac-sub-plan">{planLabel[tier.plan] || tier.plan}</span>
              </div>

              {/* Billing cycle dates when available from Paystack */}
              {sub.billingCycleStart && sub.billingCycleEnd && (
                <p className="ac-section-hint">
                  Billing period: {fmtDate(sub.billingCycleStart)} – {fmtDate(sub.billingCycleEnd)}
                </p>
              )}
              {sub.nextBillingDate && !sub.cancelAtPeriodEnd && (
                <p className="ac-section-hint">Next renewal: {fmtDate(sub.nextBillingDate)}</p>
              )}

              {/* Pending downgrade or cancellation */}
              {sub.cancelAtPeriodEnd && (
                <div className="ac-pending-change warning">
                  ⚠️ Cancellation scheduled — your plan will revert to Free at end of current billing period
                  {sub.billingCycleEnd && ` (${fmtDate(sub.billingCycleEnd)})`}.
                </div>
              )}
              {sub.scheduledTier && !sub.cancelAtPeriodEnd && sub.scheduledTier !== tier.plan && (
                <div className="ac-pending-change warning">
                  ⚠️ Plan change to {sub.scheduledTier} scheduled for next billing cycle
                  {sub.billingCycleEnd && ` (${fmtDate(sub.billingCycleEnd)})`}.
                </div>
              )}

              {/* History access note */}
              {tier.cutoffDate && (
                <p className="ac-section-hint">
                  History access from: {fmtDate(tier.cutoffDate)}
                </p>
              )}

              {/* Free: upgrade prompt */}
              {!tier.isAdmin && tier.plan === 'free' && (
                <div className="ac-upgrade-block">
                  <p className="ac-upgrade-text">Upgrade to unlock full history, advanced analytics, and AI projections.</p>
                  <div className="ac-upgrade-plans">
                    {['starter', 'growth', 'pro'].map(p => (
                      <div key={p} className="ac-upgrade-plan-card">
                        <span className="ac-up-name">{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                        <span className="ac-up-price">{{ starter: 'R49', growth: 'R99', pro: 'R199' }[p]}/mo</span>
                      </div>
                    ))}
                  </div>
                  <p className="ac-upgrade-note">Contact support to upgrade or manage your plan.</p>
                </div>
              )}

              {/* Paid: manage plan */}
              {!tier.isAdmin && tier.plan !== 'free' && (
                <div className="ac-manage-block">
                  <p className="ac-section-hint">To change or cancel your plan, contact bump. support. Downgrades take effect at the end of your current billing cycle — you keep full access until then.</p>
                  <button className="ac-support-btn" onClick={() => { onClose(); onNavigate && onNavigate('support') }}>
                    Contact support
                  </button>
                </div>
              )}
            </div>
            )
          })()}

          {/* -- Data & Privacy -- */}
          {section === 'data' && (
            <div className="ac-section-content">
              <p className="ac-section-hint">
                Your transaction data is stored securely. It is never shared with advertisers or sold to third parties.
              </p>

              <div className="ac-data-actions">
                <div className="ac-data-row">
                  <div>
                    <div className="ac-data-row-title">Export my data</div>
                    <div className="ac-data-row-hint">Download a CSV of all your transactions.</div>
                  </div>
                  <button className="ac-data-btn" onClick={() => alert('Export coming soon.')}>Export</button>
                </div>

                <div className="ac-data-row">
                  <div>
                    <div className="ac-data-row-title">Delete my account</div>
                    <div className="ac-data-row-hint">Permanently removes your profile and all transaction data. This cannot be undone.</div>
                  </div>
                  {!deleteConfirm ? (
                    <button className="ac-data-btn danger" onClick={() => setDeleteConfirm(true)}>Delete</button>
                  ) : (
                    <div className="ac-delete-confirm">
                      <span className="ac-delete-warn">Are you sure?</span>
                      <button className="ac-data-btn danger" onClick={() => alert('Please contact support to delete your account.')}>Yes, delete</button>
                      <button className="ac-data-btn" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>{/* end ac-body */}
      </div>{/* end ac-modal */}
    </div>   /* end ac-overlay */
  )
}
