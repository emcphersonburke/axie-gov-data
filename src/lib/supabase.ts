import { createClient } from '@supabase/supabase-js'

import { Transaction } from '~/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const getMetaValue = async (key: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('meta')
    .select('value')
    .eq('key', key)
    .single()

  if (error) {
    console.error(`Error fetching value for key ${key}:`, error)
    return null
  }

  return data?.value || null
}

export const setMetaValue = async (key: string, value: string) => {
  const { error } = await supabase.from('meta').upsert({ key, value })

  if (error) {
    console.error(`Error setting value for key ${key}:`, error)
  }
}

export const upsertTransaction = async (transaction: Transaction) => {
  const { data, error } = await supabase
    .from('transactions')
    .upsert([transaction], { onConflict: 'transaction_id' })

  if (error) {
    console.error('Error upserting transaction:', error)
  } else {
    console.log('Transaction upserted:', data)
  }
}
