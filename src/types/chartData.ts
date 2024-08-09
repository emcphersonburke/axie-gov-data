export interface ChartData {
  index?: number
  date?: string
  [key: string]: number | string
}

export interface ChartTransaction {
  date: string
  type: string
  axs_fee: string
  weth_fee: string
  nft_type: string
}
