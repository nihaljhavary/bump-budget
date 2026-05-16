/**
 * netlify/functions/manage-uploads.js
 * List and delete import batches for a user.
 *
 * GET  ?action=list          → returns [ { batchId, fromDate, toDate, count, totalAmount, createdAt } ]
 * POST { action: 'delete', batchId: UUID }
 *      → deletes all transactions with that import_batch_id (safe cascade)
 *
 * Auth: Bearer token required (user can only touch their own data).
 */

import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

function authClients(token) {
  const url    = process.env.VITE_SUPABASE_URL
  const anon   = process.env.VITE_SUPABASE_ANON_KEY
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  return {
    anonClient:  createClient(url, anon),
    adminClient: createClient(url, svcKey),
    token,
  }
}

async function getUser(anonClient, token) {
  const { data: { user }, error } = await anonClient.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')
  return user
}

export async function handler(event) {
  try {
    return await _handler(event)
  } catch (err) {
    console.error('[manage-uploads] error:', err.message)
    const status = err.message === 'Unauthorized' ? 401 : 500
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) }
  }
}

async function _handler(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const { anonClient, adminClient } = authClients(token)
  const user = await getUser(anonClient, token)

  // ── LIST batches ────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    // Fetch all transactions that have an import_batch_id (paginated)
    const PAGE = 1000
    let all = []
    let offset = 0
    for (;;) {
      const { data, error } = await adminClient
        .from('transactions')
        .select('id, import_batch_id, date, amount, name, created_at, detected_bank')
        .eq('user_id', user.id)
        .not('import_batch_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      all.push(...(data || []))
      if ((data || []).length < PAGE) break
      offset += PAGE
    }

    // Group by import_batch_id
    const groups = {}
    for (const t of all) {
      const id = t.import_batch_id
      if (!groups[id]) {
        groups[id] = { batchId: id, fromDate: t.date, toDate: t.date, count: 0, totalAmount: 0, createdAt: t.created_at, detectedBank: t.detected_bank || null }
      }
      const g = groups[id]
      g.count++
      g.totalAmount += t.amount || 0
      if (t.date < g.fromDate) g.fromDate = t.date
      if (t.date > g.toDate)   g.toDate   = t.date
      // Keep the earliest created_at per batch as the upload time
      if (t.created_at < g.createdAt) g.createdAt = t.created_at
    }

    const batches = Object.values(groups).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batches }) }
  }

  // ── DELETE batch ────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}

    if (body.action !== 'delete' || !body.batchId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'body must be { action: "delete", batchId: UUID }' }) }
    }

    // Validate batchId format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.batchId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid batchId format' }) }
    }

    const { error, count } = await adminClient
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)        // CRITICAL: always scope to user
      .eq('import_batch_id', body.batchId)

    if (error) throw new Error(error.message)

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: count || 0 }) }
  }

  return { statusCode: 405, body: 'Method not allowed' }
}
