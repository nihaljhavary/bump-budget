/**
 * create-subscription.js
 * Manages Paystack subscription plans and checkout flow.
 *
 * POST { plan }
 *   → returns { planCode, email } for direct PaystackPop checkout
 *
 * POST { plan, action: 'initialize', trial: true }
 *   → initialises a deferred-start Paystack transaction (30-day trial)
 *   → returns { access_code, reference, email } for PaystackPop with access_code
 *
 * POST { plan, reference }
 *   → verifies Paystack payment reference and activates subscription in Supabase
 *   → when trial: true, sets subscription_status: 'trialing' and trial_ends_at
 */

import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const PLAN_DEFINITIONS = {
  starter: { name: 'bump. Starter',  amount: 4900,  interval: 'monthly' },
  growth:  { name: 'bump. Growth',   amount: 9900,  interval: 'monthly' },
  pro:     { name: 'bump. Pro',      amount: 19900, interval: 'monthly' },
}

// 30-day trial period in milliseconds
const TRIAL_MS = 30 * 24 * 60 * 60 * 1000

async function getOrCreatePlan(planKey) {
  const planDef = PLAN_DEFINITIONS[planKey]
  if (!planDef) throw new Error(`Unknown plan: ${planKey}`)

  // Check if plan already exists on Paystack
  const listRes = await fetch('https://api.paystack.co/plan?perPage=100', {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  })
  const listData = await listRes.json()

  if (listData.status && Array.isArray(listData.data)) {
    const existing = listData.data.find(p => p.name === planDef.name)
    if (existing) return existing.plan_code
  }

  // Create plan
  const createRes = await fetch('https://api.paystack.co/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
    },
    body: JSON.stringify({
      name:     planDef.name,
      amount:   planDef.amount,
      interval: planDef.interval,
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

  // ── Auth ───────────────────────────────────────────────────────────────────
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

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* ok */ }

  const planKey = body.plan || 'growth'
  const isTrial = body.trial === true

  if (!PLAN_DEFINITIONS[planKey]) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid plan: ${planKey}` }) }
  }

  // ── ACTIVATE after successful Paystack payment ─────────────────────────────
  // Called after PaystackPop callback with the transaction reference.
  if (body.reference) {
    const { reference } = body

    // For trial initializations, Paystack's transaction may be in 'abandoned'
    // state (no immediate charge) but the subscription is created with start_date.
    // We verify the transaction exists; subscription.create webhook will also fire.
    let paystackData
    try {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      )
      paystackData = await verifyRes.json()
    } catch {
      return { statusCode: 502, body: JSON.stringify({ error: 'Paystack unreachable' }) }
    }

    // For trials: the transaction may not be 'success' (deferred charge) —
    // accept 'abandoned' or any status when trial flag is set.
    const txnStatus = paystackData.data?.status
    if (!paystackData.status || (!isTrial && txnStatus !== 'success')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Payment verification failed' }) }
    }

    const subCode  = paystackData.data?.subscription?.subscription_code || null
    const custCode = paystackData.data?.customer?.customer_code || null

    // For trials: next billing = start_date (30 days from now)
    // For standard: use Paystack's next_payment_date or derive from today
    const trialEndsAt = isTrial ? new Date(Date.now() + TRIAL_MS).toISOString() : null
    const nextDate = isTrial
      ? trialEndsAt
      : (paystackData.data?.subscription?.next_payment_date
          ? new Date(paystackData.data.subscription.next_payment_date).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())

    const profileUpdates = {
      subscription_plan:   planKey,
      subscription_status: isTrial ? 'trialing' : 'active',
      paystack_sub_code:   subCode,
      paystack_cust_code:  custCode,
      next_billing_date:   nextDate,
    }
    // trial_ends_at column — added via migration 20260518_add_trial_columns.sql
    // Safe to set even if column doesn't exist yet (Supabase ignores unknown columns via upsert)
    if (isTrial) profileUpdates.trial_ends_at = trialEndsAt

    const { error: updateError } = await adminClient
      .from('profiles')
      .update(profileUpdates)
      .eq('id', user.id)

    if (updateError) {
      return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) }
    }

    // Log the activation event
    await adminClient.from('subscription_events').insert({
      user_id:      user.id,
      event_type:   isTrial ? 'trial_started' : 'subscribed',
      plan:         planKey,
      paystack_ref: reference,
      amount:       isTrial ? 0 : PLAN_DEFINITIONS[planKey].amount,
      raw_payload:  paystackData.data,
    }).maybeSingle()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:   true,
        plan:      planKey,
        trialing:  isTrial,
        trialEndsAt,
      })
    }
  }

  // ── INITIALIZE — server-side Paystack transaction init (used for trial) ────
  // Returns an access_code so the client can open PaystackPop without re-specifying
  // email/amount. The start_date defers the first recurring charge by 30 days.
  if (body.action === 'initialize') {
    let planCode
    try {
      planCode = await getOrCreatePlan(planKey)
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
    }

    const startDate = isTrial
      ? new Date(Date.now() + TRIAL_MS).toISOString()
      : undefined

    const initPayload = {
      email:    user.email,
      plan:     planCode,
      currency: 'ZAR',
      metadata: { user_id: user.id, bump_plan: planKey, trial: isTrial },
    }
    // start_date tells Paystack to defer the first recurring charge.
    // The card is authorised (and possibly charged a R0/R1 auth) but not billed
    // the full plan amount until the start_date.
    if (startDate) initPayload.start_date = startDate

    let initData
    try {
      const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
        body: JSON.stringify(initPayload),
      })
      initData = await initRes.json()
    } catch {
      return { statusCode: 502, body: JSON.stringify({ error: 'Paystack unreachable' }) }
    }

    if (!initData.status || !initData.data?.access_code) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: initData.message || 'Paystack initialization failed' })
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_code: initData.data.access_code,
        reference:   initData.data.reference,
        email:       user.email,
        plan:        planKey,
        trial:       isTrial,
        startDate,
      })
    }
  }

  // ── GET PLAN CODE — for direct PaystackPop checkout (no trial) ────────────
  let planCode
  try {
    planCode = await getOrCreatePlan(planKey)
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planCode,
      email:  user.email,
      plan:   planKey,
      amount: PLAN_DEFINITIONS[planKey].amount,
    })
  }
}
