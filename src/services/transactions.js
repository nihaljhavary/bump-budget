import { supabase } from '../supabase'

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

// Delete a transaction by id
export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)

  if (error) throw error
}
