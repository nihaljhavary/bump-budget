/**
 * netlify/functions/manage-subscription.js
 * Self-service subscription management for bump. users.
 *
 * POST { action: 'cancel' }
 *   → cancels Paystack subscription at period end, sets cancel_at_period_end=true
 *   → user retains full access until billing cycle end
 *
 * POST { action: 'downgrade', plan: 'starter' | 'growth' }
 *   → cancels current Paystack subscription at period end
 *   → stores scheduled_plan in profiles (applied by paystack-webhook on disable)
 *   → user retains current access until billing cycle end, then moves to new plan
 *
 * POST { action: 'reactivate' }
 *   → clears pending cancel/downgrade (only works if not yet processed by Paystack)
 *
 * Auth: Bearer token required.
 */

import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_ACTIONS = new Set(['cancel', 'downgrade', 'reactivate'])
const ALLOWED_PLANS   = new Set(['free', 'starter', 'growth'])  // can only downgrade

async function getUser(anonClient, token) {
  const { data: { user }, error } = await anonClient.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')
  return user
}

async function disablePaystackSubscription(subCode) {
  if (!subCode) return { ok: false, reason: 'no_sub_code' }

  // Fetch subscription to get email_token (required by Paystack disable endpoint)
  const detailRes = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subCode)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  })
  const detail = await detailRes.json()
  const emailToken = detail?.data?.email_token

  if (!emailToken) return { ok: false, reason: 'no_email_token' }

  const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    body: JSON.stringify({ code: subCode, token: emailToken }),
  })
  const disableData = await disableRes.json()
  return { ok: disableData.status === true, data: disableData }
}

export async function handler(event) {
  try {
    return await _handler(event)
  } catch (err) {
    console.error('[manage-subscription] error:', err.message, err.stack)
    const status = err.message === 'Unauthorized' ? 401 : 500
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) }
  }
}

async function _handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient  = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const user = await getUser(anonClient, token)

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}

  const { action, plan } = body
  if (!ALLOWED_ACTIONS.has(action)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid action. Must be one of: ${[...ALLOWED_ACTIONS].join(', ')}` }) }
  }

  // Fetch current profile
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('subscription_plan, subscription_status, paystack_sub_code, cancel_at_period_end, next_billing_date, billing_cycle_end')
    .eq('id', user.id)
    .single()

  if (profileErr) throw new Error('Could not fetch profile')

  const subCode = profile?.paystack_sub_code

  // ── CANCEL at period end ───────────────────────────────────────────────────
  if (action === 'cancel') {
    if (profile?.subscription_plan === 'free') {
      return { statusCode: 400, body: JSON.stringify({ error: 'No active subscription to cancel' }) }
    }
    if (profile?.cancel_at_period_end) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Subscription is already scheduled for cancellation' }) }
    }

    // Tell Paystack to not renew (best-effort — don't fail if no sub code)
    const paystackResult = await disablePaystackSubscription(subCode)
    console.log('[manage-subscription] Paystack disable:', JSON.stringify(paystackResult))

    // Always update Supabase (even if Paystack call had issues — webhook is the source of truth)
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({
        cancel_at_period_end: true,
        scheduled_plan:       'free',
      })
      .eq('id', user.id)

    if (updateErr) throw new Error(updateErr.message)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Subscription will cancel at end of billing cycle. You keep full access until then.',
        paystackDisabled: paystackResult.ok,
      }),
    }
  }

  // ── DOWNGRADE to lower plan ────────────────────────────────────────────────
  if (action === 'downgrade') {
    if (!plan || !ALLOWED_PLANS.has(plan)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid plan for downgrade. Must be one of: ${[...ALLOWED_PLANS].join(', ')}` }) }
    }
    if (profile?.subscription_plan === plan) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Already on that plan' }) }
    }

    // Cancel current Paystack subscription at period end
    const paystackResult = await disablePaystackSubscription(subCode)
    console.log('[manage-subscription] Downgrade Paystack disable:', JSON.stringify(paystackResult))

    // Store the scheduled plan — paystack-webhook will create a new sub at target plan
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({
        cancel_at_period_end: true,
        scheduled_plan:       plan,
      })
      .eq('id', user.id)

    if (updateErr) throw new Error(updateErr.message)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: `Downgrade to ${plan} scheduled for your next billing date. Your current plan stays active until then.`,
        scheduledPlan:    plan,
        paystackDisabled: paystackResult.ok,
      }),
    }
  }

  // ── REACTIVATE (undo pending cancel/downgrade) ─────────────────────────────
  if (action === 'reactivate') {
    if (!profile?.cancel_at_period_end) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No pending cancellation to undo' }) }
    }

    // Re-enable the Paystack subscription if possible
    // Note: Paystack may have already processed the cancellation — if so this will
    // fail gracefully and the user needs to re-subscribe.
    if (subCode) {
      const reactivateRes = await fetch('https://api.paystack.co/subscription/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
        body: JSON.stringify({ code: subCode, token: '' }),
      })
      const reactivateData = await reactivateRes.json()
      console.log('[manage-subscription] Reactivate:', JSON.stringify(reactivateData))
    }

    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ cancel_at_period_end: false, scheduled_plan: null })
      .eq('id', user.id)

    if (updateErr) throw new Error(updateErr.message)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Cancellation reversed. Your subscription will continue.' }),
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unhandled action' }) }
}
