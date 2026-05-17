import { createClient } from '@supabase/supabase-js'

// ── schema-infer.js ───────────────────────────────────────────────────────────
// AI-assisted fallback for bank statement column inference.
// Called ONLY when the deterministic parser in ImportTransactions.jsx returns
// zero transactions (i.e. column names are unrecognised / irregular).
//
// Accepts: { headers: string[], sampleRows: object[], bankHint?: string }
// Returns: { mapping: { dateCol, descCol, amtCol, debitCol, creditCol, structureType } }
//
// Claude receives ONLY: column headers + max 5 raw sample rows.
// No financial calculations, no categorisation — structure inference only.

const SYSTEM_PROMPT = `You are a bank statement schema analyser. Your ONLY job is to identify which columns in a CSV/Excel bank statement correspond to specific transaction fields.

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
  // Ensure all non-null column references actually exist in the headers
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

  // ── Build prompt (headers + max 5 rows — minimal context for cost) ────────
  const prompt = buildInferPrompt(headers, sampleRows, bankHint || null)

  // ── Call Claude Haiku ─────────────────────────────────────────────────────
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
        system: SYSTEM_PROMPT,
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

  // ── Guard: must have at least descCol to be useful ────────────────────────
  if (!mapping.descCol) {
    return {
      statusCode: 200,
      body: JSON.stringify({ mapping: null, reason: 'Could not identify a description column' }),
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  }
}
