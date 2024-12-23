import { NextRequest, NextResponse } from 'next/server'

import { fetchTransactions } from '~/utils/fetchTransactions'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const today = new Date().toISOString().split('T')[0]
  const groupBy = searchParams.get('groupBy')
  const startDate = searchParams.get('startDate') || today
  const dataType = searchParams.get('dataType') || 'line'

  if (!groupBy) {
    return NextResponse.json(
      { error: 'Missing groupBy parameter' },
      { status: 400 },
    )
  }

  try {
    const { transactions, cumulativeTotals } = await fetchTransactions(
      groupBy,
      startDate,
      dataType as 'line' | 'pie',
    )
    return NextResponse.json({
      transactions,
      cumulativeTotals,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
