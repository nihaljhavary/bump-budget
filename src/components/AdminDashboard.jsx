import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { useTier } from '../context/TierContext'
import './AdminDashboard.css'

const CAT_COLORS = {
  Housing: '#378ADD', Groceries: '#1D9E75', 'Eating out': '#D85A30',
  Transport: '#BA7517', Entertainment: '#7F77DD', Health: '#D4537E',
  Clothing: '#639922', Subscriptions: '#888780', Income: '#1a6b45', Other: '#888'
}
const CAT_ICONS = {
  Housing: '\u{1f3e0}', Groceries: '\u{1f6d2}', 'Eating out': '\u{1f37d}\u{fe0f}', Transport: '\u{1f697}',
  Entertainment: '\u{1f389}', Health: '\u{1f48a}', Clothing: '\u{1f455}', Subscriptions: '\u{1f4f1}', Income: '\u{1f4b0}', Other: '\u{1f4e6}'
}

const PLAN_LABELS = { free: 'Free', starter: 'Starter', growth: 'Growth', pro: 'Pro' }
const PLAN_COLORS = { free: '#888', starter: '#378ADD', growth: '#1D9E75', pro: '#D85A30' }

const fmtAmt  = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const fmtCents = n => 'R' + Math.round(n / 100).toLocaleString('en-ZA')

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

async function callAdmin(action, extra = {}) {
  const token = await getToken()
  const res = await fetch('/.netlify/functions/admin-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...extra })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function AdminDashboard({ onBack }) {
  const { simulatedPlan, setSimulatedPlan } = useTier()
  const [data, setData]               = useState({ requests: [], bookings: [], profiles: [] })
  const [loading, setLoading]         = useState(true)
  const [actionId, setActionId]       = useState(null)
  const [viewingUser, setViewingUser] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [tab, setTab]                 = useState('requests')

  // Tester tab state
  const [testerProfiles, setTesterProfiles] = useState([])
  const [testerLoading, setTesterLoading]   = useState(false)
  const [testerError, setTesterError]       = useState('')
  const [testerSearch, setTesterSearch]     = useState('')
  const [grantingId, setGrantingId]         = useState(null)   // userId currently being acted on

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const result = await callAdmin('get_dashboard')
      setData(result)
    } catch (err) {
      console.error('Admin load failed:', err)
    }
    setLoading(false)
  }

  const loadTesters = useCallback(async () => {
    if (testerProfiles.length > 0 && !testerLoading) return  // already loaded
    setTesterLoading(true)
    setTesterError('')
    try {
      const result = await callAdmin('list_all_profiles')
      setTesterProfiles(result.profiles || [])
    } catch (err) {
      setTesterError('Failed to load profiles: ' + err.message)
    }
    setTesterLoading(false)
  }, [testerProfiles.length, testerLoading])

  // Load tester list when switching to that tab
  useEffect(() => {
    if (tab === 'testers') loadTesters()
  }, [tab])

  async function handleAccessAction(requestId, status) {
    setActionId(requestId)
    try {
      await callAdmin('update_access_status', { accessId: requestId, status })
      await load()
    } catch (err) {
      console.error('Action failed:', err)
    }
    setActionId(null)
  }

  async function viewBudget(userId, userName) {
    setViewLoading(true)
    try {
      const result = await callAdmin('get_user_transactions', { userId })
      setViewingUser({ id: userId, name: userName, transactions: result.transactions || [] })
    } catch (err) {
      console.error('Failed to load user budget:', err)
    }
    setViewLoading(false)
  }

  async function handleGrantTier(userId, plan) {
    setGrantingId(userId + '_' + plan)
    try {
      await callAdmin('grant_tier', { userId, plan })
      // Refresh tester list so new plan shows immediately
      setTesterProfiles([])
      await loadTesters()
    } catch (err) {
      setTesterError('Grant failed: ' + err.message)
    }
    setGrantingId(null)
  }

  async function handleRevokeTier(userId) {
    setGrantingId(userId + '_revoke')
    try {
      await callAdmin('revoke_tier', { userId })
      setTesterProfiles([])
      await loadTesters()
    } catch (err) {
      setTesterError('Revoke failed: ' + err.message)
    }
    setGrantingId(null)
  }

  function exportUserTransactions(user) {
    if (!user?.transactions?.length) return
    const txns = user.transactions

    const txnRows = txns.map(t => ({
      Date:        t.date,
      Description: t.name,
      Category:    t.category,
      Amount:      (t.amount / 100).toFixed(2),
    }))

    const catMap = {}
    for (const t of txns) {
      if (t.category === 'Income') continue
      catMap[t.category] = (catMap[t.category] || 0) + t.amount
    }
    const catRows = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, cents]) => ({ Category: cat, Total: (cents / 100).toFixed(2) }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), 'Transactions')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'Category Summary')

    const safeName = (user.name || 'user').replace(/[^a-z0-9]/gi, '_').toLowerCase()
    XLSX.writeFile(wb, `bump_${safeName}_transactions.xlsx`)
  }

  const pending  = (data.requests || []).filter(r => r.status === 'pending')
  const approved = (data.requests || []).filter(r => r.status === 'approved')
  const denied   = (data.requests || []).filter(r => r.status === 'denied')

  const filteredTesters = testerProfiles.filter(p => {
    if (!testerSearch.trim()) return true
    const q = testerSearch.toLowerCase()
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email     || '').toLowerCase().includes(q) ||
      (p.subscription_plan || 'free').includes(q)
    )
  })

  return (
    <div className="admin-shell">
      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">
          bump<em>budget</em>
          <span className="admin-tag">admin</span>
        </div>
        <div className="nav-right">
          <div className="sim-wrap">
            <label className="sim-label">Simulate tier</label>
            <select
              className="sim-select"
              value={simulatedPlan || ''}
              onChange={e => setSimulatedPlan(e.target.value || null)}
            >
              <option value="">Admin (default)</option>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <button className="btn-ghost-sm" onClick={onBack}>&#x2190; Dashboard</button>
        </div>
      </nav>

      {/* TABS */}
      <div className="tabs">
        {[['requests', 'Access Requests'], ['bookings', 'Bookings'], ['testers', 'Tester Access']].map(([t, label]) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
            {t === 'requests' && pending.length > 0 && (
              <span className="tab-badge">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && tab !== 'testers' ? (
        <div className="admin-loading">
          <div className="typing"><span /><span /><span /></div>
        </div>
      ) : (
        <div className="admin-body">

          {/* -- Access Requests tab ---------------------------------------- */}
          {tab === 'requests' && (
            <>
              <div className="admin-section-head">
                Pending
                {pending.length > 0 && <span className="count-pill">{pending.length}</span>}
              </div>
              {pending.length === 0 ? (
                <div className="admin-empty">No pending requests.</div>
              ) : pending.map(req => (
                <div className="admin-card" key={req.id}>
                  <div className="admin-card-info">
                    <div className="admin-card-name">{req.user?.full_name || 'Unknown'}</div>
                    <div className="admin-card-meta">
                      Requested {new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="admin-card-actions">
                    <button className="btn-approve" onClick={() => handleAccessAction(req.id, 'approved')} disabled={actionId === req.id}>Approve</button>
                    <button className="btn-deny"    onClick={() => handleAccessAction(req.id, 'denied')}   disabled={actionId === req.id}>Deny</button>
                  </div>
                </div>
              ))}

              {approved.length > 0 && (
                <>
                  <div className="admin-section-head" style={{ marginTop: '16px' }}>Approved — View Access</div>
                  {approved.map(req => (
                    <div className="admin-card" key={req.id}>
                      <div className="admin-card-info">
                        <div className="admin-card-name">{req.user?.full_name || 'Unknown'}</div>
                        <div className="admin-card-meta">
                          Approved {req.granted_at ? new Date(req.granted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}
                          {req.podcast_consent && ' · Podcast consent ✓'}
                        </div>
                      </div>
                      <button className="btn-view" onClick={() => viewBudget(req.user?.id, req.user?.full_name)} disabled={viewLoading}>
                        {viewLoading ? '…' : 'View Budget'}
                      </button>
                    </div>
                  ))}
                </>
              )}

              {denied.length > 0 && (
                <>
                  <div className="admin-section-head" style={{ marginTop: '16px' }}>Denied</div>
                  {denied.map(req => (
                    <div className="admin-card denied" key={req.id}>
                      <div className="admin-card-info">
                        <div className="admin-card-name">{req.user?.full_name || 'Unknown'}</div>
                        <div className="admin-card-meta">{new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <button className="btn-approve" onClick={() => handleAccessAction(req.id, 'approved')} disabled={actionId === req.id} style={{ marginLeft: 'auto' }}>Re-approve</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* -- Bookings tab ----------------------------------------------- */}
          {tab === 'bookings' && (
            <>
              <div className="admin-section-head">All Bookings</div>
              {(!data.bookings || data.bookings.length === 0) ? (
                <div className="admin-empty">No bookings yet.</div>
              ) : data.bookings.map(b => (
                <div className="admin-card" key={b.id}>
                  <div className="admin-card-info">
                    <div className="admin-card-name">{b.user?.full_name || 'Unknown'}</div>
                    <div className="admin-card-meta">
                      {b.tier} · {fmtCents(b.amount)} · {new Date(b.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <span className={`status-pill ${b.status}`}>{b.status}</span>
                </div>
              ))}
            </>
          )}

          {/* -- Tester Access tab ------------------------------------------ */}
          {tab === 'testers' && (
            <>
              <div className="admin-section-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>Tester Access</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                  Grant premium tiers without Paystack. Changes take effect immediately on next profile load.
                </span>
              </div>

              {testerError && (
                <div style={{ background: 'var(--red-light)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  {testerError}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={testerSearch}
                  onChange={e => setTesterSearch(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 14px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
                    outline: 'none',
                  }}
                />
              </div>

              {testerLoading ? (
                <div className="admin-loading"><div className="typing"><span /><span /><span /></div></div>
              ) : filteredTesters.length === 0 ? (
                <div className="admin-empty">{testerSearch ? 'No matching users.' : 'No profiles found.'}</div>
              ) : filteredTesters.map(p => {
                const currentPlan = p.subscription_plan || 'free'
                const isAdmin     = p.is_admin || p.role === 'admin'
                const busy        = grantingId?.startsWith(p.id)
                return (
                  <div className="admin-card" key={p.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div className="admin-card-info" style={{ flex: 1, minWidth: 180 }}>
                      <div className="admin-card-name">
                        {p.full_name || <em style={{ color: 'var(--muted)' }}>No name</em>}
                        {isAdmin && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--coral-light)', color: 'var(--coral)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>admin</span>}
                      </div>
                      <div className="admin-card-meta">
                        {p.email && <span>{p.email} &middot; </span>}
                        <span style={{ color: PLAN_COLORS[currentPlan] || '#888', fontWeight: 600 }}>
                          {PLAN_LABELS[currentPlan] || currentPlan}
                        </span>
                        {p.subscription_status && p.subscription_status !== 'active' && (
                          <span style={{ marginLeft: 4, color: 'var(--amber)', fontSize: 11 }}>({p.subscription_status})</span>
                        )}
                      </div>
                    </div>
                    {!isAdmin && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {['starter', 'growth', 'pro'].map(plan => (
                          <button
                            key={plan}
                            onClick={() => handleGrantTier(p.id, plan)}
                            disabled={busy || currentPlan === plan}
                            style={{
                              padding: '5px 11px', borderRadius: 7, border: 'none', cursor: busy || currentPlan === plan ? 'not-allowed' : 'pointer',
                              background: currentPlan === plan ? 'var(--bg-alt)' : 'var(--coral)', color: currentPlan === plan ? 'var(--muted)' : '#fff',
                              fontSize: 12, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                              opacity: busy && grantingId === p.id + '_' + plan ? 0.6 : 1,
                            }}
                          >
                            {busy && grantingId === p.id + '_' + plan ? '...' : PLAN_LABELS[plan]}
                          </button>
                        ))}
                        {currentPlan !== 'free' && (
                          <button
                            onClick={() => handleRevokeTier(p.id)}
                            disabled={busy}
                            style={{
                              padding: '5px 11px', borderRadius: 7, border: '1.5px solid var(--red)', cursor: busy ? 'not-allowed' : 'pointer',
                              background: 'transparent', color: 'var(--red)',
                              fontSize: 12, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                              opacity: busy && grantingId === p.id + '_revoke' ? 0.6 : 1,
                            }}
                          >
                            {busy && grantingId === p.id + '_revoke' ? '...' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

        </div>
      )}

      {/* -- Budget Modal ----------------------------------------------------- */}
      {viewingUser && (
        <div className="modal-overlay" onClick={() => setViewingUser(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{viewingUser.name}'s Budget</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {viewingUser.transactions.length > 0 && (
                  <button className="btn-ghost-sm" onClick={() => exportUserTransactions(viewingUser)} title="Export transactions to Excel">
                    &#x2193; Excel
                  </button>
                )}
                <button className="modal-close" onClick={() => setViewingUser(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-badge">Read-only view</div>
            <div className="modal-body">
              {viewingUser.transactions.length === 0 ? (
                <div className="admin-empty">No transactions on record.</div>
              ) : viewingUser.transactions.map(t => (
                <div className="modal-txn" key={t.id}>
                  <div className="modal-txn-icon" style={{ background: (CAT_COLORS[t.category] || '#888') + '22' }}>
                    {CAT_ICONS[t.category] || '\u{1f4e6}'}
                  </div>
                  <div className="modal-txn-detail">
                    <div className="modal-txn-name">{t.name}</div>
                    <div className="modal-txn-meta">
                      {t.category} · {new Date(t.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className={`modal-txn-amt ${t.category === 'Income' ? 'inc' : ''}`}>
                    {t.category === 'Income' ? '+' : ''}{fmtAmt(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
