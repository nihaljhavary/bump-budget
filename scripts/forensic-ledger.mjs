import fs from 'node:fs'

function readEnv() {
  const text = fs.readFileSync('.env', 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function fp(txn) {
  const desc = (txn.raw_merchant || txn.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const amount = Math.round((Number(txn.amount) || 0) * 100) / 100
  return `${txn.date}|${amount}|${desc}`
}

function classify(txn) {
  if (txn.category === 'Income') return 'income'
  if (txn.category === 'Transfer') return 'transfer'
  if (txn.category === 'Savings') return 'savings'
  return 'spend'
}

function summarize(rows) {
  const out = {
    transactionCount: rows.length,
    income: 0,
    spend: 0,
    transfer: 0,
    savings: 0,
    excluded: 0,
    categories: {},
    spendIds: [],
    incomeIds: [],
    transferIds: [],
    savingsIds: [],
    excludedIds: [],
    duplicateGroups: [],
  }

  const byFp = new Map()
  for (const txn of rows) {
    const amount = Number(txn.amount) || 0
    const bucket = classify(txn)
    if (bucket === 'income') {
      out.income += amount
      out.incomeIds.push(txn.id)
      out.excluded += amount
      out.excludedIds.push(txn.id)
    } else if (bucket === 'transfer') {
      out.transfer += amount
      out.transferIds.push(txn.id)
      out.excluded += amount
      out.excludedIds.push(txn.id)
    } else if (bucket === 'savings') {
      out.savings += amount
      out.savingsIds.push(txn.id)
      out.excluded += amount
      out.excludedIds.push(txn.id)
    } else {
      out.spend += amount
      out.spendIds.push(txn.id)
      out.categories[txn.category || 'Uncategorized'] =
        (out.categories[txn.category || 'Uncategorized'] || 0) + amount
    }

    const key = fp(txn)
    if (!byFp.has(key)) byFp.set(key, [])
    byFp.get(key).push(txn)
  }

  out.duplicateGroups = [...byFp.entries()]
    .filter(([, txns]) => txns.length > 1)
    .map(([fingerprint, txns]) => ({
      fingerprint,
      count: txns.length,
      ids: txns.map(t => t.id),
      totalAmount: txns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      category: txns[0]?.category,
      date: txns[0]?.date,
      name: txns[0]?.name,
    }))

  out.categories = Object.fromEntries(
    Object.entries(out.categories).sort((a, b) => b[1] - a[1])
  )
  return out
}

async function query(path, key) {
  const res = await fetch(path, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

const env = readEnv()
const base = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY
const month = process.argv[2] || '2026-02'
const userArg = process.argv[3] || ''

if (month === 'scan') {
  const select = 'id,user_id,date,amount,category,name,raw_merchant,import_batch_id,created_at'
  const allRows = await query(`${base}/rest/v1/transactions?select=${select}&order=date.asc,created_at.asc`, key)
  const byMonth = new Map()
  for (const row of allRows) {
    const m = row.date?.slice(0, 7) || 'no-date'
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push(row)
  }
  const months = [...byMonth.entries()].map(([m, rowsForMonth]) => ({
    month: m,
    ...summarize(rowsForMonth),
    userCount: new Set(rowsForMonth.map(r => r.user_id)).size,
  }))
  console.log(JSON.stringify({ totalRows: allRows.length, months }, null, 2))
  process.exit(0)
}

const [year, monthNum] = month.split('-').map(Number)
const from = `${year}-${String(monthNum).padStart(2, '0')}-01`
const lastDay = new Date(year, monthNum, 0).getDate()
const to = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

const select = 'id,user_id,date,amount,category,name,raw_merchant,import_batch_id,created_at'
let url = `${base}/rest/v1/transactions?select=${select}&date=gte.${from}&date=lte.${to}&order=user_id.asc,date.asc,created_at.asc`
if (userArg) url += `&user_id=eq.${userArg}`

const rows = await query(url, key)
const byUser = new Map()
for (const row of rows) {
  if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
  byUser.get(row.user_id).push(row)
}

const users = [...byUser.entries()]
  .map(([userId, userRows]) => ({
    userId,
    ...summarize(userRows),
  }))
  .sort((a, b) => b.spend - a.spend)

const report = {
  month,
  boundaries: { from, to },
  totalRows: rows.length,
  userCount: users.length,
  users,
}

console.log(JSON.stringify(report, null, 2))
