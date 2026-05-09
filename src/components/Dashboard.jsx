import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed, PLAN_PRICES } from '../context/TierContext'
import { fetchTransactions, fetchTransactionsByMonth, addTransaction, updateTransaction, deleteTransaction } from '../services/transactions'
import { filterSpend, sumByCategory, sumSpend, sumTxnIncome, buildAIPayload, profileCentsToRands, groupByMonth } from '../utils/financials'
import { parseTransaction, analyseSpending } from '../services/ai'
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

const BUDGETS = {
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
  const { user, profile } = useAuth()
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
  const [showProfileModal, setShowProfileModal] = useState(false)
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

  useEffect(() => {
    loadTransactions()
    loadConsultRequests()
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

  // Shared financial layer -- all spend/income/net calcs go through financials.js
  const spendTxns  = filterSpend(allowedTransactions)
  const txnIncome  = sumTxnIncome(allowedTransactions)
  const profileMonthlyIncome = profileCentsToRands(profile?.net_income)
  // Toggle: declared salary from profile (if set), or logged Income transactions
  const income = (excludeSalary && profileMonthlyIncome > 0) ? profileMonthlyIncome : txnIncome
  const totalSpend = sumSpend(allowedTransactions)
  const net = income - totalSpend

  const catTotals = sumByCategory(allowedTransactions)
  const maxCat = Math.max(...Object.values(catTotals), 1)

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
      const payload = buildAIPayload(allowedTransactions, profile, 200, {
        mode: 'overview',
        budgets: BUDGETS,
        monthlyData: groupByMonth(allowedTransactions),
      })
      const result = await analyseSpending(payload)
      setAiText(result.analysis)
    } catch {
      setAiText('Analysis failed -- check your connection and try again.')
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
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setShowProfileModal(true) }}>My Profile</button>
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setTab('support') }}>Support</button>
                <button className="profile-dropdown-item" onClick={() => { setShowProfileMenu(false); setTab('faq') }}>FAQs</button>
                <div className="profile-dropdown-divider" />
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

      {/* TABS */}
      <div className="tabs">
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
              <div className="section-head">Spend by category</div>
              <div className="cats">
                {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const budget = BUDGETS[cat] || 1000
                  const over = amt > budget
                  const near = !over && amt > budget * 0.8
                  return (
                    <div className="cat-card" key={cat}>
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
          ? <Analytics />
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
      {tab === 'budget' && <Recommendations />}

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
            setTab('overview')
          }}
        />
      )}
    {showProfileModal && <ProfileModal user={user} profile={profile} onClose={() => setShowProfileModal(false)} />}
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
