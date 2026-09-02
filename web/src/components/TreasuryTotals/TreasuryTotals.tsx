import type { DashboardSnapshot } from '@axie-gov/shared'

import { formatToken, formatUsd } from '~/lib/format'
import { usdValue } from '~/lib/treasury'

import styles from './TreasuryTotals.module.scss'

interface TreasuryTotalsProps {
  totals: DashboardSnapshot['totals']
  bridge: DashboardSnapshot['bridge']
  rates: DashboardSnapshot['rates']
}

/** Net AXS/WETH held, chain-wide bridged WETH, and the USD value of the net holdings. */
export default function TreasuryTotals({
  totals,
  bridge,
  rates,
}: TreasuryTotalsProps) {
  const usd = usdValue(totals, rates)
  return (
    <div className={styles.treasuryTotals}>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS</p>
        <p className={styles.totalAmount}>{formatToken(totals.net.axs)} AXS</p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total WETH</p>
        <p className={styles.totalAmount}>
          {formatToken(totals.net.weth)} WETH
        </p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>
          Backed WETH
          <span
            className={styles.infoIcon}
            tabIndex={0}
            aria-describedby="backed-weth-tooltip"
          >
            ⓘ
            <span
              className={styles.tooltip}
              role="tooltip"
              id="backed-weth-tooltip"
            >
              WETH bridged onto Ronin minus WETH withdrawn, chain-wide (from{' '}
              {bridge.eventCount.toLocaleString()} Ronin Bridge events).
            </span>
          </span>
        </p>
        <p className={styles.totalAmount}>{formatToken(bridge.all.net)} WETH</p>
      </div>
      <div className={styles.totalBox}>
        <p className={styles.totalLabel}>Total AXS + WETH as USD</p>
        <p className={styles.totalAmount}>
          {usd === null ? (
            <span title="Exchange rates unavailable">—</span>
          ) : (
            `$${formatUsd(usd)}`
          )}
        </p>
      </div>
    </div>
  )
}
