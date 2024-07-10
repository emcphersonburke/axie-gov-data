export type NftTransfer = {
  transaction_id: string
  id: number
  type: string
}

export type Transaction = {
  transaction_id: string
  timestamp: string
  block: number
  type: string
  axs_fee: string
  weth_fee: string
  gas_used: number
  gas_price: number
}
