import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

// Generates a short uppercase alphanumeric reference: BUMP-A3F7C2
function genRef() {
  return 'BUMP-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.replace('Bearer ', '')

  // ── Parse body ─────────────────────────────────────────────────────────────
  let phone, preferredTime, goal
  try {
    const body = JSON.parse(event.body)
    phone         = (body.phone         || '').trim()
    preferredTime = (body.preferredTime || '').trim()
    goal          = (body.goal          || '').trim()
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  if (!phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Phone number is required' }) }
  }
  if (!goal) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please describe what you want to work on' }) }
  }

  // ── Identify user ──────────────────────────────────────────────────────────
  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // ── Rate limit: one pending booking at a time ───────────────────────────────
  const { data: existingBooking } = await adminClient
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending_eft')
    .maybeSingle()

  if (existingBooking) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: 'You already have a pending booking. Please complete payment or contact support.' })
    }
  }

  // ── Create booking ─────────────────────────────────────────────────────────
  const reference = genRef()

  // Store goal + preferred time in payment_ref alongside the reference
  // Format: BUMP-XXXXXX | phone | preferred_time | goal (trimmed to 500 chars)
  const paymentRef = [
    reference,
    `ph:${phone.substring(0, 20)}`,
    `time:${preferredTime.substring(0, 60)}`,
    `goal:${goal.substring(0, 300)}`,
  ].join(' | ')

  const { data: booking, error: bookingError } = await adminClient
    .from('bookings')
    .insert({
      user_id:     user.id,
      tier:        'consult_eft_60',
      amount:      50000,          // R500 in cents
      payment_ref: paymentRef,
      status:      'pending_eft',
    })
    .select()
    .single()

  if (bookingError) {
    console.error('Booking insert error:', bookingError.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create booking. Please try again.' }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, bookingId: booking.id, reference })
  }
}
