// components/TreasuryTotals/TreasuryTotals.tsx
'use client'

import React, { useEffect, useState } from 'react'

import styles from './TreasuryTotals.module.scss'

type Totals = {
  axsTotal: number
  wethTotal: number
  backedWethTotal: number
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
      setTotals({ ...data, backedWethTotal: 2618.2305 })
    }

    fetchTotals()
  }, [])

  if (!totals) {
    return <div>Loading...</div>
  }

  const totalUSD =
    totals.axsTotal * axsExchangeRate + totals.wethTotal * wethExchangeRate

  return (
    <div className={styles.treasuryTotals}>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS</p>
        <p className={styles.totalAmount}>
          {new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(totals.axsTotal)}{' '}
          AXS
        </p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total WETH</p>
        <p className={styles.totalAmount}>
          {new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(totals.wethTotal)}{' '}
          WETH
        </p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>
          Backed WETH
          <span className={styles.infoIcon}>
            ⓘ
            <span className={styles.tooltip}>
              This value is calculated based on the total number of deposits and
              withdrawals through the Ronin Bridge.
            </span>
          </span>
        </p>
        <p className={styles.totalAmount}>
          {new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(totals.backedWethTotal)}{' '}
          WETH
        </p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS + WETH as USD</p>
        <p className={styles.totalAmount}>
          $
          {new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(totalUSD)}
        </p>
      </div>
    </div>
  )
}
