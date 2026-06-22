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

  // Confirm caller is admin (accept either role='admin' or is_admin=true)
  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role, is_admin')
    .eq('id', user.id)
    .single()

  if (!callerProfile || (callerProfile.role !== 'admin' && !callerProfile.is_admin)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  let body = {}
  try { body = JSON.parse(event.body) } catch { /* ok */ }
  const { action } = body

  // -- get_dashboard -----------------------------------------------------------
  if (action === 'get_dashboard') {
    const [reqRes, bookRes, profRes] = await Promise.all([
      adminClient
        .from('consultant_access')
        .select('id, user_id, status, podcast_consent, granted_at, created_at, user:user_id(id, full_name, created_at)')
        .order('created_at', { ascending: false }),
      (async () => {
        let result = await adminClient
          .from('bookings')
          .select('id, user_id, tier, amount, status, payment_ref, booking_date, booking_time, created_at, user:user_id(id, full_name)')
          .order('created_at', { ascending: false })
        if (result.error && (result.error.message?.includes('booking_date') || result.error.message?.includes('schema cache'))) {
          result = await adminClient
            .from('bookings')
            .select('id, user_id, tier, amount, status, payment_ref, created_at, user:user_id(id, full_name)')
            .order('created_at', { ascending: false })
        }
        return result
      })(),
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

  // -- update_access_status ----------------------------------------------------
  if (action === 'update_access_status') {
    const { accessId, status } = body
    const VALID_ACCESS_STATUSES = ['pending', 'approved', 'denied']
    if (!VALID_ACCESS_STATUSES.includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid status value' }) }
    }
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

  // -- get_user_transactions ---------------------------------------------------
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

  // -- list_all_profiles — for the tester access panel -------------------------
  // Returns all profiles enriched with email from auth.users (service role).
  if (action === 'list_all_profiles') {
    const { data: profiles, error } = await adminClient
      .from('profiles')
      .select('id, full_name, subscription_plan, subscription_status, is_admin, role, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

    // Enrich with emails from auth.users (best-effort — skip if service role lacks permission)
    let emailMap = {}
    try {
      const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (authData?.users) authData.users.forEach(u => { emailMap[u.id] = u.email })
    } catch {}

    const enriched = (profiles || []).map(p => ({
      ...p,
      email: emailMap[p.id] || null,
    }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: enriched })
    }
  }

  // -- grant_tier — admin grants premium access without Paystack ---------------
  // Sets subscription_plan + subscription_status = 'active' directly.
  // Integrates with TierContext: as long as plan + status are set, tier unlocks.
  if (action === 'grant_tier') {
    const { userId, plan } = body
    const validPlans = ['starter', 'growth', 'pro']
    if (!userId || !validPlans.includes(plan)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid userId or plan' }) }
    }
    // Try full payload first (clears any stale subscription lifecycle columns).
    // If PostgREST schema cache doesn't have those columns yet, fall back to the
    // minimal payload that only sets the two columns TierContext requires.
    const minimalPayload = { subscription_plan: plan, subscription_status: 'active' }
    const fullPayload    = { ...minimalPayload, cancel_at_period_end: false, scheduled_plan: null, trial_ends_at: null }

    let { error } = await adminClient.from('profiles').update(fullPayload).eq('id', userId)
    if (error && (error.message?.includes('cancel_at_period_end') || error.message?.includes('schema cache'))) {
      console.warn('[admin] grant_tier falling back to minimal payload:', error.message)
      const retry = await adminClient.from('profiles').update(minimalPayload).eq('id', userId)
      error = retry.error
    }

    if (error) return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update user tier. Please try again.' }) }

    // Log the admin grant event
    await adminClient.from('subscription_events').insert({
      user_id:    userId,
      event_type: 'admin_grant',
      plan,
      amount:     0,
      raw_payload: { granted_by: user.id, method: 'admin_grant' },
    }).maybeSingle()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, plan })
    }
  }

  // -- revoke_tier — admin resets a user's tier to free ------------------------
  if (action === 'revoke_tier') {
    const { userId } = body
    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'userId required' }) }

    const minimalRevoke = { subscription_plan: 'free', subscription_status: 'active' }
    const fullRevoke    = { ...minimalRevoke, cancel_at_period_end: false, scheduled_plan: null, trial_ends_at: null, paystack_sub_code: null }

    let { error: revokeErr } = await adminClient.from('profiles').update(fullRevoke).eq('id', userId)
    if (revokeErr && (revokeErr.message?.includes('cancel_at_period_end') || revokeErr.message?.includes('schema cache') || revokeErr.message?.includes('paystack_sub_code'))) {
      console.warn('[admin] revoke_tier falling back to minimal payload:', revokeErr.message)
      const retry = await adminClient.from('profiles').update(minimalRevoke).eq('id', userId)
      revokeErr = retry.error
    }

    if (revokeErr) return { statusCode: 500, body: JSON.stringify({ error: 'Failed to revoke user tier. Please try again.' }) }

    await adminClient.from('subscription_events').insert({
      user_id:    userId,
      event_type: 'admin_revoke',
      plan:       'free',
      amount:     0,
      raw_payload: { revoked_by: user.id, method: 'admin_revoke' },
    }).maybeSingle()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    }
  }

  // -- update_booking_status — admin changes status of a consult booking ------
  if (action === 'update_booking_status') {
    const { bookingId, status: newStatus } = body
    const VALID_BOOKING_STATUSES = ['pending_eft', 'paid', 'confirmed', 'completed', 'cancelled']
    if (!bookingId || !VALID_BOOKING_STATUSES.includes(newStatus)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'bookingId and valid status required' }) }
    }
    const { error: updErr } = await adminClient
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)

    if (updErr) return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update booking status.' }) }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, bookingId, status: newStatus })
    }
  }

  // -- get_error_logs — recent structured error events for admin visibility ----------
  if (action === 'get_error_logs') {
    const limit  = body.limit  || 150
    const domain = body.domain || null   // optional domain filter
    const sev    = body.severity || null  // optional severity filter

    let q = adminClient
      .from('error_logs')
      .select('id, user_id, severity, domain, message, metadata, error_message, url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (domain) q = q.eq('domain', domain)
    if (sev)    q = q.eq('severity', sev)

    const { data: logs, error: logsErr } = await q
    if (logsErr) return { statusCode: 500, body: JSON.stringify({ error: logsErr.message }) }

    // Enrich with emails (best-effort)
    let emailMap = {}
    try {
      const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (authData?.users) authData.users.forEach(u => { emailMap[u.id] = u.email })
    } catch {}

    const enriched = (logs || []).map(l => ({
      ...l,
      email: l.user_id ? (emailMap[l.user_id] || null) : null,
    }))

    // Compute simple grouping: count by domain+message (top recurring errors)
    const groups = {}
    for (const l of enriched) {
      const key = `${l.domain || 'unknown'}::${(l.message || l.error_message || '').slice(0, 80)}`
      if (!groups[key]) groups[key] = { domain: l.domain, message: l.message || l.error_message, severity: l.severity, count: 0, lastSeen: l.created_at, affectedUsers: new Set() }
      groups[key].count++
      if (l.user_id) groups[key].affectedUsers.add(l.user_id)
      if (l.created_at > groups[key].lastSeen) groups[key].lastSeen = l.created_at
    }
    const topErrors = Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map(g => ({ ...g, affectedUsers: g.affectedUsers.size }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: enriched, topErrors })
    }
  }

  // -- get_support_requests — all user-submitted support tickets ---------------
  if (action === 'get_support_requests') {
    const statusFilter = body.status || null  // optional: 'open' | 'in_progress' | 'resolved'

    let q = adminClient
      .from('support_requests')
      .select('id, user_id, email, full_name, category, message, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter) q = q.eq('status', statusFilter)

    const { data: requests, error: reqErr } = await q
    if (reqErr) return { statusCode: 500, body: JSON.stringify({ error: reqErr.message }) }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: requests || [] })
    }
  }

  // -- update_support_status — update a support ticket status -----------------
  if (action === 'update_support_status') {
    const { requestId, status: newStatus } = body
    const valid = ['open', 'in_progress', 'resolved']
    if (!requestId || !valid.includes(newStatus)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId and valid status required' }) }
    }
    const { error: updErr } = await adminClient
      .from('support_requests')
      .update({ status: newStatus })
      .eq('id', requestId)

    if (updErr) return { statusCode: 500, body: JSON.stringify({ error: updErr.message }) }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) }
}
