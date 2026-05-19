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

  // -- update_access_status ----------------------------------------------------
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
    const { error } = await adminClient
      .from('profiles')
      .update({
        subscription_plan:   plan,
        subscription_status: 'active',
        cancel_at_period_end: false,
        scheduled_plan:      null,
        trial_ends_at:       null,
      })
      .eq('id', userId)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

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

    const { error } = await adminClient
      .from('profiles')
      .update({
        subscription_plan:   'free',
        subscription_status: 'active',
        cancel_at_period_end: false,
        scheduled_plan:      null,
        trial_ends_at:       null,
        paystack_sub_code:   null,
      })
      .eq('id', userId)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

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

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) }
}
