export interface ChartData {
  date: string
  [key: string]: number | string
}

export interface ChartTransaction {
  date: string
  type: string
  axs_fee: number
  weth_fee: number
  nft_type: string
}
