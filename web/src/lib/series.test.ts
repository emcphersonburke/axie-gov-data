import type { RangeStats } from '@axie-gov/shared'
import { describe, expect, it } from 'vitest'

import { buildCumulativeSeries } from './series'

const point = (t: number, axs: number, weth: number) => ({
  t,
  axs,
  weth,
  txCount: 1,
})

const range = (
  baseline: { axs: number; weth: number },
  series: RangeStats['series'],
): Pick<RangeStats, 'baseline' | 'series'> => ({ baseline, series })

describe('buildCumulativeSeries', () => {
  it('starts at the baseline and accumulates each bucket', () => {
    const out = buildCumulativeSeries(
      range({ axs: 100, weth: 5 }, [
        point(0, 10, 1),
        point(3600, 0, 0),
        point(7200, 5, 0.5),
      ]),
      'axs',
    )
    expect(out.baseline).toBe(100)
    expect(out.points).toEqual([
      { t: 0, value: 110 },
      { t: 3600, value: 110 },
      { t: 7200, value: 115 },
    ])
    expect(out.delta).toBe(15)
    expect(out.end).toBe(115)
  })

  it('selects the requested token', () => {
    const out = buildCumulativeSeries(
      range({ axs: 100, weth: 5 }, [point(0, 10, 1), point(3600, 5, 0.5)]),
      'weth',
    )
    expect(out.points.map((p) => p.value)).toEqual([6, 6.5])
    expect(out.delta).toBe(1.5)
  })

  it('drops leading zero-value points (legacy chart parity) but keeps later zeros', () => {
    const out = buildCumulativeSeries(
      range({ axs: 0, weth: 0 }, [
        point(0, 0, 0),
        point(1, 0, 0),
        point(2, 3, 0),
        point(3, 0, 0),
      ]),
      'axs',
    )
    expect(out.points.map((p) => p.t)).toEqual([2, 3])
    expect(out.points.map((p) => p.value)).toEqual([3, 3])
    expect(out.delta).toBe(3)
  })

  it('keeps every point when the baseline is already positive', () => {
    const out = buildCumulativeSeries(
      range({ axs: 1, weth: 1 }, [point(0, 0, 0), point(1, 0, 0)]),
      'axs',
    )
    expect(out.points).toHaveLength(2)
    expect(out.delta).toBe(0)
  })

  it('handles an empty series', () => {
    const out = buildCumulativeSeries(range({ axs: 7, weth: 0 }, []), 'axs')
    expect(out.points).toEqual([])
    expect(out.delta).toBe(0)
    expect(out.end).toBe(7)
  })

  it('returns no points when everything is zero', () => {
    const out = buildCumulativeSeries(
      range({ axs: 0, weth: 0 }, [point(0, 0, 0), point(1, 0, 0)]),
      'weth',
    )
    expect(out.points).toEqual([])
    expect(out.delta).toBe(0)
  })
})
