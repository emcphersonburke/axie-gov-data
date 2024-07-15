import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { ChartTransaction } from '~/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Opt out of caching for all data requests in the route segment
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupBy = searchParams.get('groupBy')
  let view, interval

  // Use a hard-coded date for testing
  const hardcodedDate = '2024-06-07'

  switch (groupBy) {
    case '30m':
      view = 'thirty_min_aggregated_transactions'
      interval = '1 day'
      break
    case '3h':
      view = 'three_hour_aggregated_transactions'
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
      return NextResponse.json(
        { error: 'Invalid groupBy parameter' },
        { status: 400 },
      )
  }

  let query = supabase.from(view).select('*')

  const endDate = new Date(hardcodedDate)
  const startDate = new Date(endDate)

  if (interval) {
    if (groupBy === '30m') {
      startDate.setDate(endDate.getDate() - 1)
    } else if (groupBy === '3h') {
      startDate.setDate(endDate.getDate() - 7)
    } else if (groupBy === 'daily') {
      startDate.setDate(endDate.getDate() - 30)
    } else if (groupBy === 'weekly') {
      startDate.setFullYear(endDate.getFullYear() - 1)
    }

    query = query
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
  }

  const { data, error } = await query

  if (error) {
    console.log('error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch cumulative totals before the start date using the created function
  const { data: preWindowData, error: preWindowError } = await supabase.rpc(
    'get_cumulative_totals',
    { end_date: startDate.toISOString().split('T')[0] },
  )

  if (preWindowError) {
    console.log('preWindowError', preWindowError)
    return NextResponse.json({ error: preWindowError.message }, { status: 500 })
  }

  const cumulativeTotals =
    preWindowData && preWindowData.length > 0
      ? {
          axs: parseFloat(preWindowData[0].total_axs),
          weth: parseFloat(preWindowData[0].total_weth),
        }
      : { axs: 0, weth: 0 }

  return NextResponse.json({
    transactions: data as ChartTransaction[],
    cumulativeTotals,
  })
}
