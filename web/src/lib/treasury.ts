import type { DashboardSnapshot } from '@axie-gov/shared'

/** USD value of the net holdings, or null when either rate is unknown. */
export function usdValue(
  totals: DashboardSnapshot['totals'],
  rates: DashboardSnapshot['rates'],
): number | null {
  if (rates.axsUsd === null || rates.ethUsd === null) return null
  return totals.net.axs * rates.axsUsd + totals.net.weth * rates.ethUsd
}
