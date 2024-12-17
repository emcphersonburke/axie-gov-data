import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

import { ChartTransaction } from '~/types'

export const fetchTransactions = async (
  groupBy: string,
  startDate: string,
  dataType: 'line' | 'pie', // Specify the type of data needed
) => {
  let view: string

  if (dataType === 'pie') {
    // Use pie chart views
    switch (groupBy) {
      case '1h':
        view = 'aggregated_transactions_24h'
        break
      case '8h':
        view = 'aggregated_transactions_7d'
        break
      case 'daily':
        view = 'aggregated_transactions_30d'
        break
      case 'weekly':
        view = 'aggregated_transactions_6m'
        break
      case 'monthly':
        view = 'aggregated_transactions_1y'
        break
      default:
        view = 'aggregated_transactions_all'
    }
  } else {
    // Use line chart views
    switch (groupBy) {
      case '1h':
        view = 'aggregated_fees_24h'
        break
      case '8h':
        view = 'aggregated_fees_7d'
        break
      case 'daily':
        view = 'aggregated_fees_30d'
        break
      case 'weekly':
        view = 'aggregated_fees_6m'
        break
      case 'monthly':
        view = 'aggregated_fees_1y'
        break
      default:
        view = 'aggregated_fees_all'
    }
  }

  const query = supabase.from(view).select('*')

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // Fetch cumulative totals before the start date for line charts
  const cumulativeTotals =
    dataType === 'line'
      ? await getCumulativeTotals(startDate)
      : { axs: 0, weth: 0 }

  return {
    transactions: data.map((transaction, index) => ({
      ...transaction,
      index,
    })) as ChartTransaction[],
    cumulativeTotals,
  }
}

const getCumulativeTotals = async (startDate: string) => {
  const { data: preWindowData, error: preWindowError } = await supabase.rpc(
    'get_cumulative_totals',
    { end_date: new Date(startDate).toISOString().split('T')[0] },
  )

  if (preWindowError) {
    throw new Error(preWindowError.message)
  }

  return preWindowData && preWindowData.length > 0
    ? {
        axs: parseFloat(preWindowData[0].total_axs),
        weth: parseFloat(preWindowData[0].total_weth),
      }
    : { axs: 0, weth: 0 }
}
