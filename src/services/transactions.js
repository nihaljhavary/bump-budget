import { supabase } from '../supabase'

// Categories excluded from spend analytics (not lifestyle spend)
export const EXCLUDED_FROM_SPEND = new Set(['Income', 'Transfer'])

// Returns true if the transaction should count as spending
export function isSpendTransaction(txn) {
  return !EXCLUDED_FROM_SPEND.has(txn?.category)
}

// Fetch all transactions for the current month for a user
export async function fetchTransactions(userId) {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', firstOfMonth)
    .lte('date', lastOfMonth)
    .order('date', { ascending: false })

  if (error) throw error
  return data
}

// Fetch transactions for a specific month (YYYY-MM)
export async function fetchTransactionsByMonth(userId, month) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1).toISOString().split('T')[0]
  const last  = new Date(y, m, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', first)
    .lte('date', last)
    .order('date', { ascending: false })

  if (error) throw error
  return data
}

// Fetch last N months of transactions for trend data
export async function fetchRecentMonths(userId, months = 6) {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const fromDate = from.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('date, amount, category, name')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .order('date', { ascending: true })

  if (error) throw error
  return data
}

// Fetch transactions for an arbitrary date range
export async function fetchTransactionsByRange(userId, fromDate, toDate) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true })

  if (error) throw error
  return data
}

// Add a new transaction
export async function addTransaction(userId, { name, amount, category, date }) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      name,
      amount,
      category,
      date: date || new Date().toISOString().split('T')[0]
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Update an existing transaction (e.g. recategorise)
export async function updateTransaction(id, updates) {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Reclassify all of a user's transactions matching a merchant pattern
// Used when user creates a recategorisation rule and wants to apply it to history
export async function recategorizeMatchingTransactions(userId, merchantPattern, newCategory) {
  if (!merchantPattern || !newCategory) return { count: 0 }
  const lower = merchantPattern.toLowerCase()

  // Fetch all user transactions (we do client-side matching to use includes())
  const { data: all, error } = await supabase
    .from('transactions')
    .select('id, name')
    .eq('user_id', userId)

  if (error) throw error

  const matching = (all || []).filter(t =>
    t.name && t.name.toLowerCase().includes(lower)
  ).map(t => t.id)

  if (matching.length === 0) return { count: 0 }

  const { error: updErr } = await supabase
    .from('transactions')
    .update({ category: newCategory })
    .in('id', matching)

  if (updErr) throw updErr
  return { count: matching.length }
}

// Delete a transaction by id
export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)

  if (error) throw error
}
