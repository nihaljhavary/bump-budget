import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // Verify caller is authenticated
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.replace('Bearer ', '')

  const { reference, tier, amount } = JSON.parse(event.body)

  // ── 1. Verify Paystack payment ──────────────────────────────────────────────
  let paystackData
  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    paystackData = await paystackRes.json()
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Paystack unreachable' }) }
  }

  if (!paystackData.status || paystackData.data?.status !== 'success') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Payment verification failed' })
    }
  }

  // ── 2. Identify the authenticated user ────────────────────────────────────
  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  // ── 3. Use service role for writes ────────────────────────────────────────
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Create booking
  const { data: booking, error: bookingError } = await adminClient
    .from('bookings')
    .insert({
      user_id:     user.id,
      tier,
      amount,            // in cents
      payment_ref: reference,
      status:      'paid'
    })
    .select()
    .single()

  if (bookingError) {
    // Unique-constraint violation = reference already used
    if (bookingError.code === '23505') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Booking already exists for this payment' }) }
    }
    return { statusCode: 500, body: JSON.stringify({ error: bookingError.message }) }
  }

  // Create consultant_access request (admin → user) if one doesn't already exist
  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .single()

  if (adminProfile) {
    const { data: existingRequest } = await adminClient
      .from('consultant_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (!existingRequest) {
      await adminClient.from('consultant_access').insert({
        user_id:      user.id,
        requested_by: adminProfile.id,
        status:       'pending'
      })
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, bookingId: booking.id })
  }
}
