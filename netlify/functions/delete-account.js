/**
 * netlify/functions/delete-account.js
 * Permanently delete a user account and all associated data.
 *
 * POST { confirmation: 'DELETE' }
 *   → cascades through:
 *     1. transactions (all)
 *     2. categorization_rules (all)
 *     3. ai_usage (all)
 *     4. budget_chat_usage (all)
 *     5. bookings (all)
 *     6. consultant_access (all)
 *     7. subscription_events (all)
 *     8. profiles row
 *     9. auth.users entry (final — cannot be undone)
 *
 * Auth: Bearer token required.
 * This operation is IRREVERSIBLE.
 */

import { createClient } from '@supabase/supabase-js'

async function getUser(anonClient, token) {
  const { data: { user }, error } = await anonClient.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')
  return user
}

export async function handler(event) {
  try {
    return await _handler(event)
  } catch (err) {
    console.error('[delete-account] error:', err.message)
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

  // Require explicit confirmation string
  if (body.confirmation !== 'DELETE') {
    return { statusCode: 400, body: JSON.stringify({ error: 'confirmation must equal "DELETE"' }) }
  }

  // Fetch profile to check for active paid subscription
  const { data: profile } = await adminClient
    .from('profiles')
    .select('subscription_plan, paystack_sub_code')
    .eq('id', user.id)
    .single()

  // If user has active paid subscription, cancel it with Paystack first
  if (profile?.paystack_sub_code && profile?.subscription_plan !== 'free') {
    try {
      const detailRes = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(profile.paystack_sub_code)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      })
      const detail = await detailRes.json()
      const emailToken = detail?.data?.email_token
      if (emailToken) {
        await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
          body: JSON.stringify({ code: profile.paystack_sub_code, token: emailToken }),
        })
      }
    } catch (err) {
      console.error('[delete-account] Paystack cancel error (non-fatal):', err.message)
    }
  }

  // ── Delete all user data in order ─────────────────────────────────────────
  const tables = [
    'transactions',
    'categorization_rules',
    'ai_usage',
    'budget_chat_usage',
    'bookings',
    'consultant_access',
    'subscription_events',
    'user_preferences',
  ]

  for (const table of tables) {
    const { error } = await adminClient.from(table).delete().eq('user_id', user.id)
    if (error) {
      // Log but don't fail — some tables may not have rows or may not exist yet
      console.warn(`[delete-account] Could not delete from ${table}:`, error.message)
    }
  }

  // Delete profiles row
  const { error: profileErr } = await adminClient.from('profiles').delete().eq('id', user.id)
  if (profileErr) console.warn('[delete-account] Could not delete profile:', profileErr.message)

  // Finally: delete auth user — this is the point of no return
  const { error: authErr } = await adminClient.auth.admin.deleteUser(user.id)
  if (authErr) {
    console.error('[delete-account] Auth user deletion failed:', authErr.message)
    throw new Error(`Account deletion incomplete: ${authErr.message}`)
  }

  console.log(`[delete-account] Account deleted: ${user.id}`)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message: 'Account deleted' }),
  }
}
