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

  // Errors tab state
  const [errorLogs, setErrorLogs]           = useState([])
  const [topErrors, setTopErrors]           = useState([])
  const [errorsLoading, setErrorsLoading]   = useState(false)
  const [errDomain, setErrDomain]           = useState('')   // filter
  const [errSeverity, setErrSeverity]       = useState('')   // filter

  // Support tab state
  const [supportReqs, setSupportReqs]       = useState([])
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportFilter, setSupportFilter]   = useState('')  // status filter
  const [updatingSupport, setUpdatingSupport] = useState(null)
  const [updatingBooking, setUpdatingBooking] = useState(null)

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

  async function updateBookingStatus(bookingId, newStatus) {
    setUpdatingBooking(bookingId)
    try {
      await callAdmin('update_booking_status', { bookingId, status: newStatus })
      setData(d => ({
        ...d,
        bookings: d.bookings.map(b => b.id === bookingId ? { ...b, status: newStatus } : b)
      }))
    } catch (err) {
      alert('Failed to update booking: ' + err.message)
    } finally {
      setUpdatingBooking(null)
    }
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
    if (tab === 'errors')  loadErrors()
    if (tab === 'support') loadSupport()
  }, [tab])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadErrors() {
    setErrorsLoading(true)
    try {
      const result = await callAdmin('get_error_logs', {
        limit: 150,
        ...(errDomain   ? { domain:   errDomain }   : {}),
        ...(errSeverity ? { severity: errSeverity } : {}),
      })
      setErrorLogs(result.logs    || [])
      setTopErrors(result.topErrors || [])
    } catch (err) {
      console.error('Error logs load failed:', err)
    }
    setErrorsLoading(false)
  }

  async function loadSupport() {
    setSupportLoading(true)
    try {
      const result = await callAdmin('get_support_requests',
        supportFilter ? { status: supportFilter } : {}
      )
      setSupportReqs(result.requests || [])
    } catch (err) {
      console.error('Support requests load failed:', err)
    }
    setSupportLoading(false)
  }

  async function handleSupportStatus(requestId, status) {
    setUpdatingSupport(requestId)
    try {
      await callAdmin('update_support_status', { requestId, status })
      setSupportReqs(prev => prev.map(r => r.id === requestId ? { ...r, status } : r))
    } catch (err) {
      console.error('Status update failed:', err)
    }
    setUpdatingSupport(null)
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
        {[['requests', 'Access Requests'], ['bookings', 'Bookings'], ['testers', 'Tester Access'], ['errors', 'Errors'], ['support', 'Support']].map(([t, label]) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
            {t === 'requests' && pending.length > 0 && (
              <span className="tab-badge">{pending.length}</span>
            )}
            {t === 'support' && supportReqs.filter(r => r.status === 'open').length > 0 && (
              <span className="tab-badge">{supportReqs.filter(r => r.status === 'open').length}</span>
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
              ) : data.bookings.map(b => {
                const ref = (b.payment_ref || '').split(' | ')[0]
                const slotDate = b.booking_date
                  ? new Date(b.booking_date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : null
                const slotTime = b.booking_time || null
                const fmtTime  = t => { if (!t) return ''; const [h] = t.split(':').map(Number); return h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM` }
                const busy = updatingBooking === b.id
                const tierLabel = b.tier === 'property_analysis' ? 'Property consult'
                  : b.tier === 'budget_consult' ? 'Budget consult' : null
                const det = b.details || {}
                const detRows = [
                  ['Type', det.propertyType], ['Address', det.address], ['Suburb', det.suburb],
                  ['Asking', det.askingPrice], ['ERF', det.erfNumber], ['Sectional title', det.sectionalTitleNumber],
                  ['Link', det.listingLink], ['Notes', det.notes], ['Goal', det.goal],
                ].filter(([, v]) => v)
                return (
                  <div className="admin-card admin-booking-card" key={b.id}>
                    <div className="admin-card-info" style={{ flex: 1 }}>
                      <div className="admin-card-name">
                        {b.user?.full_name || b.name || 'Unknown'}
                        {tierLabel && <span className="admin-booking-tier"> {tierLabel}</span>}
                      </div>
                      <div className="admin-card-meta">
                        {slotDate && slotTime
                          ? <><strong>{slotDate}</strong> at <strong>{fmtTime(slotTime)}</strong> &nbsp;·&nbsp;</>
                          : null}
                        {ref} &nbsp;·&nbsp; {fmtCents(b.amount)}
                      </div>
                      {(b.email || b.phone) && (
                        <div className="admin-card-meta">
                          {b.email}{b.email && b.phone ? ' · ' : ''}{b.phone}
                        </div>
                      )}
                      {detRows.length > 0 && (
                        <div className="admin-booking-details">
                          {detRows.map(([k, v]) => (
                            <span key={k}><strong>{k}:</strong> {String(v)}</span>
                          ))}
                          {det.docsPending && (
                            <span className="admin-docs-pending"><strong>Docs outstanding</strong> — client will email with proof of payment</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="admin-booking-actions">
                      <span className={`status-pill ${b.status}`}>{b.status.replace('_', ' ')}</span>
                      {b.status === 'pending_eft' && (
                        <>
                          <button className="admin-btn-confirm" disabled={busy} onClick={() => updateBookingStatus(b.id, 'paid')}>
                            {busy ? '...' : 'Mark paid'}
                          </button>
                          <button className="admin-btn-cancel" disabled={busy} onClick={() => updateBookingStatus(b.id, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {b.status === 'paid' && (
                        <>
                          <button className="admin-btn-confirm" disabled={busy} onClick={() => updateBookingStatus(b.id, 'confirmed')}>
                            {busy ? '...' : 'Confirm'}
                          </button>
                          <button className="admin-btn-complete" disabled={busy} onClick={() => updateBookingStatus(b.id, 'completed')}>
                            Complete
                          </button>
                          <button className="admin-btn-cancel" disabled={busy} onClick={() => updateBookingStatus(b.id, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {b.status === 'confirmed' && (
                        <>
                          <button className="admin-btn-complete" disabled={busy} onClick={() => updateBookingStatus(b.id, 'completed')}>
                            {busy ? '...' : 'Mark complete'}
                          </button>
                          <button className="admin-btn-cancel" disabled={busy} onClick={() => updateBookingStatus(b.id, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {(b.status === 'completed' || b.status === 'cancelled') && (
                        <button className="admin-btn-ghost" disabled={busy} onClick={() => updateBookingStatus(b.id, 'pending_eft')}>
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
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
                    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-sans)',
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
                              fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)',
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
                              fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)',
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


          {/* -- Errors tab ----------------------------------------------- */}
          {tab === 'errors' && (
            <>
              <div className="admin-section-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <span>Error Logs</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Last 150 events. Filters apply on reload.</span>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <select
                    value={errSeverity}
                    onChange={e => { setErrSeverity(e.target.value) }}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value="">All severity</option>
                    <option value="error">error</option>
                    <option value="warn">warn</option>
                    <option value="info">info</option>
                  </select>
                  <select
                    value={errDomain}
                    onChange={e => { setErrDomain(e.target.value) }}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value="">All domains</option>
                    {['ingestion','categorisation','reconciliation','enrichment','duplicate','ledger','deployment','auth','ai','upload','frontend','subscription'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <button
                    onClick={loadErrors}
                    style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >
                    Reload
                  </button>
                </div>
              </div>

              {errorsLoading ? (
                <div className="admin-loading"><div className="typing"><span /><span /><span /></div></div>
              ) : (
                <>
                  {/* Top recurring errors */}
                  {topErrors.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Recurring errors</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                        {topErrors.slice(0, 8).map((g, i) => {
                          const sevColor = g.severity === 'error' ? 'var(--red)' : g.severity === 'warn' ? 'var(--amber)' : 'var(--muted)'
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-alt)', borderRadius: 8, borderLeft: `3px solid ${sevColor}` }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, textTransform: 'uppercase', minWidth: 36 }}>{g.severity}</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 80 }}>{g.domain || '-'}</span>
                              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{(g.message || '').slice(0, 90)}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', whiteSpace: 'nowrap' }}>{g.count}x</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{g.affectedUsers} user{g.affectedUsers !== 1 ? 's' : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Recent error log */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Recent events</div>
                  {errorLogs.length === 0 ? (
                    <div className="admin-empty">No error logs found.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {errorLogs.map(log => {
                        const sevColor = log.severity === 'error' ? 'var(--red)' : log.severity === 'warn' ? 'var(--amber)' : 'var(--muted)'
                        const ts = new Date(log.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        const msg = log.message || log.error_message || '-'
                        return (
                          <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '44px 70px 90px 1fr 130px', gap: 8, padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, alignItems: 'center', borderLeft: `3px solid ${sevColor}` }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, textTransform: 'uppercase' }}>{log.severity}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.domain || '-'}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.email || (log.user_id ? log.user_id.slice(0,8) + '…' : 'anon')}</span>
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.slice(0, 120)}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{ts}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* -- Support tab ----------------------------------------------- */}
          {tab === 'support' && (
            <>
              <div className="admin-section-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <span>Support Requests</span>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  {['', 'open', 'in_progress', 'resolved'].map(s => (
                    <button
                      key={s}
                      onClick={() => { setSupportFilter(s); setTimeout(loadSupport, 50) }}
                      style={{
                        padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${supportFilter === s ? 'var(--coral)' : 'var(--border)'}`,
                        background: supportFilter === s ? 'var(--coral)' : 'transparent',
                        color: supportFilter === s ? '#fff' : 'var(--text)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {s || 'All'}
                    </button>
                  ))}
                </div>
              </div>

              {supportLoading ? (
                <div className="admin-loading"><div className="typing"><span /><span /><span /></div></div>
              ) : supportReqs.length === 0 ? (
                <div className="admin-empty">No support requests found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {supportReqs.map(req => {
                    const statusColors = { open: 'var(--amber)', in_progress: 'var(--coral)', resolved: 'var(--success)' }
                    const ts = new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                    const busy = updatingSupport === req.id
                    return (
                      <div key={req.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${statusColors[req.status] || 'var(--border)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
                              {req.full_name || 'Unknown user'}
                              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>{req.email || ''}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600, marginBottom: 6 }}>{req.category}</div>
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{req.message}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{ts}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: statusColors[req.status] || 'var(--muted)', textTransform: 'uppercase', textAlign: 'right' }}>{req.status?.replace('_', ' ')}</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {req.status !== 'open' && (
                                <button onClick={() => handleSupportStatus(req.id, 'open')} disabled={busy}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid var(--amber)', background: 'transparent', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                                  {busy ? '...' : 'Reopen'}
                                </button>
                              )}
                              {req.status !== 'in_progress' && (
                                <button onClick={() => handleSupportStatus(req.id, 'in_progress')} disabled={busy}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid var(--coral)', background: 'transparent', color: 'var(--coral)', fontSize: 11, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                                  {busy ? '...' : 'In Progress'}
                                </button>
                              )}
                              {req.status !== 'resolved' && (
                                <button onClick={() => handleSupportStatus(req.id, 'resolved')} disabled={busy}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--success)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                                  {busy ? '...' : 'Resolve'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
