/**
 * Paystack Webhook Handler
 * Receives all Paystack events and keeps Supabase profiles in sync.
 *
 * Set this URL in Paystack Dashboard → Settings → API Keys & Webhooks:
 *   https://bump-budget.netlify.app/.netlify/functions/paystack-webhook
 *
 * Events handled:
 *   charge.success           → subscription payment received, extend billing date
 *   subscription.create      → new subscription activated
 *   subscription.disable     → subscription cancelled, downgrade to free
 *   invoice.payment_failed   → payment failed, downgrade to free
 *   subscription.not_renew   → scheduled not to renew (pre-warning)
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const PAYSTACK_PLAN_MAP = {
  // Map Paystack plan codes → bump. plan names
  // These are populated when create-subscription.js creates the plans
  // You can also hardcode them after first run: PLN_xxx → 'starter' etc.
}

// Map Paystack plan names to our internal plan keys
function planFromPaystack(planName = '', planCode = '') {
  const name = planName.toLowerCase()
  if (name.includes('starter') || name.includes('r49')) return 'starter'
  if (name.includes('growth')  || name.includes('r99')) return 'growth'
  if (name.includes('pro')     || name.includes('r199')) return 'pro'
  return PAYSTACK_PLAN_MAP[planCode] || 'free'
}

function verifySignature(body, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  const hash = crypto.createHmac('sha512', secret).update(body).digest('hex')
  return hash === signature
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── Verify Paystack signature ──────────────────────────────────────────────
  const signature = event.headers['x-paystack-signature']
  if (!verifySignature(event.body, signature)) {
    console.error('Invalid Paystack signature')
    return { statusCode: 401, body: 'Invalid signature' }
  }

  const payload = JSON.parse(event.body)
  const { event: eventType, data } = payload

  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // ── Find user by email ─────────────────────────────────────────────────────
  const customerEmail = data?.customer?.email
  if (!customerEmail) {
    return { statusCode: 200, body: 'No customer email, skipping' }
  }

  const { data: { users } } = await adminClient.auth.admin.listUsers()
  const authUser = users?.find(u => u.email === customerEmail)

  if (!authUser) {
    console.log(`No user found for email: ${customerEmail}`)
    return { statusCode: 200, body: 'User not found, skipping' }
  }

  const userId = authUser.id
  const planCode = data?.plan?.plan_code || data?.plan_code || ''
  const planName = data?.plan?.name || ''
  const plan = planFromPaystack(planName, planCode)
  const subCode = data?.subscription_code || data?.data?.subscription_code || null
  const custCode = data?.customer?.customer_code || null
  const reference = data?.reference || null
  const amount = data?.amount || 0

  // Log the event
  await adminClient.from('subscription_events').insert({
    user_id:      userId,
    event_type:   eventType,
    plan,
    paystack_ref: reference,
    amount,
    raw_payload:  payload,
  }).maybeSingle()

  // ── Handle each event type ─────────────────────────────────────────────────
  switch (eventType) {

    case 'subscription.create': {
      // New subscription — activate immediately
      const nextDate = data?.next_payment_date
        ? new Date(data.next_payment_date).toISOString()
        : null

      await adminClient.from('profiles').update({
        subscription_plan:   plan,
        subscription_status: 'active',
        paystack_sub_code:   subCode,
        paystack_cust_code:  custCode,
        next_billing_date:   nextDate,
      }).eq('id', userId)
      break
    }

    case 'charge.success': {
      // Recurring payment received — keep active, update billing date
      const nextDate = data?.paid_at
        ? new Date(new Date(data.paid_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null

      await adminClient.from('profiles').update({
        subscription_status: 'active',
        subscription_plan:   plan || undefined,
        next_billing_date:   nextDate,
      }).eq('id', userId)
      break
    }

    case 'invoice.payment_failed': {
      // Payment failed — downgrade to free
      await adminClient.from('profiles').update({
        subscription_status: 'payment_failed',
        subscription_plan:   'free',
      }).eq('id', userId)
      break
    }

    case 'subscription.disable':
    case 'subscription.not_renew': {
      // Cancelled or not renewing — downgrade to free
      await adminClient.from('profiles').update({
        subscription_status: 'cancelled',
        subscription_plan:   'free',
        paystack_sub_code:   null,
        next_billing_date:   null,
      }).eq('id', userId)
      break
    }

    default:
      // Unhandled event — logged above, no action needed
      break
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
