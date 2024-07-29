// app/api/treasury-totals/route.ts
import { NextResponse } from 'next/server'

type Data = {
  axsTotal: number
  wethTotal: number
}

export async function GET() {
  // Replace the following with your actual logic to get the totals
  const axsTotal = 12345.67
  const wethTotal = 23456.78

  const data: Data = { axsTotal, wethTotal }
  return NextResponse.json(data)
}
