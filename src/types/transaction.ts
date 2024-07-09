export type NftTransfer = {
  transaction_id: string
  id: string
  type: string
}

export type Transaction = {
  transaction_id: string
  timestamp: string
  block: number
  source: string
  axs_fee: number
  weth_fee: number
  gas_used: number
  gas_price: number
  nft_id?: string
  nft_type?: string
}
