export type Transaction = {
  transaction_id: string
  timestamp: string
  block: number
  type: string
  axs_fee: number
  slp_fee: number
  gas_used: number
  gas_price: number
}
