import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

function genRef() {
  return 'BUMP-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

async function sendEmail({ reference, bookingDate, bookingTime, fullName, email, phone, goal }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return  // Email not configured — skip silently

  const fmtDate = (d) => {
    if (!d) return d
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }
  const fmtTime = (t) => {
    const [h] = (t || '').split(':').map(Number)
    if (isNaN(h)) return t
    return h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'bump. Bookings <onboarding@resend.dev>',
        to: ['bumpbudgetservice@gmail.com'],
        subject: `New booking ${reference} — ${fmtDate(bookingDate)} at ${fmtTime(bookingTime)}`,
        html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1A1410;">
  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8C7E76;">bump. new booking</p>
  <h2 style="margin:0 0 20px;font-size:22px;color:#C0766B;">${reference}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;white-space:nowrap;vertical-align:top;width:100px;">Date</td>
      <td style="padding:8px 0;font-weight:600;">${fmtDate(bookingDate)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Time</td>
      <td style="padding:8px 0;font-weight:600;">${fmtTime(bookingTime)}</td>
    </tr>
    <tr style="border-top:1px solid #E4DDD6;">
      <td style="padding:12px 12px 8px 0;color:#8C7E76;vertical-align:top;">Name</td>
      <td style="padding:12px 0 8px;">${fullName || '—'}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Email</td>
      <td style="padding:8px 0;">${email || '—'}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Phone</td>
      <td style="padding:8px 0;">${phone}</td>
    </tr>
    <tr style="border-top:1px solid #E4DDD6;">
      <td style="padding:12px 12px 8px 0;color:#8C7E76;vertical-align:top;">Goal</td>
      <td style="padding:12px 0 8px;">${goal}</td>
    </tr>
  </table>
  <div style="margin-top:20px;padding:14px 16px;background:#F8F5F0;border-radius:8px;font-size:13px;color:#8C7E76;">
    Awaiting EFT of <strong style="color:#1A1410;">R500</strong> with reference <strong style="color:#C0766B;">${reference}</strong>
  </div>
</div>`,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.warn('Resend error:', err)
    }
  } catch (err) {
    console.warn('Email notification failed:', err.message)
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.replace('Bearer ', '')

  let phone, goal, bookingDate, bookingTime, fullName, email
  try {
    const body  = JSON.parse(event.body)
    phone       = (body.phone       || '').trim()
    goal        = (body.goal        || '').trim()
    bookingDate = (body.bookingDate || '').trim()
    bookingTime = (body.bookingTime || '').trim()
    fullName    = (body.fullName    || '').trim()
    email       = (body.email       || '').trim()
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  if (!phone) return { statusCode: 400, body: JSON.stringify({ error: 'Phone number is required' }) }
  if (!goal)  return { statusCode: 400, body: JSON.stringify({ error: 'Please describe what you want to work on' }) }
  if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please select a date' }) }
  }
  if (!bookingTime || !/^\d{2}:\d{2}$/.test(bookingTime)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please select a time slot' }) }
  }

  // ── Identify user ─────────────────────────────────────────────────────────
  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // ── Rate limit: one pending booking per user ───────────────────────────────
  const { data: existingBooking } = await adminClient
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending_eft')
    .maybeSingle()

  if (existingBooking) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: 'You already have a pending booking. Complete payment or contact support.' })
    }
  }

  // ── Check slot not already taken (non-fatal if columns missing) ───────────
  const TAKEN_STATUSES = ['pending_eft', 'paid', 'confirmed', 'completed']
  try {
    const { data: slotRows } = await adminClient
      .from('bookings')
      .select('id')
      .eq('booking_date', bookingDate)
      .eq('booking_time', bookingTime)
      .in('status', TAKEN_STATUSES)
      .limit(1)

    if (slotRows && slotRows.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'This slot was just taken. Please select another time.' })
      }
    }
  } catch {
    // booking_date column not yet migrated — skip conflict check
  }

  // ── Create booking ─────────────────────────────────────────────────────────
  const reference  = genRef()
  const paymentRef = `${reference} | ${bookingDate} ${bookingTime} | ph:${phone.substring(0, 20)} | goal:${goal.substring(0, 200)}`

  const fullPayload = {
    user_id:      user.id,
    tier:         'consult_eft_60',
    amount:       50000,
    payment_ref:  paymentRef,
    status:       'pending_eft',
    booking_date: bookingDate,
    booking_time: bookingTime,
  }
  const corePayload = {
    user_id:     user.id,
    tier:        'consult_eft_60',
    amount:      50000,
    payment_ref: paymentRef,
    status:      'pending_eft',
  }

  let booking, bookingError
  ;({ data: booking, error: bookingError } = await adminClient
    .from('bookings').insert(fullPayload).select().single())

  if (bookingError && (bookingError.message?.includes('booking_date') || bookingError.message?.includes('schema cache'))) {
    console.warn('book-consult: booking_date column missing — falling back')
    ;({ data: booking, error: bookingError } = await adminClient
      .from('bookings').insert(corePayload).select().single())
  }

  if (bookingError) {
    console.error('Booking insert error:', bookingError.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create booking. Please try again.' }) }
  }

  // ── Email notification (awaited so Lambda doesn't kill it before it sends) ──
  await sendEmail({ reference, bookingDate, bookingTime, fullName, email, phone, goal })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, bookingId: booking.id, reference })
  }
}
