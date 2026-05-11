// Temporary diagnostic — DELETE after debugging
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  const results = {}
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  // 1. Check env vars
  results.env = {
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
    hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
  }

  // 2. Test Supabase auth (only if token provided)
  if (token) {
    const t1 = Date.now()
    try {
      const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
      const { data: { user }, error } = await client.auth.getUser(token)
      results.supabase_auth = { elapsed_ms: Date.now() - t1, user_id: user?.id, error: error?.message }
    } catch (e) {
      results.supabase_auth = { elapsed_ms: Date.now() - t1, error: e.message }
    }
  } else {
    results.supabase_auth = 'no token — call from the app, not directly in browser'
  }

  // 3. Test Anthropic (quick)
  const t2 = Date.now()
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: controller.signal,
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const data = await res.json()
    results.anthropic = { elapsed_ms: Date.now() - t2, status: res.status, ok: res.ok, error: data.error?.message }
  } catch (e) {
    results.anthropic = { elapsed_ms: Date.now() - t2, error: e.name + ': ' + e.message }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results, null, 2) }
}
