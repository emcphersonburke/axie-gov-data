// components/PageContent/PageContent.tsx
'use client'

import BarChart from '~/components/BarChart/BarChart'
import ChartGroup from '~/components/ChartGroup/ChartGroup'
import LineChart from '~/components/LineChart/LineChart'
import { ChartTransaction } from '~/types'

import styles from './PageContent.module.scss'

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
        title="Marketplace Fee Inflows by NFT Type (WETH)"
        initialData={initialTransactions}
        initialTotals={initialTotals}
      >
        {(data) => <BarChart data={data} type="nftType" currency="weth" />}
      </ChartGroup>
      <ChartGroup
        title="Inflows by Transaction Type (AXS)"
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
