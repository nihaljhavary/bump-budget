// Calls the Netlify serverless functions for AI features

export async function parseTransaction(message) {
  const res = await fetch('/.netlify/functions/parse-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  if (!res.ok) throw new Error('Parse request failed')
  return res.json()
}

export async function analyseSpending(transactions, budgets, income) {
  const res = await fetch('/.netlify/functions/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions, budgets, income })
  })
  if (!res.ok) throw new Error('Analysis request failed')
  return res.json()
}
