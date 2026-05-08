import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './GroceryComparison.css'

const STORES = ['Woolworths', 'Checkers', 'Pick n Pay', 'Shoprite', 'Spar', 'Dis-Chem', 'Other']
const fmt = n => 'R' + (n / 100).toFixed(2)
const fmtR = n => 'R' + Math.round(n / 100).toLocaleString('en-ZA')

function parseReceiptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    // Try patterns like: "2x Milk R25.99" or "Bread 1 R18.50" or "Eggs x6 R45.00"
    const priceMatch = line.match(/R?\s*(\d+[.,]\d{2})\s*$/)
    const qtyMatch = line.match(/^(\d+)\s*[xX×]\s*/i) || line.match(/\s+(\d+)\s*[xX×]\s+/)
    const name = line.replace(/R?\s*\d+[.,]\d{2}\s*$/, '').replace(/^\d+\s*[xX×]\s*/i, '').trim()
    if (name && priceMatch) {
      const price = Math.round(parseFloat(priceMatch[1].replace(',', '.')) * 100)
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1
      if (name.length > 1 && price > 0) {
        items.push({ name: name.slice(0, 50), qty, currentPrice: price })
      }
    }
  }
  return items
}

export default function GroceryComparison() {
  const { user, profile } = useAuth()
  const [mode, setMode] = useState('text') // 'text' or 'manual'
  const [receiptText, setReceiptText] = useState('')
  const [currentStore, setCurrentStore] = useState('Checkers')
  const [items, setItems] = useState([{ name: '', qty: 1, currentPrice: '' }])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const vitalityPct = profile?.has_discovery_vitality ? (profile?.vitality_cashback_pct || 0) : 0

  function addItem() {
    setItems(prev => [...prev, { name: '', qty: 1, currentPrice: '' }])
  }

  function updateItem(i, field, value) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function parseFromText() {
    const parsed = parseReceiptText(receiptText)
    if (parsed.length === 0) {
      setError('Could not parse any items. Try the manual entry tab instead.')
      return
    }
    setItems(parsed.map(p => ({ ...p, currentStore })))
    setMode('manual')
    setError('')
  }

  async function analyse() {
    const activeItems = mode === 'manual'
      ? items.filter(i => i.name.trim())
      : parseReceiptText(receiptText).map(p => ({ ...p, currentStore }))

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
          qty: item.qty || 1,
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

  return (
    <div className="gc-shell">
      <div className="gc-header">
        <h2 className="gc-title">Grocery price comparison</h2>
        <p className="gc-sub">Find where to buy each item cheapest — Woolworths, Checkers, or Pick n Pay.
          {vitalityPct > 0 && <span className="gc-vitality-badge"> ✦ Vitality {vitalityPct}% applied</span>}
        </p>
      </div>

      {/* Store selector */}
      <div className="gc-store-row">
        <span className="gc-store-lbl">Your current store:</span>
        <div className="gc-store-pills">
          {STORES.map(s => (
            <button key={s} className={`gc-store-pill ${currentStore === s ? 'selected' : ''}`}
              onClick={() => setCurrentStore(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="gc-mode-tabs">
        <button className={`gc-mode-tab ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>
          📋 Paste receipt / list
        </button>
        <button className={`gc-mode-tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          ✏️ Manual entry
        </button>
      </div>

      {/* Text paste mode */}
      {mode === 'text' && (
        <div className="gc-section">
          <textarea
            className="gc-textarea"
            placeholder={"Paste your grocery list or receipt here. Examples:\n\nFull cream milk 2L  R22.99\n2x Large eggs R45.00\nWhite bread R18.50\nCheddar cheese 400g R55.99"}
            value={receiptText}
            onChange={e => setReceiptText(e.target.value)}
            rows={8}
          />
          <div className="gc-text-actions">
            <button className="gc-btn-secondary" onClick={parseFromText} disabled={!receiptText.trim()}>
              Parse items →
            </button>
            <button className="gc-btn-primary" onClick={analyse} disabled={loading || !receiptText.trim()}>
              {loading ? 'Analysing…' : '✦ Compare prices'}
            </button>
          </div>
        </div>
      )}

      {/* Manual entry mode */}
      {mode === 'manual' && (
        <div className="gc-section">
          <div className="gc-items-header">
            <span>Item</span><span>Qty</span><span>Current price (R)</span><span />
          </div>
          <div className="gc-items-list">
            {items.map((item, i) => (
              <div key={i} className="gc-item-row">
                <input
                  className="gc-item-input gc-item-name"
                  placeholder="e.g. Full cream milk 2L"
                  value={item.name}
                  onChange={e => updateItem(i, 'name', e.target.value)}
                />
                <input
                  className="gc-item-input gc-item-qty"
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)}
                />
                <input
                  className="gc-item-input gc-item-price"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={item.currentPrice}
                  onChange={e => updateItem(i, 'currentPrice', e.target.value)}
                />
                <button className="gc-item-remove" onClick={() => removeItem(i)} title="Remove">✕</button>
              </div>
            ))}
          </div>
          <div className="gc-items-actions">
            <button className="gc-btn-ghost" onClick={addItem}>+ Add item</button>
            <button className="gc-btn-primary" onClick={analyse} disabled={loading || !items.some(i => i.name.trim())}>
              {loading ? 'Comparing…' : '✦ Compare prices'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="gc-error">{error}</div>}

      {loading && (
        <div className="gc-loading">
          <div className="ai-spinner"><span /><span /><span /></div>
          <p>bump. is checking prices across stores…</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="gc-results">
          {/* Savings headline */}
          <div className="gc-savings-banner">
            <div className="gc-savings-main">
              You could save <span className="gc-savings-amount">{fmtR(results.weeklyMonthlySaving?.weekly || 0)}/week</span>
              {' '}({fmtR(results.weeklyMonthlySaving?.monthly || 0)}/month)
            </div>
            {results.summary && <div className="gc-savings-sub">{results.summary}</div>}
          </div>

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
                      {item.isHealthy && vitalityPct > 0 && (
                        <span className="gc-vitality-tag">Vitality</span>
                      )}
                    </td>
                    <td>{item.currentPrice ? fmt(item.currentPrice) : '—'}</td>
                    <td className={item.cheapest === 'Woolworths' ? 'gc-cheapest' : ''}>{fmt(item.woolworths)}</td>
                    <td className={item.cheapest === 'Checkers' ? 'gc-cheapest' : ''}>{fmt(item.checkers)}</td>
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

          {/* Recommended cart split */}
          {results.cartSplit && results.cartSplit.length > 0 && (
            <div className="gc-split-section">
              <h3 className="gc-split-title">Recommended cart split</h3>
              <div className="gc-split-cards">
                {results.cartSplit.map((store, i) => (
                  <div key={i} className="gc-split-card">
                    <div className="gc-split-store">{store.store}</div>
                    <ul className="gc-split-items">
                      {(store.items || []).map((item, j) => <li key={j}>{item}</li>)}
                    </ul>
                    <div className="gc-split-footer">
                      <div className="gc-split-row">
                        <span>Subtotal</span><span>{fmtR(store.subtotal || 0)}</span>
                      </div>
                      {store.delivery > 0 && (
                        <div className="gc-split-row">
                          <span>Delivery</span><span>{fmtR(store.delivery)}</span>
                        </div>
                      )}
                      {store.vitalitySaving > 0 && (
                        <div className="gc-split-row gc-split-saving">
                          <span>Vitality cashback</span><span>−{fmtR(store.vitalitySaving)}</span>
                        </div>
                      )}
                      <div className="gc-split-row gc-split-total">
                        <span>Total</span><span>{fmtR(store.total || 0)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="gc-totals">
            <div className="gc-total-row">
              <span>Current basket total</span>
                            <span>{fmtR(results.currentTotal || 0)}</span>
            </div>
            <div className="gc-total-row gc-total-optimised">
              <span>Optimised basket total</span>
              <span className="green">{fmtR(results.optimisedTotal || 0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
