import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

import { ChartTransaction } from '~/types'

export const fetchTransactions = async (
  groupBy: string,
  startDate: string,
  endDate: string = '2024-06-17',
) => {
  let view: string
  let interval: string

  switch (groupBy) {
    case '1h':
      view = 'hourly_aggregated_transactions'
      interval = '1 day'
      break
    case '8h':
      view = 'eight_hour_aggregated_transactions'
      interval = '7 days'
      break
    case 'daily':
      view = 'daily_aggregated_transactions'
      interval = '30 days'
      break
    case 'weekly':
      view = 'weekly_aggregated_transactions'
      interval = '1 year'
      break
    case 'monthly':
      view = 'monthly_aggregated_transactions'
      interval = '' // No constraint for 'ALL'
      break
    default:
      throw new Error('Invalid groupBy parameter')
  }

  let query = supabase.from(view).select('*')

  const endDateObj = new Date(endDate)
  const startDateObj = new Date(startDate)

  if (interval) {
    if (groupBy === '1h') {
      startDateObj.setDate(endDateObj.getDate() - 1)
    } else if (groupBy === '8h') {
      startDateObj.setDate(endDateObj.getDate() - 7)
    } else if (groupBy === 'daily') {
      startDateObj.setDate(endDateObj.getDate() - 30)
    } else if (groupBy === 'weekly') {
      startDateObj.setFullYear(endDateObj.getFullYear() - 1)
    }

    query = query
      .gte('date', startDateObj.toISOString().split('T')[0])
      .lte('date', endDateObj.toISOString().split('T')[0])
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // Fetch cumulative totals before the start date using the created function
  const { data: preWindowData, error: preWindowError } = await supabase.rpc(
    'get_cumulative_totals',
    { end_date: startDateObj.toISOString().split('T')[0] },
  )

  if (preWindowError) {
    throw new Error(preWindowError.message)
  }

  const cumulativeTotals =
    preWindowData && preWindowData.length > 0
      ? {
          axs: parseFloat(preWindowData[0].total_axs),
          weth: parseFloat(preWindowData[0].total_weth),
        }
      : { axs: 0, weth: 0 }

  return {
    transactions: data.map((transaction, index) => ({
      ...transaction,
      index,
    })) as ChartTransaction[],
    cumulativeTotals,
  }
}
