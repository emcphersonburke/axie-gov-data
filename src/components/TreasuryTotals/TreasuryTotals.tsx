// components/TreasuryTotals/TreasuryTotals.tsx
'use client'

import React, { useEffect, useState } from 'react'

import styles from './TreasuryTotals.module.scss'

type Totals = {
  axsTotal: number
  wethTotal: number
}

type Props = {
  axsExchangeRate: number
  wethExchangeRate: number
}

export default function TreasuryTotals({
  axsExchangeRate,
  wethExchangeRate,
}: Props) {
  const [totals, setTotals] = useState<Totals | null>(null)

  useEffect(() => {
    const fetchTotals = async () => {
      const response = await fetch('/api/fetch-treasury-totals')
      const data: Totals = await response.json()
      setTotals(data)
    }

    fetchTotals()
  }, [])

  if (!totals) {
    return <div>Loading...</div>
  }

  const totalUSD = (
    totals.axsTotal * axsExchangeRate +
    totals.wethTotal * wethExchangeRate
  ).toFixed(2)

  return (
    <div className={styles.treasuryTotals}>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS</p>
        <p className={styles.totalAmount}>{totals.axsTotal} AXS</p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total WETH</p>
        <p className={styles.totalAmount}>{totals.wethTotal} WETH</p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS + WETH as USD</p>
        <p className={styles.totalAmount}>
          ${new Intl.NumberFormat().format(Number(totalUSD))}
        </p>
      </div>
    </div>
  )
}
