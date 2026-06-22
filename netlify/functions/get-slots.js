import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

// Public endpoint — returns taken slot times for a given date (no PII returned)
export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const date = event.queryStringParameters?.date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'date query param required (YYYY-MM-DD)' })
    }
  }

  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const TAKEN_STATUSES = ['pending_eft', 'paid', 'confirmed', 'completed']

  let takenSlots = []

  try {
    const { data, error } = await adminClient
      .from('bookings')
      .select('booking_time')
      .eq('booking_date', date)
      .in('status', TAKEN_STATUSES)

    if (error) {
      // booking_date column not yet created — return empty (all slots available)
      if (error.message?.includes('booking_date') || error.message?.includes('schema cache')) {
        console.warn('get-slots: booking_date column not found — returning empty')
      } else {
        console.error('get-slots error:', error.message)
      }
    } else {
      takenSlots = (data || []).map(r => r.booking_time).filter(Boolean)
    }
  } catch (err) {
    console.error('get-slots unexpected error:', err.message)
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache',
    },
    body: JSON.stringify({ takenSlots })
  }
}
