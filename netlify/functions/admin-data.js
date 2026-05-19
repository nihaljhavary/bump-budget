import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // Verify caller
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.replace('Bearer ', '')

  // Validate JWT
  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  // Service-role client for admin ops
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Confirm caller is admin
  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  const body = JSON.parse(event.body)
  const { action } = body

  // ── get_dashboard ──────────────────────────────────────────────────────────
  if (action === 'get_dashboard') {
    const [reqRes, bookRes, profRes] = await Promise.all([
      adminClient
        .from('consultant_access')
        .select('id, user_id, status, podcast_consent, granted_at, created_at, user:user_id(id, full_name, created_at)')
        .order('created_at', { ascending: false }),
      adminClient
        .from('bookings')
        .select('id, user_id, tier, amount, status, payment_ref, scheduled_at, created_at, user:user_id(id, full_name)')
        .order('created_at', { ascending: false }),
      adminClient
        .from('profiles')
        .select('id, full_name, role, created_at')
        .order('created_at', { ascending: false })
    ])

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: reqRes.data  || [],
        bookings: bookRes.data || [],
        profiles: profRes.data || []
      })
    }
  }

  // ── update_access_status ───────────────────────────────────────────────────
  if (action === 'update_access_status') {
    const { accessId, status } = body
    const { error } = await adminClient
      .from('consultant_access')
      .update({
        status,
        granted_at: status === 'approved' ? new Date().toISOString() : null
      })
      .eq('id', accessId)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    }
  }

  // ── get_user_transactions ──────────────────────────────────────────────────
  if (action === 'get_user_transactions') {
    const { userId } = body
    const { data: transactions, error } = await adminClient
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: transactions || [] })
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) }
}
