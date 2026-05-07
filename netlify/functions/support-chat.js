import { createClient } from '@supabase/supabase-js'

const FORMAT_RULES = `Format rules: Never use em dashes (—). Never use the tilde symbol (~). Never use markdown bold (**text**). Write in plain prose.`

const SYSTEM_PROMPT = `You are bump.'s friendly support assistant. Help users with questions about using bump. — features, how to import transactions, subscription plans, how to read their analytics, and general app guidance. Be warm, concise, and practical. If a question is clearly about personal finance (not the app), answer briefly but keep focus on helping them use bump. effectively.

${FORMAT_RULES}`

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { question, conversationHistory = [] } = body
  if (!question || typeof question !== 'string' || question.length > 1000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid question' }) }
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  const token = authHeader.slice(7)

  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }

  const messages = [
    ...conversationHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question }
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system: SYSTEM_PROMPT, messages })
    })
    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Sorry, I could not process that. Please try again.'
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) }
  } catch {
    return { statusCode: 500, body: JSON.stringify({ reply: 'Support is temporarily unavailable. Please try again shortly.' }) }
  }
}
