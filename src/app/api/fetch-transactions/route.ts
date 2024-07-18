import { NextRequest, NextResponse } from 'next/server'

import { fetchTransactions } from '~/utils/fetchTransactions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupBy = searchParams.get('groupBy')
  const startDate = searchParams.get('startDate') || '2024-06-16'
  const endDate = '2024-06-17'

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
      endDate,
    )
    return NextResponse.json({
      transactions,
      cumulativeTotals,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
