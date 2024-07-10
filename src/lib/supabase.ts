import { createClient } from '@supabase/supabase-js'

import { NftTransfer, Transaction } from '~/types'

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

export const upsertTransaction = async (
  transaction: Transaction,
  nftTransfers: NftTransfer[],
) => {
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .upsert(transaction, { onConflict: 'transaction_id' })

  if (txError) {
    console.error('Error upserting transaction:', txError)
    return
  }

  // Fetch all existing NFT transfers with the same transaction_id
  const { data: existingNftTransfers, error: fetchError } = await supabase
    .from('nft_transfers')
    .select('id')
    .eq('transaction_id', transaction.transaction_id)

  if (fetchError) {
    console.error('Error fetching existing NFT transfers:', fetchError)
    return
  }

  // Filter out NFT transfers that already exist
  console.log('Existing NFT transfers:', existingNftTransfers, nftTransfers)
  const newNftTransfers = nftTransfers.filter(
    (nftTransfer) =>
      !existingNftTransfers.some(
        (existingTransfer) => existingTransfer.id === nftTransfer.id,
      ),
  )

  if (newNftTransfers.length > 0) {
    const { error: nftError } = await supabase
      .from('nft_transfers')
      .insert(newNftTransfers)

    if (nftError) {
      console.error('Error inserting NFT transfers:', nftError)
    } else {
      console.log('Transaction and NFT transfers upserted:', txData)
    }
  } else {
    console.log('No new NFT transfers to insert.')
  }
}
