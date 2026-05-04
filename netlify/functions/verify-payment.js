export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { reference } = JSON.parse(event.body)

  if (!reference) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing reference' }) }
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
        success: true,
        amount: data.data.amount,        // in cents
        email:  data.data.customer.email,
        reference: data.data.reference
      })
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
