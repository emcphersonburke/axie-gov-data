import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

type Data = {
  axsTotal: number
  wethTotal: number
}

export async function GET() {
  try {
    // Query the view for treasury totals
    const { data, error } = await supabase
      .from('treasury_totals')
      .select('axs_total, weth_total')
      .single() // Expect a single row

    if (error || !data) {
      throw new Error(error?.message || 'No data found')
    }

    const { axs_total: axsTotal, weth_total: wethTotal } = data

    const responseData: Data = { axsTotal, wethTotal }
    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error fetching treasury totals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch treasury totals' },
      { status: 500 },
    )
  }
}
