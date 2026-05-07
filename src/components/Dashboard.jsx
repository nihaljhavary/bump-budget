import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useTier, isDateAllowed, PLAN_PRICES } from '../context/TierContext'
import { fetchTransactions, fetchTransactionsByMonth, addTransaction, deleteTransaction } from '../services/transactions'
import { parseTransaction, analyseSpending } from '../services/ai'
import ImportTransactions from './ImportTransactions'
import Analytics from './Analytics'
import Recommendations from './Recommendations'
import Projections from './Projections'
import GroceryComparison from './GroceryComparison'
import LockedFeature, { LockedRow } from './LockedFeature'
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
  Utilities: '#0D9488', Travel: '#2563EB', Gifts: '#EC4899', Other: '#888'
}

const CAT_ICONS = {
  Housing: '\u{1F3E0}', Groceries: '\u{1F6D2}', 'Eating out': '\u{1F37D}\u{FE0F}',
  Transport: '\u{1F697}', Entertainment: '\u{1F389}', Health: '\u{1F48A}',
  Clothing: '\u{1F455}', Subscriptions: '\u{1F4F1}', Income: '\u{1F4B0}',
  Education: '\u{1F393}', Insurance: '\u{1F6E1}\u{FE0F}', Savings: '\u{1F4B9}',
  Fuel: '\u{26FD}', 'ATM / Cash': '\u{1F4B5}', 'Fees & Charges': '\u{1F4CB}',
  Utilities: '\u{1F4A1}', Travel: '\u{2708}\u{FE0F}', Gifts: '\u{1F381}', Other: '\u{1F4E6}'
}

const BANKS = ['FNB', 'Nedbank', 'ABSA', 'Capitec', 'Standard Bank', 'Discovery Bank', 'TymeBank']
const VITALITY_OPTIONS = [0, 10, 20, 25, 35, 48, 75]

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
// Bug 3 fix: DD MMM YYYY format, append T12:00:00 to avoid UTC-midnight timezone shifts
const fmtDate = dateStr => new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default function Dashboard({ onNavigate }) {
  const { user, profile, refreshProfile } = useAuth()
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
  const chatEndRef = useRef(null)
  const textareaRef = useRef(null)

  const [consultRequests, setConsultRequests] = useState([])
  const [consultActionId, setConsultActionId] = useState(null)

  // Bug 6 fix: profile dropdown + modal state
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      await supabase.from('consultant_access').update(update).eq('id', requestId)
      await loadConsultRequests()
    } catch (err) {
      console.error('Consult response failed:', err)
    }
    setConsultActionId(null)
  }

  const allowedTransactions = useMemo(
    () => transactions.filter(t => isDateAllowed(t.date, tier)),
    [transactions, tier]
  )
  const hasLockedTransactions = transactions.some(t => !isDateAllowed(t.date, tier))

  const spendTxns = allowedTransactions.filter(t => t.category !== 'Income')
  const income = allowedTransactions.filter(t => t.category === 'Income').reduce((s, t) => s + t.amount, 0)
  const totalSpend = spendTxns.reduce((s, t) => s + t.amount, 0)
  const net = income - totalSpend

  const catTotals = {}
  spendTxns.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount })
  const maxCat = Math.max(...Object.values(catTotals), 1)

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
      const saved = await addTransaction(user.id, { name: txn.name, amount: txn.amount, category: txn.category })
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

  function dismissTxn(msgId) { setChatMessages(prev => prev.filter(m => m.id !== msgId)) }

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
      const result = await analyseSpending(allowedTransactions, [], income)
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

  const pendingRequests = consultRequests.filter(r => r.status === 'pending')
  const approvedRequest = consultRequests.find(r => r.status === 'approved')

  return (
    <div className="app-shell">
      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">bump<span className="logo-dot" aria-hidden="true" /></div>
        <div className="nav-right">
          <div className="nav-month-picker">
            <button className="month-arrow" onClick={() => changeMonth(-1)}>&lsaquo;</button>
            <span className="nav-month">{monthDisplayLabel()}</span>
            <button className="month-arrow" onClick={() => changeMonth(1)}>&rsaquo;</button>
          </div>
          {!tier.isAdmin && profile?.subscription_plan && profile.subscription_plan !== 'free' && (
            <span className="nav-plan-badge">{profile.subscription_plan}</span>
          )}
          {(profile?.role === 'admin' || profile?.is_admin || tier.isAdmin) && (
            <button className="nav-admin-btn" onClick={() => onNavigate('admin')} title="Admin Dashboard">
              &#9881;
            </button>
          )}
          {/* Bug 6 fix: profile dropdown menu instead of direct sign-out */}
          <div className="avatar-wrap" ref={profileMenuRef}>
            <button
              className="avatar"
              onClick={() => setShowProfileMenu(v => !v)}
              title="Profile menu"
            >
              {user.email?.[0]?.toUpperCase() || 'U'}
            </button>
            {showProfileMenu && (
              <div className="profile-dropdown">
                <button
                  className="profile-dropdown-item"
                  onClick={() => { setShowProfileMenu(false); setShowProfileModal(true) }}
                >
                  &#x1F464; My Profile
                </button>
                <button className="profile-dropdown-item" onClick={() => setShowProfileMenu(false)}>
                  &#x2699;&#xFE0F; Settings
                </button>
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-item danger"
                  onClick={() => { setShowProfileMenu(false); supabase.auth.signOut() }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* TABS */}
      <div className="tabs">
        {['overview', 'analytics', 'projections', 'groceries', 'budget', 'add spend', 'import', 'transactions'].map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'import' ? '↑ import' : t === 'groceries' ? '🛒 groceries' : t === 'projections' ? '📈 projections' : t}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="tab-body">
          {approvedRequest && (
            <div className="consult-banner">
              <span className="consult-banner-dot" />
              <span>Your consultant has view access to your budget.</span>
            </div>
          )}
          {pendingRequests.length > 0 && (
            <div className="consult-requests-section">
              <div className="section-head">Consultation Requests</div>
              {pendingRequests.map(req => (
                <ConsultRequestCard key={req.id} request={req} loading={consultActionId === req.id} onRespond={handleConsultResponse} />
              ))}
            </div>
          )}
          <div className="salary-row">
            <div>
              <div className="salary-title">Salary exclusion</div>
              <div className="salary-sub">Strip income from spend view</div>
            </div>
            <div className="pill-toggle">
              <button className={excludeSalary ? 'active' : ''} onClick={() => setExcludeSalary(true)}>On</button>
              <button className={!excludeSalary ? 'active' : ''} onClick={() => setExcludeSalary(false)}>Off</button>
            </div>
          </div>
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Total spend</div>
              <div className="metric-val">{fmt(totalSpend)}</div>
              <div className="metric-sub">{excludeSalary ? 'salary excluded' : 'all transactions'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Income</div>
              <div className="metric-val green">{fmt(income)}</div>
              <div className="metric-sub">this month</div>
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
                        <div className="bar-fill" style={{ width: `${Math.min(Math.round(amt / maxCat * 100), 100)}%`, background: CAT_COLORS[cat] || '#888' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          <button className="import-cta-btn" onClick={() => setTab('import')}>
            <span className="import-cta-icon">&uarr;</span>
            <div>
              <div className="import-cta-title">Import bank statement</div>
              <div className="import-cta-sub">Upload CSV or Excel &mdash; bump. categorises everything</div>
            </div>
          </button>
          {transactions.length === 0 && (
            <div className="empty-state">
              <p>No transactions yet.</p>
              <p>Import a statement above or tap <strong>Add spend</strong> to log manually.</p>
            </div>
          )}
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
          <LockedFeature locked={!tier.canConsult} feature="consult" label="Upgrade to Pro — R199/mo">
            <button className="book-consult-btn" onClick={() => onNavigate('book-consult')}>
              Book a financial consultation
            </button>
          </LockedFeature>
          {!tier.isAdmin && tier.plan === 'free' && (
            <div className="tier-nudge">
              &#x1F680; <strong>Free plan:</strong> showing last 30 days. <a href="#upgrade" className="tier-nudge-link">Upgrade from R49/mo</a> for full history, bump. insights &amp; more.
            </div>
          )}
        </div>
      )}

      {/* ANALYTICS */}
      {tab === 'analytics' && <Analytics />}

      {/* PROJECTIONS */}
      {tab === 'projections' && (
        <div className="tab-body">
          <Projections />
        </div>
      )}

      {/* GROCERY COMPARISON */}
      {tab === 'groceries' && (
        <div className="tab-body">
          <GroceryComparison />
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
                {msg.type === 'user' && <div className="chat-bubble user">{msg.text}</div>}
                {(msg.type === 'bot' || msg.type === 'confirmed') && (
                  <div className={`chat-bubble bot ${msg.type === 'confirmed' ? 'confirmed' : ''}`}>{msg.text}</div>
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
          {transactions.length === 0 ? (
            <div className="empty-state">
              <p>No transactions yet.</p>
              <p>Tap <strong>Add spend</strong> to get started.</p>
            </div>
          ) : (
            <>
              {transactions.map(t => {
                const locked = !isDateAllowed(t.date, tier)
                return (
                  <LockedRow key={t.id} locked={locked}>
                    <div className="txn-item fade-up">
                      <div className="txn-icon" style={{ background: (CAT_COLORS[t.category] || '#888') + '22' }}>
                        {CAT_ICONS[t.category] || '\u{1F4E6}'}
                      </div>
                      <div className="txn-detail">
                        <div className="txn-name">{t.name}</div>
                        {/* Bug 3 fix: DD MMM YYYY date format */}
                        <div className="txn-meta">{t.category} &middot; {fmtDate(t.date)}</div>
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
                  &#x1F512; Older transactions are hidden on your current plan.{' '}
                  <strong>Upgrade from {PLAN_PRICES['starter']}</strong> to unlock your full history.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* IMPORT */}
      {tab === 'import' && (
        <ImportTransactions
          onImportComplete={() => { loadTransactions(); setTab('overview') }}
        />
      )}

      {/* Bug 6 fix: Profile modal */}
      {showProfileModal && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onSaved={async () => { await refreshProfile?.(); setShowProfileModal(false) }}
        />
      )}
    </div>
  )
}

// ── ConsultRequestCard ──────────────────────────────────────────────────────
function ConsultRequestCard({ request, loading, onRespond }) {
  const [podcastConsent, setPodcastConsent] = useState(false)
  return (
    <div className="consult-request-card">
      <div className="consult-request-head">
        <span className="consult-request-icon">&#128276;</span>
        <div>
          <div className="consult-request-title">Your consultant is requesting budget access</div>
          <div className="consult-request-sub">This lets them view your transactions before your session.</div>
        </div>
      </div>
      <label className="consult-consent-row">
        <input type="checkbox" checked={podcastConsent} onChange={e => setPodcastConsent(e.target.checked)} />
        <span>I am happy for anonymised insights from my session to be used on a podcast.</span>
      </label>
      <div className="consult-request-actions">
        <button className="consult-btn-approve" disabled={loading} onClick={() => onRespond(request.id, 'approved', podcastConsent)}>
          {loading ? '...' : 'Approve access'}
        </button>
        <button className="consult-btn-deny" disabled={loading} onClick={() => onRespond(request.id, 'denied')}>
          Deny
        </button>
      </div>
    </div>
  )
}

// ── ProfileModal (Bug 6) ────────────────────────────────────────────────────
function ProfileModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: '', gross_income: '', net_income: '',
    monthly_debit_orders: '', savings_goal: '',
    bank: '', vitality_cashback_pct: 0
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, gross_income, net_income, monthly_debit_orders, savings_goal, bank, vitality_cashback_pct')
          .eq('id', user.id)
          .single()
        if (data) {
          const toR = v => (v ? String(Math.round(v / 100)) : '')
          setForm({
            full_name: data.full_name || '',
            gross_income: toR(data.gross_income),
            net_income: toR(data.net_income),
            monthly_debit_orders: toR(data.monthly_debit_orders),
            savings_goal: toR(data.savings_goal),
            bank: data.bank || '',
            vitality_cashback_pct: data.vitality_cashback_pct || 0
          })
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [user.id])

  function update(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('')
    try {
      const toC = v => (v !== '' && v !== null && !isNaN(v) ? Math.round(parseFloat(v) * 100) : null)
      const { error: err } = await supabase.from('profiles').update({
        full_name: form.full_name || null,
        gross_income: toC(form.gross_income),
        net_income: toC(form.net_income),
        monthly_debit_orders: toC(form.monthly_debit_orders),
        savings_goal: toC(form.savings_goal),
        bank: form.bank || null,
        vitality_cashback_pct: form.vitality_cashback_pct || 0
      }).eq('id', user.id)
      if (err) throw err
      setSuccess('Profile updated!')
      setTimeout(() => onSaved(), 800)
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="profile-modal">
        <div className="profile-modal-head">
          <span className="profile-modal-title">My Profile</span>
          <button className="profile-modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>Loading&hellip;</div>
        ) : (
          <>
            {error && <div className="profile-modal-error">{error}</div>}
            {success && <div className="profile-modal-success">&#x2713; {success}</div>}
            <div className="profile-modal-field">
              <label className="profile-modal-label">Full name</label>
              <input className="profile-modal-input" type="text" placeholder="Your name"
                value={form.full_name} onChange={e => update('full_name', e.target.value)} />
            </div>
            {[
              { label: 'Gross monthly income', field: 'gross_income' },
              { label: 'Net (take-home) income', field: 'net_income' },
              { label: 'Fixed monthly debit orders', field: 'monthly_debit_orders' },
              { label: 'Monthly savings goal', field: 'savings_goal' }
            ].map(({ label, field }) => (
              <div className="profile-modal-field" key={field}>
                <label className="profile-modal-label">{label}</label>
                <div className="profile-modal-input-wrap">
                  <span className="profile-modal-prefix">R</span>
                  <input type="number" placeholder="0"
                    value={form[field]} onChange={e => update(field, e.target.value)} />
                </div>
              </div>
            ))}
            <div className="profile-modal-field">
              <label className="profile-modal-label">Bank</label>
              <div className="profile-modal-bank-grid">
                {BANKS.map(b => (
                  <button key={b} className={`profile-modal-bank-pill ${form.bank === b ? 'selected' : ''}`}
                    onClick={() => update('bank', b)}>{b}</button>
                ))}
              </div>
            </div>
            <div className="profile-modal-field">
              <label className="profile-modal-label">Vitality cashback %</label>
              <div className="profile-modal-bank-grid">
                {VITALITY_OPTIONS.map(pct => (
                  <button key={pct}
                    className={`profile-modal-bank-pill ${form.vitality_cashback_pct === pct ? 'selected' : ''}`}
                    onClick={() => update('vitality_cashback_pct', pct)}>{pct}%</button>
                ))}
              </div>
            </div>
            <div className="profile-modal-actions">
              <button className="profile-modal-cancel" onClick={onClose}>Cancel</button>
              <button className="profile-modal-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
