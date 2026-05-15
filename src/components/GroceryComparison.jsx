import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchRecentMonths } from '../services/transactions'
import './GroceryComparison.css'

const STORES = ['Woolworths', 'Checkers', 'Checkers Sixty60', 'Pick n Pay', 'Pick n Pay ASAP', 'Shoprite', 'Spar', 'Clicks', 'Dis-Chem', 'Makro', 'Other']
const fmt  = n => 'R' + (n / 100).toFixed(2)
const fmtR = n => 'R' + Math.round(n / 100).toLocaleString('en-ZA')

// ---------------------------------------------------------------------------
// Client-side grocery intelligence — no AI, pure pattern matching on
// transaction names already categorised as 'Groceries' by sa-categorise.js
// ---------------------------------------------------------------------------
const DELIVERY_PATTERNS = [
  'sixty60', 'sixty 60', 'checkers sixty', 'checkers online',
  'woolworths dash', 'woolies dash', 'woolworths delivery', 'woolies delivery', 'woolworths online', 'woolies online',
  'pick n pay asap', 'pnp asap', 'picknpay asap', 'pnp online', 'pick n pay online', 'picknpay online',
  'spar online', 'spar deliver', 'spar2u',
]

const RETAILER_PATTERNS = [
  { key: 'Woolworths', patterns: ['woolworths', 'woolies'] },
  { key: 'Checkers',   patterns: ['checkers', 'sixty60', 'sixty 60'] },
  { key: 'Pick n Pay', patterns: ['pick n pay', 'picknpay', 'pnp '] },
  { key: 'Spar',       patterns: ['spar '] },
  { key: 'Shoprite',   patterns: ['shoprite'] },
  { key: 'Clicks',     patterns: ['clicks'] },
  { key: 'Dis-Chem',   patterns: ['dis-chem', 'dischem'] },
  { key: 'Makro',      patterns: ['makro'] },
]

function isDelivery(name) {
  const lower = (name || '').toLowerCase()
  return DELIVERY_PATTERNS.some(p => lower.includes(p))
}

function detectRetailer(name) {
  const lower = (name || '').toLowerCase()
  for (const r of RETAILER_PATTERNS) {
    if (r.patterns.some(p => lower.includes(p))) return r.key
  }
  return null
}

function computeGroceryInsights(txns) {
  const grocery = (txns || []).filter(t => t.category === 'Groceries' && t.amount > 0)
  if (grocery.length === 0) return null

  // Split by calendar month to compute average
  const byMonth = {}
  for (const t of grocery) {
    const mo = (t.date || '').slice(0, 7)
    if (mo) byMonth[mo] = (byMonth[mo] || 0) + t.amount
  }
  const months = Object.values(byMonth)
  const monthlyAvg = months.length ? Math.round(months.reduce((s, v) => s + v, 0) / months.length) : 0
  const totalSpend = grocery.reduce((s, t) => s + t.amount, 0)

  // Delivery vs in-store
  const deliveryTxns = grocery.filter(t => isDelivery(t.name))
  const deliveryTotal = deliveryTxns.reduce((s, t) => s + t.amount, 0)
  const deliveryPct   = totalSpend > 0 ? Math.round(deliveryTotal / totalSpend * 100) : 0
  const deliveryCount = deliveryTxns.length
  // Avg delivery order size vs in-store order size to estimate fee premium
  const inStoreTxns   = grocery.filter(t => !isDelivery(t.name))
  const avgDelivery   = deliveryCount > 0 ? deliveryTotal / deliveryCount : 0
  const avgInStore    = inStoreTxns.length > 0 ? inStoreTxns.reduce((s, t) => s + t.amount, 0) / inStoreTxns.length : 0
  const deliveryPremiumPct = avgInStore > 0 && avgDelivery > avgInStore
    ? Math.round((avgDelivery - avgInStore) / avgInStore * 100) : 0

  // Retailer concentration
  const retailerTotals = {}
  for (const t of grocery) {
    const r = detectRetailer(t.name)
    if (r) retailerTotals[r] = (retailerTotals[r] || 0) + t.amount
  }
  const topRetailerEntry = Object.entries(retailerTotals).sort((a, b) => b[1] - a[1])[0]
  const topRetailer    = topRetailerEntry?.[0] || null
  const topRetailerPct = topRetailerEntry && totalSpend > 0
    ? Math.round(topRetailerEntry[1] / totalSpend * 100) : 0

  return {
    monthlyAvg, totalSpend, monthCount: months.length,
    deliveryPct, deliveryCount, deliveryPremiumPct,
    topRetailer, topRetailerPct, retailerTotals,
  }
}

// ---------------------------------------------------------------------------
// Receipt text parser (client-side regex, no AI)
// ---------------------------------------------------------------------------
function parseReceiptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    const priceMatch = line.match(/R?\s*(\d+[.,]\d{2})\s*$/)
    const qtyMatch   = line.match(/^(\d+)\s*[xX×]\s*/i) || line.match(/\s+(\d+)\s*[xX×]\s+/)
    const name = line.replace(/R?\s*\d+[.,]\d{2}\s*$/, '').replace(/^\d+\s*[xX×]\s*/i, '').trim()
    if (name && priceMatch) {
      const price = Math.round(parseFloat(priceMatch[1].replace(',', '.')) * 100)
      const qty   = qtyMatch ? parseInt(qtyMatch[1]) : 1
      if (name.length > 1 && price > 0) items.push({ name: name.slice(0, 60), qty, currentPrice: price })
    }
  }
  return items
}

// ---------------------------------------------------------------------------
// Insights panel component
// ---------------------------------------------------------------------------
function InsightsPanel({ insights }) {
  if (!insights) return null
  const { monthlyAvg, monthCount, deliveryPct, deliveryCount, deliveryPremiumPct, topRetailer, topRetailerPct } = insights

  return (
    <div className="gc-insights-panel">
      <div className="gc-insights-title">Your grocery patterns</div>
      <div className="gc-insights-grid">
        <div className="gc-insight-card">
          <div className="gc-insight-label">Monthly average</div>
          <div className="gc-insight-value">{fmtR(monthlyAvg)}</div>
          <div className="gc-insight-sub">over {monthCount} month{monthCount !== 1 ? 's' : ''}</div>
        </div>

        {topRetailer && (
          <div className="gc-insight-card">
            <div className="gc-insight-label">Top retailer</div>
            <div className="gc-insight-value">{topRetailer}</div>
            <div className="gc-insight-sub">{topRetailerPct}% of grocery spend</div>
          </div>
        )}

        {deliveryCount > 0 && (
          <div className="gc-insight-card">
            <div className="gc-insight-label">Delivery orders</div>
            <div className="gc-insight-value">{deliveryPct}%</div>
            <div className="gc-insight-sub">{deliveryCount} order{deliveryCount !== 1 ? 's' : ''} via delivery</div>
          </div>
        )}

        {deliveryPremiumPct > 5 && (
          <div className="gc-insight-card gc-insight-card-warn">
            <div className="gc-insight-label">Delivery premium</div>
            <div className="gc-insight-value">+{deliveryPremiumPct}%</div>
            <div className="gc-insight-sub">more per order vs in-store avg</div>
          </div>
        )}
      </div>

      {deliveryPct > 30 && (
        <div className="gc-insight-nudge">
          {deliveryPct}% of your grocery spend goes through delivery services. Switching 2 orders per month to in-store could save approx {fmtR(deliveryCount > 0 ? Math.round(deliveryCount * 3500 / 12) : 1000)}/month in delivery fees.
        </div>
      )}
      {topRetailerPct > 60 && topRetailer === 'Woolworths' && (
        <div className="gc-insight-nudge">
          Woolworths accounts for {topRetailerPct}% of your grocery spend. Shifting staples (pasta, rice, tinned goods, cleaning products) to Checkers or Pick n Pay typically saves 15-25% on those items.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function GroceryComparison() {
  const { user, profile } = useAuth()
  const [mode, setMode] = useState('upload') // 'upload' | 'text' | 'manual'
  const [receiptText, setReceiptText]   = useState('')
  const [currentStore, setCurrentStore] = useState('Checkers')
  const [items, setItems]   = useState([{ name: '', qty: 1, currentPrice: '' }])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Receipt image upload state
  const [uploadState, setUploadState] = useState('idle') // 'idle' | 'reading' | 'parsing' | 'done' | 'error'
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  // Transaction-based grocery insights
  const [groceryTxns, setGroceryTxns] = useState([])
  useEffect(() => {
    if (!user) return
    fetchRecentMonths(user.id, 3).then(txns => setGroceryTxns(txns || [])).catch(() => {})
  }, [user?.id])

  const insights = useMemo(() => computeGroceryInsights(groceryTxns), [groceryTxns])

  const vitalityPct = profile?.has_discovery_vitality ? (profile?.vitality_cashback_pct || 0) : 0

  // ---- Item management ----
  function addItem()  { setItems(prev => [...prev, { name: '', qty: 1, currentPrice: '' }]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i, field, value) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  // ---- Image upload ----
  async function handleImageUpload(file) {
    if (!file) return
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setUploadError('Please upload a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be under 10 MB.')
      return
    }

    setUploadState('reading')
    setUploadError('')

    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      const base64  = dataUrl.split(',')[1]

      setUploadState('parsing')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const resp = await fetch('/.netlify/functions/parse-grocery-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || 'Could not read receipt')

        // Detect store from receipt if available
        if (data.store && STORES.includes(data.store)) setCurrentStore(data.store)

        const parsed = (data.items || []).map(it => ({
          name: it.name || '',
          qty:  it.qty  || 1,
          currentPrice: it.price ? (it.price / 100).toFixed(2) : '',
        })).filter(it => it.name.trim())

        if (parsed.length === 0) {
          setUploadError("Couldn't find items on this receipt. Try the text or manual entry options.")
          setUploadState('error')
          return
        }

        setItems(parsed)
        setUploadState('done')
        setMode('manual') // switch to review mode
      } catch (err) {
        console.error('Receipt parse error:', err)
        setUploadError(err.message || 'Could not read receipt. Try pasting the text instead.')
        setUploadState('error')
      }
    }
    reader.readAsDataURL(file)
  }

  // ---- Text parse ----
  function parseFromText() {
    const parsed = parseReceiptText(receiptText)
    if (parsed.length === 0) {
      setError("Couldn't parse any items. Make sure each line has an item name and a price (e.g. \"Milk 2L R22.99\").")
      return
    }
    setItems(parsed.map(p => ({ ...p, currentStore })))
    setMode('manual')
    setError('')
  }

  // ---- Compare ----
  async function analyse() {
    const activeItems = mode === 'text'
      ? parseReceiptText(receiptText).map(p => ({ ...p, currentStore }))
      : items.filter(i => i.name.trim())

    if (activeItems.length === 0) {
      setError('Please add at least one item to compare.')
      return
    }

    setLoading(true)
    setError('')
    setResults(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const payload = {
        items: activeItems.map(item => ({
          name: item.name,
          qty:  item.qty || 1,
          currentPrice: item.currentPrice ? Math.round(parseFloat(item.currentPrice) * 100) : undefined,
          currentStore: item.currentStore || currentStore,
        })).filter(i => i.name),
        vitalityPct,
      }

      const resp = await fetch('/.netlify/functions/compare-groceries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`)
      const data = await resp.json()
      setResults(data)
    } catch (err) {
      console.error('Comparison error:', err)
      setError('Could not compare prices right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Render ----
  return (
    <div className="gc-shell">
      <div className="gc-header">
        <h2 className="gc-title">Grocery intelligence</h2>
        <p className="gc-sub">
          Compare prices across SA retailers and understand your grocery habits.
          {vitalityPct > 0 && <span className="gc-vitality-badge"> ✶ Vitality {vitalityPct}% applied</span>}
        </p>
      </div>

      {/* Behavioural insights from transaction history */}
      <InsightsPanel insights={insights} />

      {/* Store selector */}
      <div className="gc-store-row">
        <span className="gc-store-lbl">Your store:</span>
        <div className="gc-store-pills">
          {STORES.map(s => (
            <button key={s} className={`gc-store-pill ${currentStore === s ? 'selected' : ''}`}
              onClick={() => setCurrentStore(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="gc-mode-tabs">
        <button className={`gc-mode-tab ${mode === 'upload'  ? 'active' : ''}`} onClick={() => setMode('upload')}>
          📷 Scan receipt
        </button>
        <button className={`gc-mode-tab ${mode === 'text'    ? 'active' : ''}`} onClick={() => setMode('text')}>
          📋 Paste list
        </button>
        <button className={`gc-mode-tab ${mode === 'manual'  ? 'active' : ''}`} onClick={() => setMode('manual')}>
          ✏️ Enter items
        </button>
      </div>

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="gc-section">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => handleImageUpload(e.target.files?.[0])}
          />
          <div
            className="gc-upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleImageUpload(e.dataTransfer.files?.[0]) }}
          >
            {uploadState === 'reading'  && <><div className="gc-upload-icon">⏳</div><p>Reading image...</p></>}
            {uploadState === 'parsing'  && <><div className="ai-spinner" style={{ margin: '0 auto 8px' }}><span/><span/><span/></div><p>Reading your receipt...</p></>}
            {uploadState === 'done'     && <><div className="gc-upload-icon">✓</div><p>Receipt read. Review items below.</p></>}
            {uploadState === 'error'    && <><div className="gc-upload-icon">⚠️</div><p>{uploadError}</p></>}
            {uploadState === 'idle'     && (
              <>
                <div className="gc-upload-icon">📸</div>
                <p className="gc-upload-main">Take a photo or upload your receipt</p>
                <p className="gc-upload-sub">JPEG, PNG or WebP, up to 10 MB. Works with Woolworths, Checkers, Pick n Pay, Spar and more.</p>
              </>
            )}
          </div>
          {uploadError && uploadState !== 'error' && <div className="gc-error" style={{ marginTop: 8 }}>{uploadError}</div>}
        </div>
      )}

      {/* Text paste mode */}
      {mode === 'text' && (
        <div className="gc-section">
          <textarea
            className="gc-textarea"
            placeholder={"Paste your grocery list or receipt text here.\n\nExamples:\n  Full cream milk 2L  R22.99\n  2x Large eggs  R45.00\n  White bread  R18.50"}
            value={receiptText}
            onChange={e => setReceiptText(e.target.value)}
            rows={8}
          />
          <div className="gc-text-actions">
            <button className="gc-btn-secondary" onClick={parseFromText} disabled={!receiptText.trim()}>
              Parse items →
            </button>
            <button className="gc-btn-primary" onClick={analyse} disabled={loading || !receiptText.trim()}>
              {loading ? 'Comparing…' : '✶ Compare prices'}
            </button>
          </div>
        </div>
      )}

      {/* Manual entry mode */}
      {mode === 'manual' && (
        <div className="gc-section">
          <div className="gc-items-header">
            <span>Item</span><span>Qty</span><span>Price (R)</span><span />
          </div>
          <div className="gc-items-list">
            {items.map((item, i) => (
              <div key={i} className="gc-item-row">
                <input className="gc-item-input gc-item-name"
                  placeholder="e.g. Full cream milk 2L"
                  value={item.name}
                  onChange={e => updateItem(i, 'name', e.target.value)} />
                <input className="gc-item-input gc-item-qty"
                  type="number" min="1"
                  value={item.qty}
                  onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)} />
                <input className="gc-item-input gc-item-price"
                  type="number" placeholder="0.00" step="0.01"
                  value={item.currentPrice}
                  onChange={e => updateItem(i, 'currentPrice', e.target.value)} />
                <button className="gc-item-remove" onClick={() => removeItem(i)} title="Remove">✕</button>
              </div>
            ))}
          </div>
          <div className="gc-items-actions">
            <button className="gc-btn-ghost" onClick={addItem}>+ Add item</button>
            <button className="gc-btn-primary" onClick={analyse}
              disabled={loading || !items.some(i => i.name.trim())}>
              {loading ? 'Comparing…' : '✶ Compare prices'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="gc-error">{error}</div>}

      {loading && (
        <div className="gc-loading">
          <div className="ai-spinner"><span /><span /><span /></div>
          <p>Checking prices across stores…</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="gc-results">
          <div className="gc-savings-banner">
            <div className="gc-savings-main">
              You could save <span className="gc-savings-amount">{fmtR(results.weeklyMonthlySaving?.weekly || 0)}/week</span>
              {' '}({fmtR(results.weeklyMonthlySaving?.monthly || 0)}/month)
            </div>
            {results.summary && <div className="gc-savings-sub">{results.summary}</div>}
          </div>

          {/* Grocery insights from AI */}
          {results.groceryInsights && (
            <div className="gc-ai-tips">
              {results.groceryInsights.loyaltyTip  && <div className="gc-ai-tip">🏆 {results.groceryInsights.loyaltyTip}</div>}
              {results.groceryInsights.savingsTip   && <div className="gc-ai-tip">💡 {results.groceryInsights.savingsTip}</div>}
              {results.groceryInsights.deliveryNote && <div className="gc-ai-tip">🛒 {results.groceryInsights.deliveryNote}</div>}
            </div>
          )}

          {/* Item comparison table */}
          <div className="gc-table-wrap">
            <table className="gc-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Current ({currentStore})</th>
                  <th>Woolworths</th>
                  <th>Checkers</th>
                  <th>Pick n Pay</th>
                  <th>Cheapest</th>
                </tr>
              </thead>
              <tbody>
                {(results.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="gc-item-cell">
                      <span className="gc-item-name-cell">{item.qty > 1 ? `${item.qty}× ` : ''}{item.name}</span>
                      {item.isHealthy && vitalityPct > 0 && <span className="gc-vitality-tag">Vitality</span>}
                    </td>
                    <td>{item.currentPrice ? fmt(item.currentPrice) : '—'}</td>
                    <td className={item.cheapest === 'Woolworths' ? 'gc-cheapest' : ''}>{fmt(item.woolworths)}</td>
                    <td className={item.cheapest === 'Checkers'   ? 'gc-cheapest' : ''}>{fmt(item.checkers)}</td>
                    <td className={item.cheapest === 'Pick n Pay' ? 'gc-cheapest' : ''}>{fmt(item.picknpay)}</td>
                    <td>
                      <span className="gc-cheapest-badge">{item.cheapest}</span>
                      <span className="gc-cheapest-price"> {fmt(item.cheapestPrice)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cart split */}
          {results.cartSplit?.length > 0 && (
            <div className="gc-split-section">
              <h3 className="gc-split-title">Recommended cart split</h3>
              <div className="gc-split-cards">
                {results.cartSplit.map((store, i) => (
                  <div key={i} className="gc-split-card">
                    <div className="gc-split-store">{store.store}</div>
                    <ul className="gc-split-items">
                      {(store.items || []).map((it, j) => <li key={j}>{it}</li>)}
                    </ul>
                    <div className="gc-split-footer">
                      <div className="gc-split-row"><span>Subtotal</span><span>{fmtR(store.subtotal || 0)}</span></div>
                      {store.delivery > 0 && <div className="gc-split-row"><span>Delivery</span><span>{fmtR(store.delivery)}</span></div>}
                      {store.vitalitySaving > 0 && (
                        <div className="gc-split-row gc-split-saving"><span>Vitality cashback</span><span>−{fmtR(store.vitalitySaving)}</span></div>
                      )}
                      <div className="gc-split-row gc-split-total"><span>Total</span><span>{fmtR(store.total || 0)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="gc-totals">
            <div className="gc-total-row"><span>Current basket</span><span>{fmtR(results.currentTotal || 0)}</span></div>
            <div className="gc-total-row gc-total-optimised">
              <span>Optimised basket</span>
              <span className="green">{fmtR(results.optimisedTotal || 0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
