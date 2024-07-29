// app/PageContent.tsx
'use client'

import dynamic from 'next/dynamic'
import React from 'react'

import BarChart from '~/components/BarChart/BarChart'
import ChartGroup from '~/components/ChartGroup/ChartGroup'
import LineChart from '~/components/LineChart/LineChart'
import TreasuryTotals from '~/components/TreasuryTotals/TreasuryTotals'
import { ChartTransaction } from '~/types'

import styles from './PageContent.module.scss'

// Dynamically import AxieTerrarium with no SSR
const AxieTerrarium = dynamic(() => import('../AxieTerrarium/AxieTerrarium'), {
  ssr: false,
})

type ExchangeRates = {
  axs: number
  eth: number
}

type PageContentProps = {
  initialTransactions: ChartTransaction[]
  initialTotals: { axs: number; weth: number }
  exchangeRates: ExchangeRates
}

export default function PageContent({
  initialTransactions,
  initialTotals,
  exchangeRates,
}: PageContentProps) {
  return (
    <div className={styles.page}>
      <AxieTerrarium />
      <div className={styles.headingWrapper}>
        <h1>Axie Community Treasury</h1>
        <div className={styles.tokenPriceBoxWrapper}>
          <div className={styles.tokenPriceBox}>
            <p className={`${styles.tokenPriceBoxHeading} ${styles.ethColor}`}>
              WETH/USD
            </p>
            <div className={styles.tokenPriceBoxPrice}>
              ${new Intl.NumberFormat().format(exchangeRates.eth)}
            </div>
          </div>
          <div className={styles.tokenPriceBox}>
            <p className={`${styles.tokenPriceBoxHeading} ${styles.axsColor}`}>
              AXS/USD
            </p>
            <div className={styles.tokenPriceBoxPrice}>
              ${new Intl.NumberFormat().format(exchangeRates.axs)}
            </div>
          </div>
        </div>
      </div>
      <TreasuryTotals
        axsExchangeRate={exchangeRates.axs}
        wethExchangeRate={exchangeRates.eth}
      />
      <ChartGroup
        title="Growth"
        initialData={initialTransactions}
        initialTotals={initialTotals}
      >
        {(data, startDate, cumulativeTotals) => (
          <>
            <LineChart
              data={data}
              filter="weth"
              yAxisLabel="WETH"
              type="growthWeth"
              startDate={startDate}
              cumulativeTotals={cumulativeTotals}
            />
            <LineChart
              data={data}
              filter="axs"
              yAxisLabel="AXS"
              type="growthAxs"
              startDate={startDate}
              cumulativeTotals={cumulativeTotals}
            />
          </>
        )}
      </ChartGroup>
      <ChartGroup
        title="Fees from Marketplace Sales"
        subtitle="By NFT Type (WETH)"
        initialData={initialTransactions}
        initialTotals={initialTotals}
      >
        {(data) => <BarChart data={data} type="nftType" currency="weth" />}
      </ChartGroup>
      <ChartGroup
        title="Fee Breakdown in Ecosystem"
        subtitle="By Transaction Type (AXS)" // Make AXS its own line along with the logo. Same for wETh
        initialData={initialTransactions}
        initialTotals={initialTotals}
      >
        {(data) => (
          <BarChart data={data} type="transactionType" currency="axs" />
        )}
      </ChartGroup>
    </div>
  )
}
