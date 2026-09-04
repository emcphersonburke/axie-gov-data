import type { DashboardSnapshot } from '@axie-gov/shared'

import { formatToken, formatUsd } from '~/lib/format'
import { usdValue } from '~/lib/treasury'

import styles from './TreasuryTotals.module.scss'

interface TreasuryTotalsProps {
  totals: DashboardSnapshot['totals']
  rates: DashboardSnapshot['rates']
}

/** Net AXS/WETH held, the bridge-backed share of that WETH, and the USD value of the holdings. */
export default function TreasuryTotals({ totals, rates }: TreasuryTotalsProps) {
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
              The share of the treasury&rsquo;s WETH that real ETH on Ethereum
              still backs. The March 2022 Ronin bridge hack took 173,600 ETH;
              Sky Mavis refunded 117,600 ETH of user funds and left the
              remaining {totals.unbackedWeth.toLocaleString()} ETH of shortfall
              against this treasury, so that much of the balance above is a
              claim on Sky Mavis rather than spendable WETH.
            </span>
          </span>
        </p>
        <p className={styles.totalAmount}>
          {formatToken(totals.backedWeth)} WETH
        </p>
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
