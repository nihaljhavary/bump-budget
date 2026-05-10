import XLSX from 'xlsx'
import { saPreCategory, normalizeDescription } from '../netlify/functions/sa-categorise.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/parse-discovery-statement.mjs <xlsx>')
  process.exit(1)
}

function normaliseAmount(val) {
  if (val === undefined || val === null || val === '') return null
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(n) ? null : Math.abs(n)
}

function normaliseDate(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const d = new Date(s)
  if (!Number.isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

function findCol(headers, ...options) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim())
  for (const opt of options) {
    const idx = lower.findIndex(h => h.includes(opt.toLowerCase()))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function txnFingerprint(txn) {
  const desc = (txn.description || txn.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const amt = Math.round((txn.amount || 0) * 100) / 100
  return `${txn.date}|${amt}|${desc}`
}

function parseRows(rows, bankId = 'discovery') {
  if (rows.length === 0) return { txns: [], columns: {} }
  const headers = Object.keys(rows[0])
  const dateCol = findCol(headers, 'value date', 'date')
  const descCol = findCol(headers, 'description', 'beneficiary or cardholder', 'beneficiary')
  const amtCol = findCol(headers, 'amount')
  const debitCol = findCol(headers, 'debit')
  const creditCol = findCol(headers, 'credit')
  const typeCol = findCol(headers, 'type')
  const columns = { dateCol, descCol, amtCol, debitCol, creditCol, typeCol, headers }

  const txns = []
  const skipped = []
  rows.forEach((row, rowIndex) => {
    const desc = row[descCol] ? String(row[descCol]).trim() : null
    if (!desc) {
      skipped.push({ rowIndex, reason: 'missing description', row })
      return
    }

    let amount = null
    let isIncome = false
    let rawAmount = null
    const isTransfer = /transfer|discovery pay/i.test(typeCol ? row[typeCol] : '')

    if (amtCol && row[amtCol] !== undefined && row[amtCol] !== '') {
      rawAmount = row[amtCol]
      const raw = parseFloat(String(row[amtCol]).replace(/[^0-9.\-]/g, ''))
      if (!Number.isNaN(raw)) {
        isIncome = raw > 0
        amount = Math.abs(raw)
      }
    } else if (debitCol || creditCol) {
      const debit = normaliseAmount(row[debitCol])
      const credit = normaliseAmount(row[creditCol])
      rawAmount = { debit: row[debitCol], credit: row[creditCol] }
      if (credit && credit > 0) {
        amount = credit
        isIncome = true
      } else if (debit && debit > 0) {
        amount = debit
      }
    }

    if (!amount || amount <= 0) {
      skipped.push({ rowIndex, reason: 'missing amount', row })
      return
    }

    const category = saPreCategory(desc) || (isTransfer ? 'Transfer' : isIncome ? 'Income' : 'Other')
    txns.push({
      rowIndex,
      date: normaliseDate(row[dateCol]),
      description: desc,
      name: normalizeDescription(desc) || desc,
      amount,
      rawAmount,
      type: typeCol ? row[typeCol] : undefined,
      is_income: isIncome,
      is_transfer: isTransfer,
      category,
    })
  })
  return { txns, skipped, columns }
}

function summarize(txns) {
  const summary = {
    count: txns.length,
    income: 0,
    spend: 0,
    transfer: 0,
    savings: 0,
    excluded: 0,
    categories: {},
    ids: txns.map(t => t.rowIndex),
    spendIds: [],
    transferIds: [],
    savingsIds: [],
    incomeIds: [],
    excludedIds: [],
    duplicateGroups: [],
  }
  const byFp = new Map()
  for (const t of txns) {
    if (t.category === 'Income') {
      summary.income += t.amount
      summary.incomeIds.push(t.rowIndex)
      summary.excluded += t.amount
      summary.excludedIds.push(t.rowIndex)
    } else if (t.category === 'Transfer') {
      summary.transfer += t.amount
      summary.transferIds.push(t.rowIndex)
      summary.excluded += t.amount
      summary.excludedIds.push(t.rowIndex)
    } else if (t.category === 'Savings') {
      summary.savings += t.amount
      summary.savingsIds.push(t.rowIndex)
      summary.excluded += t.amount
      summary.excludedIds.push(t.rowIndex)
    } else {
      summary.spend += t.amount
      summary.spendIds.push(t.rowIndex)
      summary.categories[t.category] = (summary.categories[t.category] || 0) + t.amount
    }
    const key = txnFingerprint(t)
    if (!byFp.has(key)) byFp.set(key, [])
    byFp.get(key).push(t)
  }
  summary.categories = Object.fromEntries(Object.entries(summary.categories).sort((a, b) => b[1] - a[1]))
  summary.duplicateGroups = [...byFp.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([fingerprint, rows]) => ({
      fingerprint,
      count: rows.length,
      rowIndexes: rows.map(r => r.rowIndex),
      totalAmount: rows.reduce((s, r) => s + r.amount, 0),
      category: rows[0].category,
      date: rows[0].date,
      name: rows[0].name,
    }))
  return summary
}

const wb = XLSX.readFile(file, { cellDates: false })
const sheetName = wb.SheetNames[0]
const ws = wb.Sheets[sheetName]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
const { txns, skipped, columns } = parseRows(rows)
const byMonth = new Map()
for (const txn of txns) {
  const month = txn.date?.slice(0, 7) || 'invalid-date'
  if (!byMonth.has(month)) byMonth.set(month, [])
  byMonth.get(month).push(txn)
}

const months = Object.fromEntries([...byMonth.entries()].map(([month, monthTxns]) => [month, summarize(monthTxns)]))
const feb = byMonth.get('2025-02') || []
const topRows = [...feb].sort((a, b) => b.amount - a.amount).slice(0, 30)

console.log(JSON.stringify({
  file,
  sheetName,
  rowCount: rows.length,
  columns,
  skippedCount: skipped.length,
  all: summarize(txns),
  months,
  february2025TopRows: topRows,
}, null, 2))
