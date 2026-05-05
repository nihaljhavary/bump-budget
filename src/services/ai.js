import { supabase } from '../supabase'

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

export async function parseTransaction(message) {
  const token = await getToken()
  const res = await fetch('/.netlify/functions/parse-transaction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ description: message })
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Monthly AI limit reached. Upgrade to Budget Coach for 500 calls/month.')
  }
  if (!res.ok) throw new Error('Parse request failed')
  return res.json()
}

export async function analyseSpending(transactions, _budgets, _income) {
  const token = await getToken()
  const res = await fetch('/.netlify/functions/analyse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ transactions, question: '' })
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Monthly AI limit reached. Upgrade to Budget Coach for 500 calls/month.')
  }
  if (!res.ok) throw new Error('Analysis request failed')
  return res.json()
}
