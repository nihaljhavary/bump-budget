import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

function genRef(type) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  return type === 'property' ? `BUMP-PROP-${code}` : `BUMP-BDG-${code}`
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(d) {
  if (!d) return d
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(t) {
  const [h] = (t || '').split(':').map(Number)
  if (isNaN(h)) return t
  return h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`
}

async function sendEmail({ reference, type, bookingDate, bookingTime, name, email, phone, extraRows }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const typeLabel = type === 'property' ? 'Property Financial Analysis' : 'Budget Consultation'
  const amount    = type === 'property' ? 'R650' : 'R500'

  const extraHtml = extraRows
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<tr><td style="padding:8px 12px 8px 0;color:#8C7E76;white-space:nowrap;vertical-align:top;width:130px;">${esc(k)}</td>`
      + `<td style="padding:8px 0;">${esc(v)}</td></tr>`
    )
    .join('')

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'bump. Bookings <onboarding@resend.dev>',
        to: ['bumpbudgetservice@gmail.com'],
        subject: `New ${typeLabel} ${reference} — ${fmtDate(bookingDate)} at ${fmtTime(bookingTime)}`,
        html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1A1410;">
  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8C7E76;">
    bump. booking — ${esc(typeLabel)}
  </p>
  <h2 style="margin:0 0 24px;font-size:22px;color:#C0766B;">${reference}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;white-space:nowrap;vertical-align:top;width:130px;">Date</td>
      <td style="padding:8px 0;font-weight:600;">${fmtDate(bookingDate)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Time</td>
      <td style="padding:8px 0;font-weight:600;">${fmtTime(bookingTime)}</td>
    </tr>
    <tr style="border-top:1px solid #E4DDD6;">
      <td style="padding:12px 12px 8px 0;color:#8C7E76;vertical-align:top;">Name</td>
      <td style="padding:12px 0 8px;">${esc(name)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Email</td>
      <td style="padding:8px 0;">${esc(email)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:#8C7E76;vertical-align:top;">Phone</td>
      <td style="padding:8px 0;">${esc(phone)}</td>
    </tr>
    ${extraHtml ? `<tr style="border-top:1px solid #E4DDD6;">${extraHtml}</tr>` : ''}
  </table>
  <div style="margin-top:24px;padding:14px 16px;background:#F8F5F0;border-radius:8px;font-size:13px;color:#8C7E76;">
    Awaiting EFT of <strong style="color:#1A1410;">${amount}</strong>
    with reference <strong style="color:#C0766B;">${reference}</strong>
  </div>
</div>`,
      }),
    })
    if (!res.ok) console.warn('[book-public] Resend error:', await res.text())
  } catch (err) {
    console.warn('[book-public] email failed:', err.message)
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) } }

  const {
    name, email, phone, consultType, bookingDate, bookingTime,
    goal, address, askingPrice, suburb, propertyType,
    listingLink, erfNumber, sectionalTitleNumber, notes, docsPending,
  } = body

  // Required field validation
  if (!name || !email || !phone || !consultType || !bookingDate || !bookingTime) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) }
  }
  if (!['budget', 'property'].includes(consultType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid consultation type' }) }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid date' }) }
  }
  if (!/^\d{2}:\d{2}$/.test(bookingTime)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid time' }) }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) }
  }
  if (String(name).length > 200 || String(email).length > 200 || String(phone).length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Input too long' }) }
  }

  const amountCents = consultType === 'property' ? 65000 : 50000
  const reference   = genRef(consultType)
  const tier        = consultType === 'property' ? 'property_analysis' : 'budget_consult'

  // Best-effort DB insert — gracefully degraded if user_id is required or schema differs
  try {
    const adminClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const TAKEN_STATUSES = ['pending_eft', 'paid', 'confirmed', 'completed']
    // Non-fatal slot-conflict check
    try {
      const { data: clash } = await adminClient
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .eq('booking_time', bookingTime)
        .in('status', TAKEN_STATUSES)
        .limit(1)
      if (clash && clash.length > 0) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'This slot was just taken. Please choose another time.' }),
        }
      }
    } catch {
      // booking_date column may not exist — skip conflict check
    }

    // Property/booking details stored as JSONB for admin visibility
    const details = consultType === 'property'
      ? {
          propertyType:         propertyType || null,
          address:              address || null,
          suburb:               suburb || null,
          askingPrice:          askingPrice || null,
          listingLink:          listingLink || null,
          erfNumber:            erfNumber || null,
          sectionalTitleNumber: sectionalTitleNumber || null,
          notes:                notes || null,
          docsPending:          !!docsPending,
        }
      : { goal: goal || null }

    // Try full insert with contact + details columns
    const fullRow = {
      tier,
      amount:       amountCents,
      payment_ref:  reference,
      status:       'pending_eft',
      booking_date: bookingDate,
      booking_time: bookingTime,
      name:         String(name).slice(0, 200),
      email:        String(email).slice(0, 200),
      phone:        String(phone).slice(0, 50),
      details,
    }
    const { error: insertErr } = await adminClient.from('bookings').insert(fullRow)
    if (insertErr) {
      const msg = insertErr.message || ''
      const OPTIONAL_COLS = ['name', 'email', 'phone', 'details', 'booking_date', 'booking_time']
      if (OPTIONAL_COLS.some(c => msg.includes(c)) || msg.includes('schema cache')) {
        // Retry without contact/details columns (migration not yet run)
        const { error: retryErr } = await adminClient.from('bookings').insert({
          tier, amount: amountCents, payment_ref: reference, status: 'pending_eft',
          booking_date: bookingDate, booking_time: bookingTime,
        })
        if (retryErr && (retryErr.message?.includes('booking_date') || retryErr.message?.includes('schema cache'))) {
          await adminClient.from('bookings').insert({ tier, amount: amountCents, payment_ref: reference, status: 'pending_eft' })
        }
      } else {
        console.warn('[book-public] DB insert warning:', insertErr.message)
      }
    }
  } catch (err) {
    // user_id NOT NULL or other constraint — email notification is what matters, continue
    console.warn('[book-public] DB insert skipped:', err.message)
  }

  // Extra detail rows for email
  const extraRows = consultType === 'property'
    ? [
        ['Property type', propertyType],
        ['Address', address],
        ['Suburb / City', suburb],
        ['Asking price', askingPrice],
        ['ERF number', erfNumber],
        ['Sectional title', sectionalTitleNumber],
        ['Listing link', listingLink],
        ['Notes', notes],
        ['Docs outstanding', docsPending ? 'YES — client will email documents with proof of payment' : ''],
      ]
    : [['Goal', goal]]

  await sendEmail({ reference, type: consultType, bookingDate, bookingTime, name, email, phone, extraRows })

  return {
    statusCode:  200,
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ success: true, reference }),
  }
}
