import { useState, useEffect } from 'react'
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
  Housing: '🏠', Groceries: '🛒', 'Eating out': '🍽️', Transport: '🚗',
  Entertainment: '🎉', Health: '💊', Clothing: '👕', Subscriptions: '📱', Income: '💰', Other: '📦'
}

const fmtAmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
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
  const [data, setData]             = useState({ requests: [], bookings: [], profiles: [] })
  const [loading, setLoading]       = useState(true)
  const [actionId, setActionId]     = useState(null)
  const [viewingUser, setViewingUser] = useState(null)   // { id, name, transactions }
  const [viewLoading, setViewLoading] = useState(false)
  const [tab, setTab]               = useState('requests') // requests | bookings

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

  function exportUserTransactions(user) {
    if (!user?.transactions?.length) return
    const txns = user.transactions

    // Sheet 1: raw transactions
    const txnRows = txns.map(t => ({
      Date: t.date,
      Description: t.name,
      Category: t.category,
      Amount: (t.amount / 100).toFixed(2),
    }))

    // Sheet 2: category summary
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
          <button className="btn-ghost-sm" onClick={onBack}>← Dashboard</button>
        </div>
      </nav>

      {/* TABS */}
      <div className="tabs">
        {[['requests', 'Access Requests'], ['bookings', 'Bookings']].map(([t, label]) => (
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

      {loading ? (
        <div className="admin-loading">
          <div className="typing"><span /><span /><span /></div>
        </div>
      ) : (
        <div className="admin-body">

          {/* ── Access Requests tab ─────────────────────────────────────── */}
          {tab === 'requests' && (
            <>
              {/* Pending */}
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
                    <button
                      className="btn-approve"
                      onClick={() => handleAccessAction(req.id, 'approved')}
                      disabled={actionId === req.id}
                    >Approve</button>
                    <button
                      className="btn-deny"
                      onClick={() => handleAccessAction(req.id, 'denied')}
                      disabled={actionId === req.id}
                    >Deny</button>
                  </div>
                </div>
              ))}

              {/* Approved */}
              {approved.length > 0 && (
                <>
                  <div className="admin-section-head" style={{ marginTop: '16px' }}>
                    Approved — View Access
                  </div>
                  {approved.map(req => (
                    <div className="admin-card" key={req.id}>
                      <div className="admin-card-info">
                        <div className="admin-card-name">{req.user?.full_name || 'Unknown'}</div>
                        <div className="admin-card-meta">
                          Approved {req.granted_at ? new Date(req.granted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}
                          {req.podcast_consent && ' · Podcast consent ✓'}
                        </div>
                      </div>
                      <button
                        className="btn-view"
                        onClick={() => viewBudget(req.user?.id, req.user?.full_name)}
                        disabled={viewLoading}
                      >
                        {viewLoading ? '…' : 'View Budget'}
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Denied */}
              {denied.length > 0 && (
                <>
                  <div className="admin-section-head" style={{ marginTop: '16px' }}>Denied</div>
                  {denied.map(req => (
                    <div className="admin-card denied" key={req.id}>
                      <div className="admin-card-info">
                        <div className="admin-card-name">{req.user?.full_name || 'Unknown'}</div>
                        <div className="admin-card-meta">
                          {new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <button
                        className="btn-approve"
                        onClick={() => handleAccessAction(req.id, 'approved')}
                        disabled={actionId === req.id}
                        style={{ marginLeft: 'auto' }}
                      >Re-approve</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Bookings tab ─────────────────────────────────────────────── */}
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

        </div>
      )}

      {/* ── Budget Modal ──────────────────────────────────────────────────── */}
      {viewingUser && (
        <div className="modal-overlay" onClick={() => setViewingUser(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{viewingUser.name}'s Budget</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {viewingUser.transactions.length > 0 && (
                  <button
                    className="btn-ghost-sm"
    
                    onClick={() => exportUserTransactions(viewingUser)}
                    title="Export transactions to Excel"
                  >
                    ↓ Excel
                  </button>
                )}
                <button className="modal-close" onClick={() => setViewingUser(null)}>×</button>
              </div>
            </div>
            <div className="modal-badge">Read-only view</div>
            <div className="modal-body">
              {viewingUser.transactions.length === 0 ? (
                <div className="admin-empty">No transactions on record.</div>
              ) : viewingUser.transactions.map(t => (
                <div className="modal-txn" key={t.id}>
                  <div className="modal-txn-icon" style={{ background: (CAT_COLORS[t.category] || '#888') + '22' }}>
                    {CAT_ICONS[t.category] || '📦'}
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
