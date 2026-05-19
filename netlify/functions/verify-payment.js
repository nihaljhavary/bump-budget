import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // Auth required — prevents unauthenticated probing of Paystack references
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // Safe JSON parsing
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { reference } = body
  if (!reference || typeof reference !== 'string' || reference.length > 200) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing or invalid reference' }) }
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    const data = await res.json()

    if (!data.status || data.data?.status !== 'success') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: data.message || 'Payment not successful' })
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:   true,
        amount:    data.data.amount,
        email:     data.data.customer?.email,
        reference: data.data.reference
      })
    }
  } catch {
    return {
      statusCode: 502,
      body: JSON.stringify({ success: false, error: 'Payment service unavailable' })
    }
  }
}
