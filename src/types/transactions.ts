export type GatewayTransaction = {
  transaction_id: string
  block: number
  amount: string
  type: string
  address: string
}

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
}
