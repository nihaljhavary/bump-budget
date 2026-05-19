import { createClient } from '@supabase/supabase-js'

// ── schema-infer.js ───────────────────────────────────────────────────────────
// AI-assisted fallback for bank statement column inference.
// Two modes:
//
//   mode = 'infer_schema' (default):
//     Called when deterministic parser has low confidence.
//     Accepts: { headers: string[], sampleRows: object[], bankHint?: string }
//     Returns: { mapping: { dateCol, descCol, amtCol, debitCol, creditCol, structureType } | null }
//
//   mode = 'full_parse':
//     Called when schema inference also fails — last resort before hard fail.
//     Accepts: { rows: object[], bankHint?: string }
//     Returns: { transactions: [{date, description, amount, type}], truncated, rowsProcessed }

// ── Schema inference mode ─────────────────────────────────────────────────────

const INFER_SYSTEM = `You are a bank statement schema analyser. Your ONLY job is to identify which columns in a CSV/Excel bank statement correspond to specific transaction fields.

You will receive column headers and sample rows. You must return a JSON mapping identifying:
- dateCol: the transaction date column header (exact string match)
- descCol: the merchant / description / narrative / reference column header
- amtCol: a single amount column (signed: positive=credit, negative=debit) OR null
- debitCol: the debit/outflow column header, OR null
- creditCol: the credit/inflow column header, OR null  
- balanceCol: running balance column (optional, may be null)
- structureType: "signed_amount" | "debit_credit" | "balance_ledger"

Rules:
- Use EXACT header strings from the provided headers array
- Prefer descCol that contains merchant or narrative text, not just reference numbers
- If a single column has mixed positive/negative amounts: structureType = "signed_amount", set amtCol, set debitCol and creditCol to null
- If separate debit and credit columns: structureType = "debit_credit", set debitCol and creditCol, set amtCol to null
- If only a running balance exists (no amount column): structureType = "balance_ledger"
- Set any field to null if you cannot identify it confidently
- Never invent column names — only use exact strings from the headers array

Respond with ONLY raw JSON — no markdown, no explanation, no code fences.`

function buildInferPrompt(headers, sampleRows, bankHint) {
  const rowSample = sampleRows.slice(0, 5)
  const lines = [
    `Column headers: ${JSON.stringify(headers)}`,
    bankHint ? `Bank hint: ${bankHint}` : '',
    '',
    `Sample rows (first ${rowSample.length}):`,
    JSON.stringify(rowSample, null, 2),
  ].filter(l => l !== undefined)
  return lines.join('\n')
}

function validateMapping(mapping, headers) {
  const headerSet = new Set(headers)
  const colFields = ['dateCol', 'descCol', 'amtCol', 'debitCol', 'creditCol', 'balanceCol']
  const safe = {}
  for (const field of colFields) {
    const val = mapping[field]
    safe[field] = (val && headerSet.has(val)) ? val : null
  }
  const validTypes = new Set(['signed_amount', 'debit_credit', 'balance_ledger'])
  safe.structureType = validTypes.has(mapping.structureType) ? mapping.structureType : 'signed_amount'
  return safe
}

// ── Full-parse mode ───────────────────────────────────────────────────────────
// Extracts transactions directly from raw rows when schema mapping fails.
// Claude receives ALL row data (up to MAX_FULL_PARSE_ROWS) and returns
// structured transactions without needing column mapping.

const MAX_FULL_PARSE_ROWS = 300

const FULL_PARSE_SYSTEM = `You are a bank statement transaction extractor for South African banks. Your job is to extract all financial transactions from raw bank statement rows.

Return a JSON array of transaction objects. Each object must have exactly these fields:
- "date": transaction date in YYYY-MM-DD format
- "description": merchant name or transaction description (plain text, concise but meaningful)
- "amount": transaction amount as a positive number in rands (no currency symbols, always positive absolute value)
- "type": one of "expense" | "income" | "transfer"

Classification rules:
- type="income" for: salary/pay credits, refunds, cashbacks, deposits, payments received into account
- type="transfer" for: inter-account transfers, own-account movements, PayShap to own accounts, internal transfers
- type="expense" for: all other debit/spending transactions (purchases, fees, withdrawals, debit orders)

Additional rules:
- amount is always positive (absolute value — ignore sign)
- Skip non-transaction rows: column headers, account totals, opening/closing balances, blank rows, subtitle rows
- If date cannot be parsed, use today's date in YYYY-MM-DD format
- description must be non-empty and meaningful (not just a reference code)
- Return ONLY a raw JSON array — no markdown, no explanation, no code fences
- If no valid transactions found, return an empty array []`

function buildFullParsePrompt(rows, bankHint) {
  const lines = [
    bankHint ? `Bank: ${bankHint}` : 'Bank: unknown South African bank',
    `Total rows: ${rows.length}`,
    '',
    'Statement rows:',
    JSON.stringify(rows, null, 0),
  ].filter(Boolean)
  return lines.join('\n')
}

async function handleFullParse(rows, bankHint) {
  const rowsToProcess = rows.slice(0, MAX_FULL_PARSE_ROWS)
  const truncated = rows.length > MAX_FULL_PARSE_ROWS

  const prompt = buildFullParsePrompt(rowsToProcess, bankHint || null)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: FULL_PARSE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw = (data.content?.[0]?.text || '').trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Claude returned non-array response')

  // Validate and sanitise each transaction
  const VALID_TYPES = new Set(['expense', 'income', 'transfer'])
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

  const transactions = parsed
    .filter(t => t && typeof t === 'object' && t.description && Number(t.amount) > 0)
    .map(t => ({
      date: (typeof t.date === 'string' && DATE_RE.test(t.date)) ? t.date : new Date().toISOString().slice(0, 10),
      description: String(t.description).trim().slice(0, 200),
      amount: Math.abs(Number(t.amount)),
      type: VALID_TYPES.has(t.type) ? t.type : 'expense',
    }))

  return { transactions, truncated, rowsProcessed: rowsToProcess.length }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const mode = body.mode || 'infer_schema'

  // ── Route: full_parse mode ────────────────────────────────────────────────
  if (mode === 'full_parse') {
    const { rows, bankHint } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: '`rows` must be a non-empty array for full_parse mode' }) }
    }
    if (rows.length > 2000) {
      return { statusCode: 400, body: JSON.stringify({ error: `Too many rows (${rows.length}) — maximum is 2000. Please export a shorter date range.` }) }
    }
    try {
      const result = await handleFullParse(rows, bankHint || null)
      console.log(`[schema-infer] Full parse: extracted ${result.transactions.length} transactions from ${result.rowsProcessed} rows (truncated=${result.truncated})`)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }
    } catch (err) {
      console.error('[schema-infer] Full parse failed:', err?.message || err)
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'AI extraction failed — could not parse statement' }),
      }
    }
  }

  // ── Route: infer_schema mode (default) ───────────────────────────────────
  const { headers, sampleRows, bankHint } = body

  if (!Array.isArray(headers) || headers.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: '`headers` must be a non-empty array' }) }
  }
  if (headers.length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Too many columns (max 50)' }) }
  }
  if (!Array.isArray(sampleRows)) {
    return { statusCode: 400, body: JSON.stringify({ error: '`sampleRows` must be an array' }) }
  }

  const prompt = buildInferPrompt(headers, sampleRows, bankHint || null)

  let mapping
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: INFER_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const raw = (data.content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

    const parsed = JSON.parse(raw)
    mapping = validateMapping(parsed, headers)
  } catch (err) {
    console.error('[schema-infer] Claude call failed:', err?.message || err)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Schema inference failed — could not parse Claude response' }),
    }
  }

  if (!mapping.descCol) {
    console.log('[schema-infer] No description column identified:', JSON.stringify({ headers, bankHint }))
    return {
      statusCode: 200,
      body: JSON.stringify({ mapping: null, reason: 'Could not identify a description column' }),
    }
  }

  const hasAmountCol = !!(mapping.amtCol || mapping.debitCol || mapping.creditCol)
  if (!hasAmountCol) {
    const reason = mapping.structureType === 'balance_ledger'
      ? 'Statement uses a running-balance format — individual transaction amounts could not be identified'
      : 'Could not identify a transaction amount column'
    console.log('[schema-infer] No amount column identified:', JSON.stringify({ structureType: mapping.structureType, headers, bankHint }))
    return {
      statusCode: 200,
      body: JSON.stringify({ mapping: null, reason }),
    }
  }

  console.log('[schema-infer] Mapping resolved:', JSON.stringify({ descCol: mapping.descCol, amtCol: mapping.amtCol, debitCol: mapping.debitCol, creditCol: mapping.creditCol, structureType: mapping.structureType }))
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  }
}
