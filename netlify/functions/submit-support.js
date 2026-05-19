/**
 * submit-support.js
 * Accepts a user support ticket and persists it to the support_requests table.
 *
 * POST { category, message }
 *   → Validates input
 *   → Reads user email from auth.users (for admin convenience)
 *   → Reads full_name from profiles (denormalized so admin doesn't need joins)
 *   → Inserts to support_requests
 *   → Returns { success: true, id }
 *
 * Auth required. Rate-limited to 5 submissions per user per 24h to prevent spam.
 */

import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const VALID_CATEGORIES = [
  'Technical issue',
  'Billing',
  'Feature request',
  'Data / Privacy',
  'Other',
]

const MAX_SUBMISSIONS_PER_DAY = 5

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // ── Parse + validate body ───────────────────────────────────────────────────
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { category, message } = body

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` })
    }
  }
  if (!message || typeof message !== 'string' || message.trim().length < 10) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message must be at least 10 characters' }) }
  }
  if (message.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message must be under 2000 characters' }) }
  }

  // ── Rate limit: max 5 requests per user per 24h ─────────────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await adminClient
    .from('support_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((count || 0) >= MAX_SUBMISSIONS_PER_DAY) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests. Please try again tomorrow or email support directly.' })
    }
  }

  // ── Fetch user metadata for denormalized storage ────────────────────────────
  let email = user.email || null
  let full_name = null
  try {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    full_name = profile?.full_name || null
  } catch { /* non-fatal */ }

  // ── Insert ──────────────────────────────────────────────────────────────────
  const { data, error: insertError } = await adminClient
    .from('support_requests')
    .insert({
      user_id:  user.id,
      email,
      full_name,
      category,
      message:  message.trim(),
      status:   'open',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[submit-support] insert error:', insertError.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not submit your request. Please try again.' }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, id: data?.id })
  }
}
