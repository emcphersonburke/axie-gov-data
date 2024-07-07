import { createClient } from '@supabase/supabase-js'

import { Transaction } from '~/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const insertTransaction = async (transaction: Transaction) => {
  const { data, error } = await supabase
    .from('transactions')
    .insert([transaction])

  if (error) {
    console.error('Error inserting transaction:', error)
  } else {
    console.log('Transaction inserted:', data)
  }
}
