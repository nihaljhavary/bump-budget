// Temporary diagnostic — tests Anthropic connectivity with no auth overhead
// DELETE THIS after debugging
export async function handler(event) {
  const start = Date.now()
  const key = process.env.ANTHROPIC_API_KEY

  const controller = new AbortController()
  setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'x-api-key': key || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'say hi' }],
      }),
    })
    const data = await res.json()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elapsed_ms: Date.now() - start,
        anthropic_status: res.status,
        key_present: !!key,
        key_prefix: key ? key.slice(0, 15) + '...' : null,
        response: data,
      }),
    }
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elapsed_ms: Date.now() - start,
        error_name: e.name,
        error_msg: e.message,
        key_present: !!key,
      }),
    }
  }
}
