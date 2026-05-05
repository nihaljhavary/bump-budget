import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './ImportTransactions.css'

const CATEGORIES = [
  'Income', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Other'
]

const BANKS = [
  { id: 'fnb',          label: 'FNB',           logo: '🏦' },
  { id: 'nedbank',      label: 'Nedbank',        logo: '🟢' },
  { id: 'absa',         label: 'ABSA',           logo: '🔴' },
  { id: 'standard',     label: 'Standard Bank',  logo: '🔵' },
  { id: 'capitec',      label: 'Capitec',        logo: '🟣' },
  { id: 'discovery',    label: 'Discovery Bank', logo: '💎' },
  { id: 'tyme',         label: 'TymeBank',       logo: '🟡' },
  { id: 'generic',      label: 'Other / Generic',logo: '📄' },
]

const CAT_COLORS = {
  Housing: '#378ADD', Groceries: '#1D9E75', 'Eating out': '#D85A30',
  Transport: '#BA7517', Entertainment: '#7F77DD', Health: '#D4537E',
  Clothing: '#639922', Subscriptions: '#888780', Income: '#1a6b45',
  Education: '#0891B2', Insurance: '#7C3AED', Savings: '#059669',
  Fuel: '#D97706', 'ATM / Cash': '#6B7280', 'Fees & Charges': '#DC2626',
  Utilities: '#0D9488', Travel: '#2563EB', Gifts: '#EC4899', Other: '#888'
}

// ── Bank-specific column parsers ──────────────────────────────────────────────

function normaliseAmount(val) {
  if (val === undefined || val === null || val === '') return null
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? null : Math.abs(n)
}

function normaliseDate(val) {
  if (!val) return new Date().toISOString().split('T')[0]
  // Excel serial date
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const s = String(val).trim()
  // Try common SA formats: DD/MM/YYYY, YYYY-MM-DD, DD MMM YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3]
    return `${y}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  // Let JS parse the rest
  const d = new Date(s)
  if (!isNaN(d)) return d.toISOString().split('T')[0]
  return new Date().toISOString().split('T')[0]
}

function findCol(headers, ...options) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim())
  for (const opt of options) {
    const idx = lower.findIndex(h => h.includes(opt.toLowerCase()))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function parseRows(rows, bankId) {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])

  let dateCol, descCol, amtCol, debitCol, creditCol

  switch (bankId) {
    case 'fnb':
      dateCol  = findCol(headers, 'date')
      descCol  = findCol(headers, 'description', 'desc', 'narrative')
      amtCol   = findCol(headers, 'amount')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      break
    case 'nedbank':
      dateCol  = findCol(headers, 'date')
      descCol  = findCol(headers, 'transaction description', 'description', 'desc')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      amtCol   = findCol(headers, 'amount')
      break
    case 'absa':
      dateCol  = findCol(headers, 'transaction date', 'date')
      descCol  = findCol(headers, 'description', 'narrative')
      debitCol = findCol(headers, 'debit amount', 'debit')
      creditCol= findCol(headers, 'credit amount', 'credit')
      amtCol   = findCol(headers, 'amount')
      break
    case 'standard':
      dateCol  = findCol(headers, 'date')
      descCol  = findCol(headers, 'description', 'transaction details')
      amtCol   = findCol(headers, 'amount')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      break
    case 'capitec':
      dateCol  = findCol(headers, 'date')
      descCol  = findCol(headers, 'description', 'transaction type', 'reference')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      amtCol   = findCol(headers, 'amount')
      break
    default:
      // Auto-detect
      dateCol  = findCol(headers, 'date', 'transaction date', 'txn date')
      descCol  = findCol(headers, 'description', 'narrative', 'details', 'reference', 'transaction')
      amtCol   = findCol(headers, 'amount')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
  }

  const result = []
  for (const row of rows) {
    const desc = row[descCol] ? String(row[descCol]).trim() : null
    if (!desc) continue // skip empty rows

    let amount = null
    let isIncome = false

    if (amtCol && row[amtCol] !== undefined && row[amtCol] !== '') {
      const raw = parseFloat(String(row[amtCol]).replace(/[^0-9.\-]/g, ''))
      if (!isNaN(raw)) {
        isIncome = raw > 0
        amount = Math.abs(raw)
      }
    } else if (debitCol || creditCol) {
      const debit  = normaliseAmount(row[debitCol])
      const credit = normaliseAmount(row[creditCol])
      if (credit && credit > 0) { amount = credit; isIncome = true }
      else if (debit && debit > 0) { amount = debit; isIncome = false }
    }

    if (!amount || amount <= 0) continue

    result.push({
      date:        normaliseDate(row[dateCol]),
      description: desc,
      amount,
      is_income:   isIncome,
    })
  }

  return result
}

// ── Token helper ──────────────────────────────────────────────────────────────
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ImportTransactions({ onImportComplete }) {
  const { user, profile } = useAuth()
  const [step, setStep] = useState('bank')   // bank → upload → preview → done
  const [bank, setBank] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed] = useState([])    // raw parsed rows
  const [categorised, setCategorised] = useState([]) // after Claude
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ruleText, setRuleText] = useState('')
  const [ruleLoading, setRuleLoading] = useState(false)
  const [ruleMessage, setRuleMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const fileRef = useRef()

  // ── File parsing ─────────────────────────────────────────────────────────
  function handleFile(file) {
    setError(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (rows.length === 0) { setError('No data found in file'); return }
        const txns = parseRows(rows, bank)
        if (txns.length === 0) { setError("Couldn't find transaction columns. Try selecting a different bank or use \"Other / Generic\"."); return }
        setParsed(txns)
        setStep('preview')
        categoriseWithClaude(txns)
      } catch (err) {
        setError('Could not read file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [bank])

  // ── Claude categorisation ─────────────────────────────────────────────────
  async function categoriseWithClaude(txns) {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch('/.netlify/functions/parse-bulk-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          transactions: txns,
          bank: bank || 'generic'
        })
      })

      if (res.status === 429) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Monthly AI limit reached')
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Categorisation failed (${res.status})`)
      }

      const data = await res.json()
      setCategorised(data.transactions.map((t, i) => ({
        ...t,
        id: i,
        include: true
      })))
    } catch (err) {
      setError(err.message)
      // Still show parsed data with "Other" as fallback
      setCategorised(txns.map((t, i) => ({ ...t, id: i, category: 'Other', include: true })))
    } finally {
      setLoading(false)
    }
  }

  // ── Category edit ─────────────────────────────────────────────────────────
  function updateCategory(id, category) {
    setCategorised(prev => prev.map(t => t.id === id ? { ...t, category } : t))
  }

  function toggleInclude(id) {
    setCategorised(prev => prev.map(t => t.id === id ? { ...t, include: !t.include } : t))
  }

  // ── Rule creation ─────────────────────────────────────────────────────────
  async function handleAddRule() {
    if (!ruleText.trim()) return
    setRuleLoading(true)
    setRuleMessage(null)
    try {
      const token = await getToken()
      const res = await fetch('/.netlify/functions/manage-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ natural_language: ruleText })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save rule')
      setRuleMessage({ type: 'ok', text: `✓ Rule saved: "${data.merchant_pattern}" → ${data.category}` })
      setRuleText('')
      // Re-apply the new rule to current categorised list
      const lower = data.merchant_pattern.toLowerCase()
      setCategorised(prev => prev.map(t =>
        t.description.toLowerCase().includes(lower) ? { ...t, category: data.category, rule_applied: true } : t
      ))
    } catch (err) {
      setRuleMessage({ type: 'err', text: err.message })
    } finally {
      setRuleLoading(false)
    }
  }

  // ── Save to Supabase ──────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError(null)
    const batchId = crypto.randomUUID()
    const toSave = categorised
      .filter(t => t.include)
      .map(t => ({
        user_id: user.id,
        name: t.description,
        amount: t.amount,
        category: t.category || 'Other',
        date: t.date,
        raw_merchant: t.raw_merchant || t.description,
        import_batch_id: batchId
      }))

    try {
      const { error } = await supabase.from('transactions').insert(toSave)
      if (error) throw error
      setSavedCount(toSave.length)
      setStep('done')

      // Save bank preference
      if (bank && bank !== 'generic') {
        await supabase.from('user_preferences').upsert(
          { user_id: user.id, preferred_bank: bank, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      }
    } catch (err) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedCount  = categorised.filter(t => t.include).length
  const totalAmount    = categorised.filter(t => t.include && t.category !== 'Income').reduce((s, t) => s + t.amount, 0)
  const incomeAmount   = categorised.filter(t => t.include && t.category === 'Income').reduce((s, t) => s + t.amount, 0)
  const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

  // ── STEP: bank selection ──────────────────────────────────────────────────
  if (step === 'bank') {
    return (
      <div className="import-shell">
        <div className="import-header">
          <h2>Import transactions</h2>
          <p>Select your bank so we can read your statement correctly</p>
        </div>
        <div className="bank-grid">
          {BANKS.map(b => (
            <button
              key={b.id}
              className={`bank-card ${bank === b.id ? 'selected' : ''}`}
              onClick={() => setBank(b.id)}
            >
              <span className="bank-logo">{b.logo}</span>
              <span className="bank-label">{b.label}</span>
              {bank === b.id && <span className="bank-check">✓</span>}
            </button>
          ))}
        </div>
        <div className="import-hint">
          Export from your banking app: Statements → CSV or Excel → Download
        </div>
        <button
          className="import-primary-btn"
          disabled={!bank}
          onClick={() => setStep('upload')}
        >
          Next — upload file
        </button>
      </div>
    )
  }

  // ── STEP: file upload ─────────────────────────────────────────────────────
  if (step === 'upload') {
    const bankLabel = BANKS.find(b => b.id === bank)?.label || ''
    return (
      <div className="import-shell">
        <button className="import-back" onClick={() => setStep('bank')}>← Back</button>
        <div className="import-header">
          <h2>Upload {bankLabel} statement</h2>
          <p>CSV or Excel (.xlsx) format accepted</p>
        </div>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div className="drop-icon">📂</div>
          <div className="drop-label">Drop your statement here</div>
          <div className="drop-sub">or tap to browse</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
          />
        </div>
        {error && <div className="import-error">{error}</div>}
        <div className="import-tips">
          <strong>Tips for {bankLabel}:</strong>
          {bank === 'fnb'      && <p>Go to Transact → Accounts → Statement → Download CSV</p>}
          {bank === 'nedbank'  && <p>Money app → Accounts → Statement → Export → CSV</p>}
          {bank === 'absa'     && <p>Online Banking → My Accounts → Statement → Download Excel</p>}
          {bank === 'standard' && <p>Internet Banking → Accounts → Statement → Export</p>}
          {bank === 'capitec'  && <p>Capitec app → Transactions → Export → CSV</p>}
          {bank === 'generic'  && <p>Any CSV with Date, Description, and Amount columns will work</p>}
        </div>
      </div>
    )
  }

  // ── STEP: preview & categorise ────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="import-shell preview-shell">
        <div className="preview-header">
          <div>
            <h2>Review transactions</h2>
            <p className="preview-sub">
              {loading
                ? 'bump. is analysing your transactions...'
                : `${categorised.length} transactions found — review and adjust categories`
              }
            </p>
          </div>
          {!loading && (
            <div className="preview-summary">
              <div className="preview-stat">
                <span>{fmt(incomeAmount)}</span>
                <small>income</small>
              </div>
              <div className="preview-stat red">
                <span>{fmt(totalAmount)}</span>
                <small>expenses</small>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="ai-loading">
            <div className="ai-spinner">
              <span/><span/><span/>
            </div>
            <p>Analysing {parsed.length} transactions...</p>
          </div>
        )}

        {!loading && error && <div className="import-error">{error}</div>}

        {/* Rule creation */}
        {!loading && (
          <div className="rule-box">
            <div className="rule-label">Create a categorisation rule</div>
            <div className="rule-input-row">
              <input
                type="text"
                className="rule-input"
                value={ruleText}
                onChange={e => setRuleText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddRule()}
                placeholder='e.g. "make all Engen = Fuel"'
              />
              <button
                className="rule-btn"
                onClick={handleAddRule}
                disabled={ruleLoading || !ruleText.trim()}
              >
                {ruleLoading ? '...' : 'Add'}
              </button>
            </div>
            {ruleMessage && (
              <div className={`rule-msg ${ruleMessage.type}`}>{ruleMessage.text}</div>
            )}
          </div>
        )}

        {/* Transaction table */}
        {!loading && categorised.length > 0 && (
          <div className="txn-table-wrap">
            <table className="txn-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {categorised.map(t => (
                  <tr key={t.id} className={!t.include ? 'excluded' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={t.include}
                        onChange={() => toggleInclude(t.id)}
                      />
                    </td>
                    <td className="td-date">{t.date}</td>
                    <td className="td-desc">{t.description}</td>
                    <td className={`td-amt ${t.category === 'Income' ? 'inc' : ''}`}>
                      {t.category === 'Income' ? '+' : ''}{fmt(t.amount)}
                    </td>
                    <td>
                      <select
                        className="cat-select"
                        value={t.category || 'Other'}
                        onChange={e => updateCategory(t.id, e.target.value)}
                        style={{ borderLeft: `3px solid ${CAT_COLORS[t.category] || '#888'}` }}
                      >
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="preview-actions">
            <button className="import-back-btn" onClick={() => { setStep('upload'); setCategorised([]) }}>
              ← Re-upload
            </button>
            <button
              className="import-primary-btn"
              disabled={saving || selectedCount === 0}
              onClick={handleSave}
            >
              {saving ? 'Saving...' : `Import ${selectedCount} transactions`}
            </button>
          </div>
        )}

        {error && !loading && <div className="import-error">{error}</div>}
      </div>
    )
  }

  // ── STEP: done ────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="import-shell import-done">
        <div className="done-icon">✓</div>
        <h2>{savedCount} transactions imported</h2>
        <p>Your spending has been categorised and added to your dashboard.</p>
        <div className="done-actions">
          <button className="import-primary-btn" onClick={onImportComplete}>
            View dashboard
          </button>
          <button className="import-secondary-btn" onClick={() => {
            setStep('bank')
            setCategorised([])
            setParsed([])
            setError(null)
            setSavedCount(0)
          }}>
            Import another file
          </button>
        </div>
      </div>
    )
  }

  return null
}
