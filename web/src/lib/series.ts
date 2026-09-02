import type { RangeStats } from '@axie-gov/shared'

export type Token = 'axs' | 'weth'

export interface CumulativePoint {
  /** bucket start, unix seconds UTC */
  t: number
  /** cumulative inflow at the end of this bucket */
  value: number
}

export interface CumulativeSeries {
  /** baseline + running sum, with leading zero-value points dropped */
  points: CumulativePoint[]
  /** cumulative inflow strictly before the window */
  baseline: number
  /** Σ series inflow inside the window */
  delta: number
  /** baseline + delta, i.e. the last plotted value */
  end: number
}

/**
 * Growth line for one token: start at the range baseline and accumulate each
 * bucket. Leading points whose cumulative value is still zero are dropped for
 * visual parity with the legacy chart (which filtered `cumulative > 0`); since
 * inflows are non-negative the running sum is monotonic, so only a leading run
 * can be zero.
 */
export function buildCumulativeSeries(
  range: Pick<RangeStats, 'baseline' | 'series'>,
  token: Token,
): CumulativeSeries {
  const baseline = range.baseline[token]
  let running = baseline
  let delta = 0
  const all: CumulativePoint[] = range.series.map((point) => {
    const inflow = point[token]
    running += inflow
    delta += inflow
    return { t: point.t, value: running }
  })
  const firstNonZero = all.findIndex((p) => p.value > 0)
  const points = firstNonZero === -1 ? [] : all.slice(firstNonZero)
  return { points, baseline, delta, end: baseline + delta }
}
