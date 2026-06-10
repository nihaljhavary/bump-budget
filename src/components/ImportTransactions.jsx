import { useState, useRef, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { normalizeForDisplay } from '../utils/merchantNormalizer'
import { txnFingerprint, buildFingerprintSet, formatLocalDate } from '../utils/ledger'
import { validateIngestionBatch, detectBatchOverlap } from '../utils/integrity'
import { observe, DOMAIN } from '../utils/observe'
import './ImportTransactions.css'

const CATEGORIES = [
  'Income', 'Transfer', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Home & Garden', 'Other'
]

const BANKS = [
  { id: 'fnb',          label: 'FNB',           logo: '🏦' },
  { id: 'nedbank',      label: 'Nedbank',        logo: '🟢' },
  { id: 'absa',         label: 'ABSA',           logo: '🔴' },
  { id: 'standard',     label: 'Standard Bank',  logo: '🔵' },
  { id: 'capitec',      label: 'Capitec',        logo: '🟣' },
  { id: 'discovery',    label: 'Discovery Bank', logo: '💎' },
  { id: 'tyme',         label: 'TymeBank',       logo: '🟡' },
  { id: 'investec',     label: 'Investec',       logo: '🔷' },
  { id: 'generic',      label: 'Other / Generic',logo: '📄' },
]

const CAT_COLORS = {
  Housing: '#378ADD', Groceries: '#1D9E75', 'Eating out': '#D85A30',
  Transport: '#BA7517', Entertainment: '#7F77DD', Health: '#D4537E',
  Clothing: '#639922', Subscriptions: '#888780', Income: '#1a6b45',
  Education: '#0891B2', Insurance: '#7C3AED', Savings: '#059669',
  Fuel: '#D49A4A', 'ATM / Cash': '#94999F', 'Fees & Charges': '#E8705C',
  Utilities: '#0D9488', Travel: '#2563EB', Gifts: '#EC4899',
  Transfer: '#94A3B8', 'Home & Garden': '#65A30D', Other: '#888'
}

// ── Bank-specific column parsers ──────────────────────────────────────────────

// Parse a potentially signed amount value: handles parentheses negatives (1,234.00),
// thousand separators (commas / spaces), and standard minus signs.
function parseSigned(val) {
  if (val === undefined || val === null || val === '') return null
  const s = String(val).trim()
  if (s === '' || s === '-' || s === '0') return s === '0' ? 0 : null
  // Accounting negative: (1,234.00) or (1 234.00)
  const parens = s.match(/^\(([\d][\d .,]*)\)$/)
  if (parens) {
    const n = parseFloat(parens[1].replace(/[^0-9.]/g, ''))
    return isNaN(n) ? null : -Math.abs(n)
  }
  // Strip currency symbols, spaces used as thousands seps, but keep minus and first decimal
  const cleaned = s.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function normaliseAmount(val) {
  const n = parseSigned(val)
  return n === null ? null : Math.abs(n)
}

function normaliseDate(val) {
  if (!val) return formatLocalDate(new Date())
  // Excel serial date
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const s = String(val).trim()
  // YYYY-MM-DD (ISO)
  const ymd = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3]
    return `${y}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`
  }
  // DD MMM YYYY or D MMM YYYY (e.g. "15 Jan 2024", "1 March 2024")
  const dmy3 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/)
  if (dmy3) {
    const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
    const m = MONTHS[dmy3[2].toLowerCase().slice(0, 3)]
    if (m) return `${dmy3[3]}-${String(m).padStart(2,'0')}-${String(dmy3[1]).padStart(2,'0')}`
  }
  // MMM DD, YYYY (US format some banks export)
  const mdy = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (mdy) {
    const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
    const m = MONTHS[mdy[1].toLowerCase().slice(0, 3)]
    if (m) return `${mdy[3]}-${String(m).padStart(2,'0')}-${String(mdy[2]).padStart(2,'0')}`
  }
  // Let JS parse the rest
  const d = new Date(s)
  if (!isNaN(d)) return formatLocalDate(d)
  return formatLocalDate(new Date())
}

function findCol(headers, ...options) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim())
  for (const opt of options) {
    const idx = lower.findIndex(h => h.includes(opt.toLowerCase()))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function hasTransferHint(description, type = '') {
  const text = `${type} ${description}`.toLowerCase()
  return /\b(transfer|internal transfer|own account|own acc|account transfer|inter-?account|discovery pay|payshap|send money)\b/i.test(text)
}

// ── Smart XLSX header detection ───────────────────────────────────────────────
// Many SA bank XLSX exports have metadata rows before the real column headers
// (e.g. bank name, account number, statement period).  sheet_to_json defaults
// to ROW 1 as headers, so those metadata values become the object keys —
// meaning the deterministic parser never finds "date", "description", etc.
//
// This function scans up to 20 rows for the first row that contains 2+ known
// header keywords and re-parses the sheet from that row onward.
// Falls back to default sheet_to_json when no offset is needed (no cost).
function parseSheetSmartHeaders(ws, bankHint) {
  const HEADER_KEYWORDS = [
    'date', 'description', 'desc', 'narrative', 'details', 'reference', 'beneficiary',
    'amount', 'debit', 'credit', 'balance', 'transaction', 'type', 'memo', 'remark',
  ]
  // Raw 2-D array — no header interpretation yet
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (raw.length === 0) return []

  // Scan up to first 20 rows to find the real header row
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const cellValues = raw[i].map(c => String(c || '').toLowerCase().trim())
    const matchCount = cellValues.filter(v =>
      v !== '' && HEADER_KEYWORDS.some(kw => v === kw || v.includes(kw))
    ).length
    if (matchCount >= 2) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx <= 0) {
    // Row 0 is already the header (or no recognisable header found) — use default path
    return XLSX.utils.sheet_to_json(ws, { defval: '' })
  }

  // Found the real header row at a non-zero index — log and rebuild
  observe.info(DOMAIN.INGESTION, 'Header row shifted — metadata rows detected', {
    bank: bankHint,
    headerRowIdx,
    detectedHeaders: raw[headerRowIdx].map(c => String(c || '').trim()).filter(Boolean),
    skippedRows: raw.slice(0, headerRowIdx).map(r => r.filter(c => c !== '').join(' | ')),
  })
  const headers = raw[headerRowIdx].map(c => String(c || '').trim())
  return raw
    .slice(headerRowIdx + 1)
    .filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined))
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { if (h) obj[h] = row[i] !== undefined ? row[i] : '' })
      return obj
    })
}

// ── Deterministic parser (existing logic — unchanged) ─────────────────────────
// Returns { txns: [], confidence: 'high'|'low', columns: {} }
// confidence 'high'  = descCol + amount source found → continue as before
// confidence 'low'   = key columns missing → caller may invoke AI fallback
function parseRowsDeterministic(rows, bankId) {
  if (rows.length === 0) return { txns: [], confidence: 'low', columns: {} }
  const headers = Object.keys(rows[0])

  let dateCol, descCol, amtCol, debitCol, creditCol, typeCol

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
    case 'discovery':
      // Discovery Bank exports: Value Date, Value Time, Type, Description, Beneficiary or Cardholder, Amount
      dateCol  = findCol(headers, 'value date', 'date')
      descCol  = findCol(headers, 'description', 'beneficiary or cardholder', 'beneficiary')
      amtCol   = findCol(headers, 'amount')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      typeCol  = findCol(headers, 'type')
      break
    case 'tyme':
      dateCol  = findCol(headers, 'date', 'transaction date')
      descCol  = findCol(headers, 'description', 'transaction description', 'reference')
      amtCol   = findCol(headers, 'amount')
      debitCol = findCol(headers, 'debit')
      creditCol= findCol(headers, 'credit')
      break
    case 'investec':
      // Investec Private Bank: Date, Transaction Details, Amount (signed), Balance
      // Also handles: Date, Narrative, Debit, Credit variants
      dateCol  = findCol(headers, 'date', 'value date', 'transaction date')
      descCol  = findCol(headers, 'transaction details', 'description', 'narrative', 'details', 'reference')
      amtCol   = findCol(headers, 'amount', 'transaction amount')
      debitCol = findCol(headers, 'debit', 'debit amount')
      creditCol= findCol(headers, 'credit', 'credit amount')
      break
    default:
      // Auto-detect — try common SA bank column name variants
      dateCol  = findCol(headers, 'date', 'transaction date', 'value date', 'txn date', 'posting date')
      descCol  = findCol(headers, 'description', 'transaction details', 'narrative', 'details', 'reference', 'beneficiary', 'transaction description', 'transaction')
      amtCol   = findCol(headers, 'amount', 'transaction amount', 'rand amount')
      debitCol = findCol(headers, 'debit', 'debit amount', 'debits')
      creditCol= findCol(headers, 'credit', 'credit amount', 'credits')
  }

  typeCol = typeCol || findCol(headers, 'type', 'transaction type', 'transaction code')

  // ── Confidence scoring ────────────────────────────────────────────────────
  // High = descCol found AND at least one amount source found
  // Low  = missing description or all amount columns → trigger AI fallback
  const hasDesc   = !!descCol
  const hasAmount = !!(amtCol || debitCol || creditCol)
  const confidence = (hasDesc && hasAmount) ? 'high' : 'low'

  const columns = { dateCol, descCol, amtCol, debitCol, creditCol, typeCol }

  if (confidence === 'low') {
    return { txns: [], confidence: 'low', columns }
  }

  const txns = extractRows(rows, { dateCol, descCol, amtCol, debitCol, creditCol, typeCol })
  // Even with high column confidence, zero extracted rows = low confidence
  return { txns, confidence: txns.length > 0 ? 'high' : 'low', columns }
}

// ── Core row extractor — shared by deterministic + AI-mapping paths ───────────
// Takes rows + explicit column mapping, returns normalised transaction array.
// This is the canonical normalisation engine — no duplication.
function extractRows(rows, { dateCol, descCol, amtCol, debitCol, creditCol, typeCol }) {
  const result = []
  for (const row of rows) {
    const desc = descCol && row[descCol] ? String(row[descCol]).trim() : null
    if (!desc) continue // skip empty rows

    let amount = null
    let isIncome = false
    const txnType = typeCol ? String(row[typeCol] || '').trim() : ''
    const isTransfer = hasTransferHint(desc, txnType)

    if (amtCol && row[amtCol] !== undefined && row[amtCol] !== '') {
      const raw = parseSigned(row[amtCol])
      if (raw !== null) {
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
      is_transfer: isTransfer,
      type:        txnType || undefined,
    })
  }
  return result
}

// ── AI-inferred schema path ───────────────────────────────────────────────────
// Takes rows + column mapping returned by schema-infer.js and extracts transactions
// using the same extractRows normalisation engine.
function parseWithMapping(rows, mapping) {
  const { dateCol, descCol, amtCol, debitCol, creditCol } = mapping
  return extractRows(rows, { dateCol, descCol, amtCol, debitCol, creditCol, typeCol: null })
}

// ── Token helper ──────────────────────────────────────────────────────────────
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ── AI schema inference (called only when deterministic parser has low confidence) ──
// Sends headers + up to 5 sample rows to schema-infer.js.
// Returns column mapping or null on failure.
// Never throws — all failures are observed and null is returned.
async function inferSchema(headers, sampleRows, bankHint) {
  // 30 s hard timeout — prevents the spinner hanging on cold-start or slow Claude response
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  try {
    const token = await getToken()
    const res = await fetch('/.netlify/functions/schema-infer', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ headers, sampleRows: sampleRows.slice(0, 5), bankHint }),
    })
    if (!res.ok) {
      // Log HTTP-level failures (401 = session expired, 404 = function not deployed, 502 = Claude error)
      observe.warn(DOMAIN.INGESTION, 'Schema inference HTTP error', { status: res.status, bank: bankHint })
      return null
    }
    const data = await res.json()
    if (!data.mapping) {
      // Function returned explicitly null — log reason if provided
      observe.warn(DOMAIN.INGESTION, 'Schema inference returned null mapping', {
        reason: data.reason || 'no reason provided',
        bank: bankHint,
        headers,
      })
    }
    return data.mapping || null
  } catch (err) {
    if (err.name === 'AbortError') {
      observe.warn(DOMAIN.INGESTION, 'Schema inference timed out after 30 s', { bank: bankHint })
    } else {
      observe.warn(DOMAIN.INGESTION, 'Schema inference fetch error', { error: err?.message, bank: bankHint })
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── AI full-parse fallback ───────────────────────────────────────────────────
// Called when BOTH deterministic and schema-inference paths fail to extract rows.
// Sends all raw rows to Claude for direct transaction extraction — last resort.
// Never throws — all failures are observed and null is returned.
async function fullParseWithAI(rows, bankHint) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000) // 45 s timeout
  try {
    const token = await getToken()
    const res = await fetch('/.netlify/functions/schema-infer', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ mode: 'full_parse', rows, bankHint }),
    })
    if (!res.ok) {
      observe.warn(DOMAIN.INGESTION, 'Full parse HTTP error', { status: res.status, bank: bankHint })
      return null
    }
    const data = await res.json()
    if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
      observe.warn(DOMAIN.INGESTION, 'Full parse returned no transactions', { bank: bankHint })
      return null
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      observe.warn(DOMAIN.INGESTION, 'Full parse timed out after 45 s', { bank: bankHint })
    } else {
      observe.warn(DOMAIN.INGESTION, 'Full parse fetch error', { error: err?.message, bank: bankHint })
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
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
  const [inferring, setInferring] = useState(false) // schema inference in progress
  const [inferStage, setInferStage] = useState('schema') // 'schema' | 'full_parse'
  const [error, setError] = useState(null)
  const [ruleText, setRuleText] = useState('')
  const [ruleLoading, setRuleLoading] = useState(false)
  const [ruleMessage, setRuleMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [replaceInRange, setReplaceInRange] = useState(false)
  const [removedInRangeCount, setRemovedInRangeCount] = useState(0)
  const [batchWarnings, setBatchWarnings] = useState([])  // integrity warnings
  const [overlapWarning, setOverlapWarning] = useState(null) // duplicate upload warning
  const fileRef = useRef()

  // ── File parsing ─────────────────────────────────────────────────────────
  function handleFile(file) {
    setError(null)
    const reader = new FileReader()
    reader.onload = e => {
      // Wrap in async IIFE so we can await schema inference when needed
      ;(async () => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false })
          const ws = wb.Sheets[wb.SheetNames[0]]
          // parseSheetSmartHeaders detects metadata rows that precede the real header row
          // (common in SA bank XLSX exports — bank name, account number, statement period, etc.)
          const rows = parseSheetSmartHeaders(ws, bank)
          observe.info(DOMAIN.INGESTION, 'XLSX parsed', {
            bank, rowCount: rows.length, headers: rows.length > 0 ? Object.keys(rows[0]) : [],
          })
          if (rows.length === 0) { setError('No data found in file — try exporting as CSV or use a different date range.'); return }

          // ── Step 1: deterministic parse (fast, no AI cost) ──────────────
          const { txns: deterministicTxns, confidence } = parseRowsDeterministic(rows, bank)

          let txns = deterministicTxns
          const extraWarnings = []

          // ── Step 2: AI schema inference fallback (only when confidence is low) ──
          // Track outcome for the error message at Step 3
          let inferenceAttempted = false
          let mappingFound = false

          if (confidence === 'low') {
            const inferHeaders = Object.keys(rows[0])
            observe.info(DOMAIN.INGESTION, 'Parser confidence low — invoking schema inference', {
              bank, headers: inferHeaders, rowCount: rows.length,
              sampleRow: rows[0],
            })
            inferenceAttempted = true
            setInferring(true)
            try {
              const headers = inferHeaders
              // inferSchema never throws — failures are observed internally and null is returned
              const mapping = await inferSchema(headers, rows, bank)
              observe.info(DOMAIN.INGESTION, 'Schema inference response', { bank, mapping })

              if (mapping) {
                mappingFound = true
                txns = parseWithMapping(rows, mapping)
                if (txns.length > 0) {
                  observe.info(DOMAIN.INGESTION, 'Schema inference succeeded', {
                    bank, mapping, inferredRowCount: txns.length,
                  })
                  extraWarnings.push(
                    'Statement format was auto-detected. Please verify the dates, amounts, and descriptions in the preview before importing.'
                  )
                } else {
                  // Mapping was returned but extractRows produced nothing — usually means the
                  // amount column was identified but all values were blank/zero/unparseable.
                  observe.warn(DOMAIN.INGESTION, 'Schema inference mapping found but no rows extracted', {
                    bank,
                    descCol: mapping.descCol,
                    amtCol: mapping.amtCol,
                    debitCol: mapping.debitCol,
                    creditCol: mapping.creditCol,
                    structureType: mapping.structureType,
                    sampleValues: rows.slice(0, 3).map(r => ({
                      desc: r[mapping.descCol],
                      amt: r[mapping.amtCol],
                      debit: r[mapping.debitCol],
                      credit: r[mapping.creditCol],
                    })),
                  })
                }
              }
              // mapping === null is already logged inside inferSchema
            } finally {
              setInferring(false)
            }
          }

          // ── Step 2b: AI full-parse fallback ──────────────────────────────────────────
          // Only reached when schema inference produced 0 transactions.
          // Sends ALL rows to Claude for direct extraction — last resort before hard fail.
          let fullParseAttempted = false
          let fullParseSucceeded = false

          if (txns.length === 0 && inferenceAttempted) {
            fullParseAttempted = true
            setInferStage('full_parse')
            setInferring(true)
            observe.info(DOMAIN.INGESTION, 'Schema inference produced 0 rows — invoking full AI parse', {
              bank, rowCount: rows.length,
            })
            try {
              const result = await fullParseWithAI(rows, bank)
              if (result && Array.isArray(result.transactions) && result.transactions.length > 0) {
                fullParseSucceeded = true
                txns = result.transactions.map(t => ({
                  date: t.date,
                  description: t.description,
                  amount: Math.abs(Number(t.amount)),
                  is_income: t.type === 'income',
                  is_transfer: t.type === 'transfer',
                }))
                observe.info(DOMAIN.INGESTION, 'Full parse succeeded', {
                  bank, extractedCount: txns.length, rowsInput: rows.length,
                })
                extraWarnings.push(
                  'Transactions were extracted by AI — please carefully verify all dates, amounts, and descriptions before importing.'
                )
                if (result.truncated) {
                  extraWarnings.push(
                    `Note: Only the first 300 rows were processed. Your statement had ${rows.length} rows — consider exporting a shorter date range.`
                  )
                }
              }
            } finally {
              setInferring(false)
              setInferStage('schema')
            }
          }

          // ── Step 3: hard fail — only reached after ALL three paths exhausted ──────────
          if (txns.length === 0) {
            let msg = "Couldn't read this statement. "
            if (!inferenceAttempted) {
              // Parser had high confidence but got 0 rows — column names matched but data was empty
              msg += 'The file appears to have no transaction rows. Try a different export format or date range.'
            } else if (fullParseAttempted && !fullParseSucceeded) {
              // All three methods tried — truly unreadable file
              msg += 'All automatic extraction methods were tried but no transactions could be read from this file. Please try exporting as CSV or PDF text from your banking app, or contact support.'
            } else if (mappingFound) {
              // AI found a schema mapping but still got 0 rows — amount parsing likely failed
              msg += 'The column structure was identified but no transactions could be extracted — the amount column may be formatted unexpectedly. Try exporting as CSV, or use "Other / Generic" and check your column headers.'
            } else {
              // Schema inference returned no mapping — format unrecognised (full parse not attempted or also failed)
              msg += 'The statement format could not be recognised. Try selecting a different bank, exporting as CSV from your banking app, or use "Other / Generic".'
            }
            setError(msg)
            return
          }

          // ── Step 4: client-side integrity check before sending to backend ─
          const { valid, errors: batchErrors, warnings: batchWarn } = validateIngestionBatch(txns)
          if (!valid) { setError(batchErrors.join(' ')); return }

          setBatchWarnings([...extraWarnings, ...(batchWarn || [])])
          setOverlapWarning(null)
          setReplaceInRange(false)
          setParsed(txns)
          setStep('preview')
          categoriseWithClaude(txns)
        } catch (err) {
          setError('Could not read file: ' + err.message)
          setInferring(false)
        }
      })()
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
  // AbortController ref for timeout + unmount cleanup
  const categoriseAbortRef = useRef(null)

  async function categoriseWithClaude(txns) {
    // Cancel any in-flight request before starting a new one
    if (categoriseAbortRef.current) categoriseAbortRef.current.abort()
    const controller = new AbortController()
    categoriseAbortRef.current = controller

    // Hard timeout: abort after 55 s (Netlify function limit is 60 s)
    const timeoutId = setTimeout(() => controller.abort(), 55_000)

    setLoading(true)
    setError(null)
    observe.info(DOMAIN.INGESTION, 'Categorisation started', { rowCount: txns.length, bank })

    try {
      const token = await getToken()
      const res = await fetch('/.netlify/functions/parse-bulk-transactions', {
        method: 'POST',
        signal: controller.signal,
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
        const errMsg = d.error || `Categorisation failed (${res.status})`
        observe.categorizationError(new Error(errMsg), { status: res.status, bank, rowCount: txns.length })
        throw new Error(errMsg)
      }

      const data = await res.json()
      // Backend returns { transactions: [...] } — guard against malformed/empty response
      const rawResults = Array.isArray(data.transactions) ? data.transactions : []
      if (rawResults.length === 0) {
        // Fallback: show parsed rows with Other so user can adjust manually
        observe.categorizationMismatch('Empty transactions array in response', { bank, rowCount: txns.length })
        setCategorised(txns.map((t, i) => ({ ...t, id: i, category: t.is_transfer ? 'Transfer' : t.is_income ? 'Income' : 'Other', include: true })))
        if (!data.transactions) setError('Categorisation returned an unexpected response — categories set to Other. You can adjust before importing.')
        return
      }
      // Surface any backend anomaly warnings (non-blocking)
      if (data.warnings && data.warnings.length > 0) {
        setBatchWarnings(prev => [...prev, ...data.warnings])
        observe.ingestionWarning(data.warnings, { bank, rowCount: txns.length })
      }
      setCategorised(rawResults.map((t, i) => {
        // Use the original is_income hint as a safety net: if backend still returned
        // 'Other' for a transaction the parser identified as a credit, promote to Income
        const originalTxn = txns[i]
        const category = originalTxn?.is_transfer === true
          ? 'Transfer'
          : (t.category === 'Other' && originalTxn?.is_income === true)
            ? 'Income'
            : (t.category || 'Other')
        // Backend now provides normalized name; fall back to client-side normalizer
        const displayName = t.name || normalizeForDisplay(t.description) || t.description
        return { ...t, name: displayName, id: i, include: true, category }
      }))
      observe.info(DOMAIN.CATEGORISATION, 'Categorisation complete', { resultCount: rawResults.length })
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Categorisation timed out. Please try again with a smaller file, or import without AI categorisation.')
        observe.categorizationError(timeoutErr, { bank, rowCount: txns.length, reason: 'timeout' })
        setError(timeoutErr.message)
      } else {
        observe.categorizationError(err, { bank, rowCount: txns.length })
        setError(err.message)
      }
      // Still show parsed data with "Other" as fallback so user isn't stuck
      setCategorised(txns.map((t, i) => ({ ...t, id: i, category: t.is_transfer ? 'Transfer' : t.is_income ? 'Income' : 'Other', include: true })))
    } finally {
      clearTimeout(timeoutId)
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
    setSkippedCount(0)
    setRemovedInRangeCount(0)

    const included = categorised.filter(t => t.include)
    if (included.length === 0) { setSaving(false); return }

    const dates = included.map(t => t.date).filter(Boolean).sort()
    const minDate = dates[0] || '2020-01-01'
    const maxDate = dates[dates.length - 1] || formatLocalDate(new Date())

    try {
      const batchId = crypto.randomUUID()
      const toSave = []
      let skipped = 0

      if (replaceInRange) {
        const seen = new Set()
        for (const t of included) {
          const fp = txnFingerprint({
            date: t.date,
            amount: t.amount,
            description: (t.raw_merchant || t.description || t.name || ''),
          })
          if (seen.has(fp)) {
            skipped++
            continue
          }
          seen.add(fp)
          toSave.push({
            user_id:         user.id,
            name:            t.name || normalizeForDisplay(t.description) || t.description,
            amount:          t.amount,
            category:        t.category || 'Other',
            date:            t.date,
            raw_merchant:    t.raw_merchant || t.description,
            detected_bank:   bank || null,
            import_batch_id: batchId,
            transaction_hash: fp,
          })
        }
        if (toSave.length === 0) {
          setError('Replace was cancelled: no unique rows to import (every selected line is duplicated in this file). Uncheck Replace or fix the file.')
          setSaving(false)
          return
        }
        const { error: delErr, count: delCount } = await supabase
          .from('transactions')
          .delete({ count: 'exact' })
          .eq('user_id', user.id)
          .gte('date', minDate)
          .lte('date', maxDate)

        if (delErr) throw delErr
        setRemovedInRangeCount(typeof delCount === 'number' ? delCount : 0)
      } else {
        let { data: existing, error: existingError } = await supabase
          .from('transactions')
          .select('date, amount, name, raw_merchant, transaction_hash')
          .eq('user_id', user.id)
          .gte('date', minDate)
          .lte('date', maxDate)

        // Fallback: optional columns (transaction_hash, raw_merchant) may not exist
        // in older schemas. Retry with core fields only.
        const _selectErrMsg = String(existingError?.message || existingError?.details || '')
        if (existingError && (
          _selectErrMsg.includes('transaction_hash') ||
          _selectErrMsg.includes('raw_merchant')
        )) {
          const retry = await supabase
            .from('transactions')
            .select('date, amount, name')
            .eq('user_id', user.id)
            .gte('date', minDate)
            .lte('date', maxDate)
          existing = retry.data
          existingError = retry.error
        }

        if (existingError) throw existingError

        const existingFingerprints = buildFingerprintSet(
          (existing || []).map(t => ({ ...t, description: t.raw_merchant || t.name }))
        )
        // Overlap detection: warn if this batch is mostly already in the DB
        const overlapResult = detectBatchOverlap(
          included.map(t => ({ ...t, description: t.raw_merchant || t.description || t.name })),
          existingFingerprints
        )
        if (overlapResult.isDuplicate) {
          observe.duplicateOverlap(overlapResult, { bank, includedCount: included.length, minDate, maxDate })
          setOverlapWarning(
            `${overlapResult.overlapPct}% of these transactions already exist in your account ` +
            `(${overlapResult.overlapCount} of ${included.length}). ` +
            'This may be a duplicate upload. New transactions will still be imported.'
          )
        } else if (overlapResult.isPartialDuplicate) {
          // 30-69% overlap — partial duplicate, log and surface lightly
          observe.warn(DOMAIN.DUPLICATE, `Partial overlap: ${overlapResult.overlapPct}%`, {
            overlapCount: overlapResult.overlapCount,
            includedCount: included.length,
            bank,
          })
          setOverlapWarning(
            `${overlapResult.overlapCount} of these transactions already exist and will be skipped. ` +
            'Only new transactions will be imported.'
          )
        }
        const incomingFingerprints = new Set(existingFingerprints)

        for (const t of included) {
          const fp = txnFingerprint({
            date: t.date,
            amount: t.amount,
            description: (t.raw_merchant || t.description || t.name || ''),
          })
          if (incomingFingerprints.has(fp)) {
            skipped++
            continue
          }
          incomingFingerprints.add(fp)
          toSave.push({
            user_id:         user.id,
            name:            t.name || normalizeForDisplay(t.description) || t.description,
            amount:          t.amount,
            category:        t.category || 'Other',
            date:            t.date,
            raw_merchant:    t.raw_merchant || t.description,
            detected_bank:   bank || null,
            import_batch_id: batchId,
            transaction_hash: fp,
          })
        }
      }

      setSkippedCount(skipped)

      if (toSave.length > 0) {
        const { error } = await supabase.from('transactions').insert(toSave)
        if (error) {
          // Optional metadata columns (detected_bank, raw_merchant, transaction_hash,
          // import_batch_id) may not exist if the migration hasn't been run yet, or
          // if PostgREST's schema cache is stale. Strip all optional fields and retry
          // with core columns only so uploads are never blocked by schema lag.
          const _insertErrMsg = String(error.message || error.details || '')
          const _optionalColMissing = [
            'detected_bank', 'raw_merchant', 'transaction_hash', 'import_batch_id',
          ].some(col => _insertErrMsg.includes(col))

          if (_optionalColMissing) {
            console.warn('[ImportTransactions] Optional schema column missing — retrying without metadata:', _insertErrMsg)
            // Strip every optional metadata field; keep only core transaction fields.
            // eslint-disable-next-line no-unused-vars
            const fallbackRows = toSave.map(({ detected_bank, raw_merchant, transaction_hash, import_batch_id, ...row }) => row)
            const { error: retryError } = await supabase.from('transactions').insert(fallbackRows)
            if (retryError) throw retryError
          } else {
            throw error
          }
        }
      }

      observe.info(DOMAIN.INGESTION, 'Batch saved', { savedCount: toSave.length, skipped, bank, replaceInRange })
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
      const prefix = replaceInRange
        ? 'Save failed. If you used replace, rows in this date range may have been removed — re-import the file with Replace on to fill them again. '
        : ''
      observe.ingestionError(err, { bank, replaceInRange, includedCount: categorised.filter(t => t.include).length })
      setError(prefix + err.message)
    } finally {
      setSaving(false)
    }
  }

  const importRangeBounds = useMemo(() => {
    const d = categorised.filter(t => t.include).map(t => t.date).filter(Boolean).sort()
    return { from: d[0] || null, to: d[d.length - 1] || null }
  }, [categorised])

  const selectedCount  = categorised.filter(t => t.include).length
  const totalAmount    = categorised.filter(t => t.include && t.category !== 'Income' && t.category !== 'Transfer' && t.category !== 'Savings').reduce((s, t) => s + t.amount, 0)
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
        {inferring && (
          <div className="import-inferring">
            <span className="import-inferring-icon">🔍</span>
            {inferStage === 'full_parse'
              ? 'Extracting transactions with AI...'
              : 'Analysing statement format...'}
          </div>
        )}
        {error && !inferring && <div className="import-error">{error}</div>}
        <div className="import-tips">
          <strong>Tips for {bankLabel}:</strong>
          {bank === 'fnb'      && <p>Go to Transact → Accounts → Statement → Download CSV</p>}
          {bank === 'nedbank'  && <p>Money app → Accounts → Statement → Export → CSV</p>}
          {bank === 'absa'     && <p>Online Banking → My Accounts → Statement → Download Excel</p>}
          {bank === 'standard' && <p>Internet Banking → Accounts → Statement → Export</p>}
          {bank === 'capitec'  && <p>Capitec app → Transactions → Export → CSV</p>}
          {bank === 'investec' && <p>Online Banking → Accounts → Transaction History → Export → CSV or Excel</p>}
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

        {/* Integrity warnings (non-blocking) */}
        {!loading && overlapWarning && (
          <div className="import-warning import-warning--overlap">
            <span className="import-warning-icon">⚠️</span> {overlapWarning}
          </div>
        )}
        {!loading && batchWarnings.length > 0 && (
          <div className="import-warning">
            <div className="import-warning-title">⚠️ Parsing notices</div>
            {batchWarnings.map((w, i) => <div key={i} className="import-warning-item">{w}</div>)}
          </div>
        )}

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

        {!loading && categorised.length > 0 && (
          <label className="import-replace-box">
            <input
              type="checkbox"
              checked={replaceInRange}
              onChange={e => setReplaceInRange(e.target.checked)}
            />
            <span>
              <strong>Replace existing in this date range</strong>
              <span className="import-replace-hint">
                {' '}Removes every bump. transaction you already have between{' '}
                <strong>{importRangeBounds.from || '…'}</strong>
                {' '}and <strong>{importRangeBounds.to || '…'}</strong>
                , then imports this file. Use when you are re-uploading a corrected statement. Manual entries in that range are removed too.
              </span>
            </span>
          </label>
        )}

        {!loading && (
          <div className="preview-actions">
            <button className="import-back-btn" onClick={() => { setStep('upload'); setCategorised([]); setReplaceInRange(false) }}>
              ← Re-upload
            </button>
            <button
              className="import-primary-btn"
              disabled={saving || selectedCount === 0}
              onClick={handleSave}
            >
              {saving ? 'Saving...' : `${replaceInRange ? 'Replace & ' : ''}import ${selectedCount} transactions`}
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
        <h2>{savedCount} transaction{savedCount !== 1 ? 's' : ''} imported</h2>
        <p>
          Your spending has been categorised and added to your dashboard.
          {removedInRangeCount > 0 && ` ${removedInRangeCount} previous row${removedInRangeCount !== 1 ? 's' : ''} in that date range ${removedInRangeCount !== 1 ? 'were' : 'was'} removed.`}
          {skippedCount > 0 && ` ${skippedCount} duplicate line${skippedCount !== 1 ? 's' : ''} in the file ${skippedCount !== 1 ? 'were' : 'was'} skipped.`}
        </p>
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
            setReplaceInRange(false)
            setRemovedInRangeCount(0)
            setSkippedCount(0)
          }}>
            Import another file
          </button>
        </div>
      </div>
    )
  }

  return null
}
