// app/api/fetch-transactions/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { ChartTransaction } from '~/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupBy = searchParams.get('groupBy')
  let view

  if (groupBy === 'daily') {
    view = 'daily_aggregated_transactions'
  } else if (groupBy === 'weekly') {
    view = 'weekly_aggregated_transactions'
  } else if (groupBy === 'monthly') {
    view = 'monthly_aggregated_transactions'
  } else {
    return NextResponse.json(
      { error: 'Invalid groupBy parameter' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.from(view).select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as ChartTransaction[])
}
