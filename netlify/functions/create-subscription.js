import { createClient } from '@supabase/supabase-js'

const PLAN_NAME   = 'Budget Coach Monthly'
const PLAN_AMOUNT = 19900   // R199 in kobo (Paystack ZAR uses kobo = cents × 100 ... actually ZAR uses cents, R199 = 19900 cents)
const PLAN_INTERVAL = 'monthly'

async function getOrCreatePlan() {
  // List existing plans and find ours by name
  const listRes = await fetch('https://api.paystack.co/plan?perPage=100', {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  })
  const listData = await listRes.json()

  if (listData.status && Array.isArray(listData.data)) {
    const existing = listData.data.find(p => p.name === PLAN_NAME)
    if (existing) return existing.plan_code
  }

  // Create plan if not found
  const createRes = await fetch('https://api.paystack.co/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
    },
    body: JSON.stringify({
      name:     PLAN_NAME,
      amount:   PLAN_AMOUNT,
      interval: PLAN_INTERVAL,
      currency: 'ZAR'
    })
  })
  const createData = await createRes.json()
  if (!createData.status || !createData.data?.plan_code) {
    throw new Error(createData.message || 'Failed to create Paystack plan')
  }
  return createData.data.plan_code
}

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

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* empty body is fine */ }

  // ── Activate: called after successful Paystack callback ────────────────────
  if (body.reference) {
    const { reference } = body

    // Verify the transaction with Paystack
    let paystackData
    try {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      )
      paystackData = await verifyRes.json()
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Paystack unreachable' }) }
    }

    if (!paystackData.status || paystackData.data?.status !== 'success') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Payment verification failed' })
      }
    }

    // Update profile: mark subscription active
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        subscription_status: 'active',
        subscription_tier:   'budget_coach'
      })
      .eq('id', user.id)

    if (updateError) {
      return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) }
    }

    // Record the booking
    await adminClient.from('bookings').insert({
      user_id:     user.id,
      tier:        'budget-coach',
      amount:      PLAN_AMOUNT,
      payment_ref: reference,
      status:      'paid'
    }).maybeSingle()   // ignore duplicate-reference errors silently

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    }
  }

  // ── Get plan code for the frontend ─────────────────────────────────────────
  let planCode
  try {
    planCode = await getOrCreatePlan()
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planCode, email: user.email })
  }
}
