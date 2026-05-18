import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { detectRecurring } from '../utils/recurring'
import './AccountCentre.css'

const CATEGORIES = [
  'Income','Transfer','Housing','Groceries','Eating out','Transport',
  'Entertainment','Health','Clothing','Subscriptions','Education','Insurance',
  'Savings','Fuel','ATM / Cash','Fees & Charges','Utilities','Travel',
  'Gifts','Home & Garden','Other',
]

// Human-readable bank labels keyed by detected_bank value from import
const BANK_LABELS = {
  fnb:       'FNB',
  nedbank:   'Nedbank',
  absa:      'ABSA',
  standard:  'Standard Bank',
  capitec:   'Capitec',
  discovery: 'Discovery Bank',
  tyme:      'TymeBank',
  investec:  'Investec',
  generic:   'Generic / Other',
}

const fmt  = n => 'R' + Math.round(n).toLocaleString('en-ZA')
const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fmtDate = d => d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

async function apiFetch(path, opts = {}) {
  const token = await getToken()
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// ── AccountCentre ─────────────────────────────────────────────────────
export default function AccountCentre({ user, profile, tier, onClose, onNavigate, onDataChange, onUpgrade }) {
  const { updateProfile } = useAuth()
  const [section, setSection] = useState('profile')

  const SECTIONS = [
    { id: 'profile',      label: 'Profile'      },
    { id: 'subscription', label: 'Subscription' },
    { id: 'uploads',      label: 'Uploads'      },
    { id: 'export',       label: 'Export'       },
    { id: 'data',         label: 'Account'      },
  ]

  return (
    <div className="acc-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={e => e.stopPropagation()}>
        <div className="acc-header">
          <span className="acc-title">Account Centre</span>
          <button className="acc-close" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="acc-tabs">
          {SECTIONS.map(s => (
            <button key={s.id} className={`acc-tab ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="acc-body">
          {section === 'profile'      && <ProfileSection user={user} profile={profile} updateProfile={updateProfile} />}
          {section === 'subscription' && <SubscriptionSection tier={tier} onClose={onClose} onNavigate={onNavigate} onUpgrade={onUpgrade} />}
          {section === 'uploads'      && <UploadsSection user={user} onDataChange={onDataChange} />}
          {section === 'export'       && <ExportSection user={user} />}
          {section === 'data'         && <DataSection user={user} onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

// ── Profile Section ─────────────────────────────────────────────────────────
function ProfileSection({ user, profile, updateProfile }) {
  const [form, setForm] = useState({
    full_name:             profile?.full_name || '',
    gross_income:          profile?.gross_income          ? String(Math.round(profile.gross_income / 100))          : '',
    net_income:            profile?.net_income            ? String(Math.round(profile.net_income / 100))            : '',
    monthly_debit_orders:  profile?.monthly_debit_orders  ? String(Math.round(profile.monthly_debit_orders / 100))  : '',
    savings_goal:          profile?.savings_goal          ? String(Math.round(profile.savings_goal / 100))          : '',
    additional_income:     profile?.additional_income     ? String(Math.round(profile.additional_income / 100))     : '',
    savings_balance:       profile?.savings_balance       ? String(Math.round(profile.savings_balance / 100))       : '',
    bank:                  profile?.bank || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

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
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  const FIELDS = [
    { label: 'Full name',                  field: 'full_name',            type: 'text',   prefix: '' },
    { label: 'Gross monthly salary',       field: 'gross_income',         type: 'number', prefix: 'R' },
    { label: 'Net (take-home) salary',     field: 'net_income',           type: 'number', prefix: 'R' },
    { label: 'Fixed monthly debit orders', field: 'monthly_debit_orders', type: 'number', prefix: 'R' },
    { label: 'Monthly savings goal',       field: 'savings_goal',         type: 'number', prefix: 'R' },
    { label: 'Additional monthly income',  field: 'additional_income',    type: 'number', prefix: 'R' },
    { label: 'Current savings balance',    field: 'savings_balance',      type: 'number', prefix: 'R' },
    { label: 'Primary bank',               field: 'bank',                 type: 'text',   prefix: '' },
  ]

  return (
    <div className="acc-section">
      <p className="acc-hint">{user.email}</p>
      {FIELDS.map(({ label, field, type, prefix }) => (
        <div className="acc-field" key={field}>
          <label className="acc-field-label">{label}</label>
          <div className="acc-input-wrap">
            {prefix && <span className="acc-input-prefix">{prefix}</span>}
            <input
              className="acc-input"
              type={type}
              value={form[field]}
              onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
              style={prefix ? { paddingLeft: '22px' } : {}}
            />
          </div>
        </div>
      ))}
      <button className="acc-primary-btn" onClick={saveProfile} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
      </button>
    </div>
  )
}

// ── Subscription Section ────────────────────────────────────────────────────────────
function SubscriptionSection({ tier, onClose, onNavigate, onUpgrade }) {
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState(null)   // { type: 'ok'|'err', text }
  const [confirm, setConfirm] = useState(null)   // 'cancel' | 'downgrade:starter' | 'downgrade:growth'

  const sub = tier.subscription || {}

  // Correctly distinguish downgrade (scheduledTier is a real plan) from cancellation (free)
  const isDowngrade   = sub.cancelAtPeriodEnd && sub.scheduledTier && sub.scheduledTier !== 'free'
  const isCancel      = sub.cancelAtPeriodEnd && (!sub.scheduledTier || sub.scheduledTier === 'free')
  const hasPending    = isDowngrade || isCancel
  const isTrialing    = sub.isTrialing === true

  const planLabel = {
    free:    'Free',
    starter: 'Starter — R49/mo',
    growth:  'Growth — R99/mo',
    pro:     'Pro — R199/mo',
    admin:   'Admin',
  }

  const planCapital = p => p ? p.charAt(0).toUpperCase() + p.slice(1) : ''

  async function handleAction(action, plan) {
    setBusy(true); setMsg(null); setConfirm(null)
    try {
      const body = plan ? { action, plan } : { action }
      const data = await apiFetch('/.netlify/functions/manage-subscription', { method: 'POST', body: JSON.stringify(body) })
      setMsg({ type: 'ok', text: data.message || 'Done.' })
      // Refresh profile so TierContext picks up the change
      window.location.reload()
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc-section">
      {/* Current plan pill */}
      <div className="acc-plan-row">
        <span className="acc-plan-label">Current plan</span>
        <span className="acc-plan-value">{planLabel[tier.plan] || tier.plan}</span>
      </div>

      {/* Trial banner */}
      {isTrialing && (
        <div className="acc-alert ok" style={{ marginBottom: 12 }}>
          <strong>30-day free trial active</strong>
          {sub.trialEndsAt ? ` — first payment on ${fmtDate(sub.trialEndsAt)}` : ''}.
          Cancel anytime before then for no charge.
        </div>
      )}

      {/* Billing cycle dates */}
      {(sub.billingCycleStart || sub.billingCycleEnd || sub.nextBillingDate) && (
        <div className="acc-billing-block">
          {sub.billingCycleStart && sub.billingCycleEnd && (
            <div className="acc-billing-row">
              <span className="acc-billing-label">Billing cycle</span>
              <span className="acc-billing-value">{fmtDate(sub.billingCycleStart)} – {fmtDate(sub.billingCycleEnd)}</span>
            </div>
          )}
          {sub.billingCycleEnd && !hasPending && (
            <div className="acc-billing-row">
              <span className="acc-billing-label">Next renewal</span>
              <span className="acc-billing-value">{fmtDate(sub.billingCycleEnd)}</span>
            </div>
          )}
          {sub.billingCycleEnd && hasPending && (
            <div className="acc-billing-row">
              <span className="acc-billing-label">Full access until</span>
              <span className="acc-billing-value acc-billing-value--end">{fmtDate(sub.billingCycleEnd)}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending change banners — mutually exclusive */}
      {isCancel && (
        <div className="acc-alert warning">
          <div>
            <strong>Cancellation scheduled</strong> — your plan reverts to Free at end of billing cycle
            {sub.billingCycleEnd ? ` (${fmtDate(sub.billingCycleEnd)})` : ''}. You keep full access until then.
          </div>
          <button className="acc-link-btn" onClick={() => handleAction('reactivate')} disabled={busy}>
            Undo cancellation
          </button>
        </div>
      )}
      {isDowngrade && (
        <div className="acc-alert warning">
          <div>
            <strong>Downgrade scheduled</strong> — moving to {planCapital(sub.scheduledTier)} at end of billing cycle
            {sub.billingCycleEnd ? ` (${fmtDate(sub.billingCycleEnd)})` : ''}. You keep your current plan until then.
          </div>
          <button className="acc-link-btn" onClick={() => handleAction('reactivate')} disabled={busy}>
            Undo downgrade
          </button>
        </div>
      )}

      {msg && <div className={`acc-alert ${msg.type}`}>{msg.text}</div>}

      {/* Free: upgrade — real checkout flow */}
      {!tier.isAdmin && tier.plan === 'free' && (
        <div className="acc-box">
          <p className="acc-box-text">Upgrade to unlock full history, AI analytics, and projections.</p>
          <div className="acc-plan-cards">
            {[
              { id: 'starter', price: 'R49/mo', desc: '90 days history, analytics' },
              { id: 'growth',  price: 'R99/mo', desc: '1 year history, AI projections',  featured: true },
              { id: 'pro',     price: 'R199/mo',desc: 'Full history, consultant access' },
            ].map(p => (
              <div
                key={p.id}
                className={`acc-plan-card${p.featured ? ' acc-plan-card--featured' : ''}`}
                onClick={() => onUpgrade && onUpgrade(p.id)}
                style={onUpgrade ? { cursor: 'pointer' } : undefined}
              >
                {p.featured && <span className="acc-plan-card-badge">Popular</span>}
                <span className="acc-plan-card-name">{p.id.charAt(0).toUpperCase() + p.id.slice(1)}</span>
                <span className="acc-plan-card-price">{p.price}</span>
                <span className="acc-plan-card-desc">{p.desc}</span>
              </div>
            ))}
          </div>
          <button
            className="acc-primary-btn"
            onClick={() => onUpgrade && onUpgrade('growth')}
          >
            Start 30-day free trial &rarr;
          </button>
          <p className="acc-hint" style={{ textAlign: 'center', marginTop: 6 }}>
            No charge today &middot; cancel anytime &middot; secured by Paystack
          </p>
        </div>
      )}

      {/* Paid + no pending change: manage */}
      {!tier.isAdmin && tier.plan !== 'free' && !hasPending && (
        <div className="acc-box">
          <p className="acc-box-title">Manage subscription</p>
          <p className="acc-hint">Changes activate at your next billing date — you keep full access until then.</p>

          {/* Downgrade to Growth */}
          {tier.plan === 'pro' && (
            <div className="acc-manage-row">
              <div>
                <div className="acc-manage-label">Downgrade to Growth (R99/mo)</div>
                <div className="acc-hint">Lose consultant access; keep AI analytics and projections.</div>
              </div>
              {confirm === 'downgrade:growth' ? (
                <div className="acc-confirm-btns">
                  <button className="acc-btn warn" onClick={() => handleAction('downgrade', 'growth')} disabled={busy}>{busy ? '...' : 'Confirm'}</button>
                  <button className="acc-btn" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              ) : (
                <button className="acc-btn" onClick={() => setConfirm('downgrade:growth')}>Downgrade</button>
              )}
            </div>
          )}

          {/* Downgrade to Starter */}
          {(tier.plan === 'pro' || tier.plan === 'growth') && (
            <div className="acc-manage-row">
              <div>
                <div className="acc-manage-label">Downgrade to Starter (R49/mo)</div>
                <div className="acc-hint">90 days history, analytics only. Lose projections and grocery tools.</div>
              </div>
              {confirm === 'downgrade:starter' ? (
                <div className="acc-confirm-btns">
                  <button className="acc-btn warn" onClick={() => handleAction('downgrade', 'starter')} disabled={busy}>{busy ? '...' : 'Confirm'}</button>
                  <button className="acc-btn" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              ) : (
                <button className="acc-btn" onClick={() => setConfirm('downgrade:starter')}>Downgrade</button>
              )}
            </div>
          )}

          {/* Cancel */}
          <div className="acc-manage-row danger">
            <div>
              <div className="acc-manage-label">Cancel subscription</div>
              <div className="acc-hint">Reverts to Free plan at end of billing cycle.</div>
            </div>
            {confirm === 'cancel' ? (
              <div className="acc-confirm-btns">
                <button className="acc-btn danger" onClick={() => handleAction('cancel')} disabled={busy}>{busy ? '...' : 'Yes, cancel'}</button>
                <button className="acc-btn" onClick={() => setConfirm(null)}>Keep plan</button>
              </div>
            ) : (
              <button className="acc-btn danger" onClick={() => setConfirm('cancel')}>Cancel plan</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Uploads Section ─────────────────────────────────────────────────────────────────────
function UploadsSection({ user, onDataChange }) {
  const [batches,  setBatches]  = useState(null)  // null = loading
  const [err,      setErr]      = useState(null)
  const [deleting, setDeleting] = useState(null)  // batchId being deleted
  const [confirm,  setConfirm]  = useState(null)  // batchId to confirm delete
  const [search,   setSearch]   = useState('')    // filter by bank name

  const load = useCallback(async () => {
    setBatches(null); setErr(null)
    try {
      const data = await apiFetch('/.netlify/functions/manage-uploads')
      setBatches(data.batches || [])
    } catch (e) {
      setErr(e.message)
      setBatches([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteBatch(batchId) {
    setDeleting(batchId); setErr(null)
    try {
      await apiFetch('/.netlify/functions/manage-uploads', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', batchId }),
      })
      setConfirm(null)
      await load()
      onDataChange?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setDeleting(null)
    }
  }

  if (batches === null) return <div className="acc-section"><div className="acc-loading">Loading uploads...</div></div>

  // Filter by bank name (search term matches readable bank label or ID)
  const filtered = search.trim()
    ? batches.filter(b => {
        const bank = b.detectedBank || ''
        const label = BANK_LABELS[bank] || bank
        return label.toLowerCase().includes(search.toLowerCase()) ||
               bank.toLowerCase().includes(search.toLowerCase())
      })
    : batches

  const totalTxns  = batches.reduce((s, b) => s + b.count, 0)
  const confirmBatch = confirm ? batches.find(b => b.batchId === confirm) : null

  return (
    <div className="acc-section">
      <p className="acc-hint">
        Each row represents one uploaded bank statement. Deleting a batch removes all its transactions and recalculates your analytics. Manually added transactions are never affected.
      </p>

      {batches.length > 0 && (
        <div className="acc-uploads-summary">
          <span>{batches.length} {batches.length === 1 ? 'statement' : 'statements'}</span>
          <span className="acc-uploads-summary-dot">·</span>
          <span>{totalTxns.toLocaleString()} transactions</span>
          {filtered.length < batches.length && (
            <>
              <span className="acc-uploads-summary-dot">·</span>
              <span>{filtered.length} shown</span>
            </>
          )}
        </div>
      )}

      {batches.length > 2 && (
        <div className="acc-upload-search-wrap">
          <input
            className="acc-input acc-upload-search"
            type="search"
            placeholder="Filter by bank..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {err && <div className="acc-alert err">{err}</div>}

      {batches.length === 0 ? (
        <div className="acc-empty">No uploaded statements yet. Use the Import tab to upload your bank statement.</div>
      ) : filtered.length === 0 ? (
        <div className="acc-empty">No statements match "{search}".</div>
      ) : (
        <div className="acc-upload-list">
          {filtered.map(b => {
            const bankLabel = b.detectedBank ? (BANK_LABELS[b.detectedBank] || b.detectedBank.toUpperCase()) : null
            const isConfirming = confirm === b.batchId
            return (
              <div key={b.batchId} className={`acc-upload-row ${isConfirming ? 'acc-upload-row--confirming' : ''}`}>
                <div className="acc-upload-info">
                  <div className="acc-upload-header">
                    <div className="acc-upload-range">{fmtD(b.fromDate)} – {fmtD(b.toDate)}</div>
                    {bankLabel && <span className="acc-upload-bank">{bankLabel}</span>}
                  </div>
                  <div className="acc-upload-meta">
                    {b.count} transactions &nbsp;·&nbsp; {fmt(b.totalAmount / 100)} spend
                  </div>
                  <div className="acc-upload-when">Uploaded {fmtDate(new Date(b.createdAt))}</div>

                  {/* Inline delete confirmation with context */}
                  {isConfirming && (
                    <div className="acc-upload-confirm-inline">
                      <div className="acc-upload-confirm-text">
                        Remove <strong>{b.count} transactions</strong> from {fmtD(b.fromDate)} to {fmtD(b.toDate)}? This cannot be undone.
                      </div>
                      <div className="acc-confirm-btns">
                        <button
                          className="acc-btn danger"
                          onClick={() => deleteBatch(b.batchId)}
                          disabled={deleting === b.batchId}
                        >{deleting === b.batchId ? 'Deleting...' : 'Yes, remove'}</button>
                        <button className="acc-btn" onClick={() => setConfirm(null)} disabled={!!deleting}>Keep it</button>
                      </div>
                    </div>
                  )}
                </div>
                {!isConfirming && (
                  <div className="acc-upload-actions">
                    <button className="acc-btn danger" onClick={() => setConfirm(b.batchId)}>Delete</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Export Section ──────────────────────────────────────────────────────────────────
function ExportSection({ user }) {
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState(null)
  const [category, setCategory] = useState('All')

  // Date range with sensible default: last 12 months
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))

  function applyPreset(preset) {
    const today = new Date()
    const iso = d => d.toISOString().slice(0, 10)
    if (preset === '1m') {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      setFromDate(iso(from)); setToDate(iso(today))
    } else if (preset === '3m') {
      const from = new Date(today.getFullYear(), today.getMonth() - 2, 1)
      setFromDate(iso(from)); setToDate(iso(today))
    } else if (preset === '12m') {
      const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
      setFromDate(iso(from)); setToDate(iso(today))
    } else if (preset === 'ytd') {
      setFromDate(`${today.getFullYear()}-01-01`); setToDate(iso(today))
    } else if (preset === 'all') {
      setFromDate('2020-01-01'); setToDate(iso(today))
    }
  }

  // Fetch all transactions matching current filters (paginated, cents from DB)
  async function fetchForExport() {
    const PAGE = 1000
    let all = []
    let offset = 0
    for (;;) {
      let q = supabase
        .from('transactions')
        .select('date, name, amount, category, raw_merchant')
        .eq('user_id', user.id)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (category !== 'All') q = q.eq('category', category)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      all.push(...(data || []))
      if ((data || []).length < PAGE) break
      offset += PAGE
    }
    return all
  }

  // Build analytics summary from raw rows (cents in DB, convert to rands for display)
  function buildAnalyticsSummary(rows) {
    const spendRows   = rows.filter(r => r.category !== 'Income' && r.category !== 'Transfer' && r.category !== 'Savings')
    const incomeRows  = rows.filter(r => r.category === 'Income')
    const totalSpend  = spendRows.reduce((s, r) => s + (r.amount || 0), 0) / 100
    const totalIncome = incomeRows.reduce((s, r) => s + (r.amount || 0), 0) / 100

    // Approximate month count from date range
    const from = new Date(fromDate + 'T12:00:00')
    const to   = new Date(toDate   + 'T12:00:00')
    const monthCount = Math.max(1,
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
    )

    // Category totals (spend only)
    const catMap = {}
    for (const r of spendRows) {
      catMap[r.category] = (catMap[r.category] || 0) + (r.amount || 0)
    }

    const overviewRows = [
      ['Metric', 'Total (R)', 'Monthly Avg (R)'],
      ['Total income',  (totalIncome).toFixed(2),                 (totalIncome / monthCount).toFixed(2)],
      ['Total spend',   (totalSpend).toFixed(2),                  (totalSpend  / monthCount).toFixed(2)],
      ['Net (surplus)', (totalIncome - totalSpend).toFixed(2),    ((totalIncome - totalSpend) / monthCount).toFixed(2)],
      ['Months in range', String(monthCount), ''],
      [],
      ['Category Breakdown', '', ''],
      ['Category', 'Total (R)', 'Monthly Avg (R)'],
      ...Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => [cat, (amt / 100).toFixed(2), (amt / 100 / monthCount).toFixed(2)]),
    ]

    return overviewRows
  }

  async function exportCSV() {
    setLoading(true); setErr(null)
    try {
      const rows = await fetchForExport()
      if (rows.length === 0) { setErr('No transactions found for the selected filters.'); setLoading(false); return }

      // amounts are cents in DB — divide by 100 for export
      const header = 'Date,Description,Amount (R),Category\n'
      const lines  = rows.map(r =>
        `${r.date},"${(r.name || '').replace(/"/g, '""')}",${(r.amount / 100).toFixed(2)},${r.category}`
      ).join('\n')
      const blob = new Blob([header + lines], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = `bump_transactions_${fromDate}_to_${toDate}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }

  async function exportXLSX() {
    setLoading(true); setErr(null)
    try {
      const rows = await fetchForExport()
      if (rows.length === 0) { setErr('No transactions found for the selected filters.'); setLoading(false); return }

      // ── Sheet 1: Transactions ──────────────────────────────────────────────
      const txnData = [
        ['Date', 'Description', 'Amount (R)', 'Category'],
        ...rows.map(r => [r.date, r.name || r.raw_merchant || '', (r.amount / 100).toFixed(2), r.category]),
      ]

      // ── Sheet 2: Category Summary ──────────────────────────────────────────
      // Spend only (excludes Income/Transfer/Savings) — matches Analytics tab logic
      const spendRows = rows.filter(r => r.category !== 'Income' && r.category !== 'Transfer' && r.category !== 'Savings')
      const catMap = {}
      for (const r of spendRows) {
        if (!catMap[r.category]) catMap[r.category] = { count: 0, total: 0 }
        catMap[r.category].count++
        catMap[r.category].total += r.amount
      }
      const totalSpend = Object.values(catMap).reduce((s, v) => s + v.total, 0)
      const summaryData = [
        ['Category', 'Transactions', 'Total (R)', '% of Spend'],
        ...Object.entries(catMap)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([cat, v]) => [
            cat,
            v.count,
            (v.total / 100).toFixed(2),
            totalSpend > 0 ? ((v.total / totalSpend) * 100).toFixed(1) + '%' : '0%',
          ]),
      ]

      // ── Sheet 3: Analytics Overview ────────────────────────────────────────
      // Numerically reconciles with visible Analytics/Overview values
      const analyticsData = buildAnalyticsSummary(rows)

      // ── Sheet 4: Recurring Obligations ────────────────────────────────────
      // detectRecurring expects { name, amount (rands), category, date }
      // Amounts are in cents from DB — convert first
      const recurringInput = rows.map(r => ({ ...r, amount: r.amount / 100 }))
      const recurring = detectRecurring(recurringInput)
      const recurringData = [
        ['Merchant', 'Category', 'Median Amount (R)', 'Avg Amount (R)', 'Months Seen', 'Type'],
        ...recurring.map(r => [
          r.merchant,
          r.category,
          r.medianAmount.toFixed(2),
          r.avgAmount.toFixed(2),
          r.months.length,
          r.isObligation ? 'Obligation' : 'Habitual',
        ]),
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txnData),      'Transactions')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData),  'Category Summary')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(analyticsData),'Analytics Overview')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recurringData),'Recurring')
      XLSX.writeFile(wb, `bump_report_${fromDate}_to_${toDate}.xlsx`)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="acc-section">
      <p className="acc-hint">
        Export your transaction data with analytics summaries. The Excel report includes four sheets: Transactions, Category Summary, Analytics Overview, and Recurring Obligations.
      </p>

      {/* Date presets */}
      <div className="acc-export-presets">
        <span className="acc-field-label">Quick range</span>
        <div className="acc-preset-btns">
          {[
            { id: '1m',  label: 'This month' },
            { id: '3m',  label: '3 months'   },
            { id: '12m', label: '12 months'  },
            { id: 'ytd', label: 'This year'  },
            { id: 'all', label: 'All time'   },
          ].map(p => (
            <button key={p.id} className="acc-preset-btn" onClick={() => applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom filters */}
      <div className="acc-export-filters">
        <div className="acc-field">
          <label className="acc-field-label">From date</label>
          <input className="acc-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="acc-field">
          <label className="acc-field-label">To date</label>
          <input className="acc-input" type="date" value={toDate}   onChange={e => setToDate(e.target.value)} />
        </div>
        <div className="acc-field">
          <label className="acc-field-label">Category</label>
          <select className="acc-input" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="All">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="acc-alert err">{err}</div>}

      <div className="acc-export-btns">
        <button className="acc-primary-btn" onClick={exportXLSX} disabled={loading}>
          {loading ? 'Preparing...' : '↓ Download Excel report'}
        </button>
        <button className="acc-secondary-btn" onClick={exportCSV} disabled={loading}>
          {loading ? 'Preparing...' : '↓ Download CSV'}
        </button>
      </div>
      <p className="acc-hint">
        Excel includes category breakdown and analytics summary that reconcile with your Overview and Analytics tabs.
        CSV exports raw transactions only.
      </p>
    </div>
  )
}

// ── Data / Account Section ───────────────────────────────────────────────────────────────
function DataSection({ user, onClose }) {
  const [deleteStep,  setDeleteStep]  = useState(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting,    setDeleting]    = useState(false)
  const [deleteErr,   setDeleteErr]   = useState(null)

  async function handleDelete() {
    if (deleteInput !== 'DELETE') return
    setDeleting(true); setDeleteErr(null)
    try {
      await apiFetch('/.netlify/functions/delete-account', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (e) {
      setDeleteErr(e.message)
      setDeleting(false)
    }
  }

  return (
    <div className="acc-section">
      <p className="acc-hint">
        Your financial data is encrypted in transit and stored securely. It is never sold to third parties or used for advertising. You can export all your data from the Export tab before deleting.
      </p>

      <div className="acc-danger-box">
        <div className="acc-danger-title">Delete account</div>
        <div className="acc-danger-desc">
          Permanently removes your profile, all uploaded statements, transaction history, and categorisation rules. Any active subscription will be cancelled immediately. This cannot be undone.
        </div>

        {deleteStep === 0 && (
          <button className="acc-btn danger" onClick={() => setDeleteStep(1)}>Delete my account</button>
        )}

        {deleteStep === 1 && (
          <div className="acc-delete-warning">
            <div className="acc-delete-warning-text">
              <strong>This is permanent and irreversible.</strong> All your transactions, categories, rules, and profile data will be deleted immediately. Your subscription will be cancelled and no refund will be issued for unused time.
            </div>
            <div className="acc-confirm-btns">
              <button className="acc-btn danger" onClick={() => setDeleteStep(2)}>I understand — continue</button>
              <button className="acc-btn" onClick={() => setDeleteStep(0)}>Cancel</button>
            </div>
          </div>
        )}

        {deleteStep === 2 && (
          <div className="acc-delete-final">
            <label className="acc-field-label">Type <strong>DELETE</strong> to confirm</label>
            <input
              className="acc-input"
              type="text"
              placeholder="Type DELETE"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && deleteInput === 'DELETE' && handleDelete()}
              autoFocus
            />
            {deleteErr && <div className="acc-alert err">{deleteErr}</div>}
            <div className="acc-confirm-btns">
              <button
                className="acc-btn danger"
                onClick={handleDelete}
                disabled={deleteInput !== 'DELETE' || deleting}
              >{deleting ? 'Deleting...' : 'Delete permanently'}</button>
              <button className="acc-btn" onClick={() => { setDeleteStep(0); setDeleteInput('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
