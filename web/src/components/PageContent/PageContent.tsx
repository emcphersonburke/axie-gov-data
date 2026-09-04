import type { DashboardSnapshot } from '@axie-gov/shared'

import ChartGroup from '~/components/ChartGroup/ChartGroup'
import DataStatus from '~/components/DataStatus/DataStatus'
import LineChart from '~/components/LineChart/LineChart'
import PieChart from '~/components/PieChart/PieChart'
import TerrariumGate from '~/components/TerrariumGate/TerrariumGate'
import TreasuryTotals from '~/components/TreasuryTotals/TreasuryTotals'
import { formatPrice } from '~/lib/format'
import { useSnapshot } from '~/store/useSnapshot'

import styles from './PageContent.module.scss'

interface PageContentProps {
  snapshot: DashboardSnapshot
}

export default function PageContent({ snapshot }: PageContentProps) {
  const state = useSnapshot()
  const refetchError = state.status === 'ready' ? state.refetchError : null
  const { rates, ranges } = snapshot

  return (
    <div className={styles.page}>
      <TerrariumGate />
      <header className={styles.headingWrapper}>
        <h1>Axie Community Treasury</h1>
        <div className={styles.tokenPriceBoxWrapper}>
          <div className={styles.tokenPriceBox}>
            <p className={`${styles.tokenPriceBoxHeading} ${styles.ethColor}`}>
              WETH/USD
            </p>
            <div className={styles.tokenPriceBoxPrice}>
              ${formatPrice(rates.ethUsd)}
            </div>
          </div>
          <div className={styles.tokenPriceBox}>
            <p className={`${styles.tokenPriceBoxHeading} ${styles.axsColor}`}>
              AXS/USD
            </p>
            <div className={styles.tokenPriceBoxPrice}>
              ${formatPrice(rates.axsUsd)}
            </div>
          </div>
        </div>
      </header>
      <DataStatus
        snapshot={snapshot}
        isStale={state.isStale}
        refetchError={refetchError}
      />
      <TreasuryTotals totals={snapshot.totals} rates={rates} />
      <ChartGroup title="Growth" ranges={ranges}>
        {(range) => (
          <>
            <LineChart range={range} token="weth" />
            <LineChart range={range} token="axs" />
          </>
        )}
      </ChartGroup>
      <ChartGroup
        title="Fees from Marketplace Sales"
        subtitle="By NFT Type (WETH)"
        ranges={ranges}
      >
        {(range) => <PieChart range={range} mode="nftType" token="weth" />}
      </ChartGroup>
      <ChartGroup
        title="Fee Breakdown in Ecosystem"
        subtitle="By Transaction Type (AXS)"
        ranges={ranges}
      >
        {(range) => <PieChart range={range} mode="txType" token="axs" />}
      </ChartGroup>
    </div>
  )
}
