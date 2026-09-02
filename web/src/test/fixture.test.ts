import type { RangeKey } from '@axie-gov/shared'
import { dashboardSnapshotSchema } from '@axie-gov/shared/snapshot'
import { bucketStarts, RANGE_KEYS } from '@axie-gov/shared/time'
import { describe, expect, it } from 'vitest'

import fixture from '../../fixtures/dashboard.json'

const parsed = dashboardSnapshotSchema.safeParse(fixture)

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const closeTo = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(1e-6 * Math.abs(b), 1e-3)

describe('fixtures/dashboard.json', () => {
  it('validates against the shared snapshot schema', () => {
    expect(parsed.success, parsed.success ? '' : parsed.error.message).toBe(
      true,
    )
  })

  it('carries every range', () => {
    if (!parsed.success) return
    for (const key of RANGE_KEYS) expect(parsed.data.ranges[key]).toBeDefined()
  })

  describe.each(RANGE_KEYS as readonly RangeKey[])('range %s', (key) => {
    const range = parsed.success ? parsed.data.ranges[key] : undefined
    const totals = parsed.success ? parsed.data.totals : undefined

    it('satisfies baseline + Σ series ≈ totals.inflow for both tokens', () => {
      if (!range || !totals) return
      const axs = range.baseline.axs + sum(range.series.map((p) => p.axs))
      const weth = range.baseline.weth + sum(range.series.map((p) => p.weth))
      expect(
        closeTo(axs, totals.inflow.axs),
        `axs ${axs} vs ${totals.inflow.axs}`,
      ).toBe(true)
      expect(
        closeTo(weth, totals.inflow.weth),
        `weth ${weth} vs ${totals.inflow.weth}`,
      ).toBe(true)
    })

    it('has dense, ascending buckets matching the shared helpers', () => {
      if (!range) return
      const expected = bucketStarts({
        key,
        bucket: range.bucket,
        windowStart: range.windowStart,
        windowEnd: range.windowEnd,
      })
      expect(range.series.map((p) => p.t)).toEqual(expected)
      expect(range.series.length).toBeGreaterThan(0)
    })

    it('breakdown (minus outflow) sums to the window inflow', () => {
      if (!range) return
      const inflowRows = range.breakdown.filter((r) => r.type !== 'outflow')
      expect(
        closeTo(
          sum(inflowRows.map((r) => r.axs)),
          sum(range.series.map((p) => p.axs)),
        ),
      ).toBe(true)
      expect(
        closeTo(
          sum(inflowRows.map((r) => r.weth)),
          sum(range.series.map((p) => p.weth)),
        ),
      ).toBe(true)
      expect(sum(inflowRows.map((r) => r.txCount))).toBe(
        sum(range.series.map((p) => p.txCount)),
      )
    })
  })

  it('includes the interesting breakdown rows in the all-time range', () => {
    if (!parsed.success) return
    const rows = parsed.data.ranges.all?.breakdown ?? []
    const has = (type: string, nftType: string) =>
      rows.some((r) => r.type === type && r.nftType === nftType)
    expect(has('unknown', 'None')).toBe(true)
    expect(has('outflow', 'None')).toBe(true)
    expect(has('atiablessing', 'None')).toBe(true)
    expect(has('sale', 'Consumable Item')).toBe(true)
    expect(has('rc-mint', 'Rune')).toBe(true)
    expect(has('rc-mint', 'Charm')).toBe(true)
    expect(has('sale', 'Mixed')).toBe(true)
  })

  it('stays small enough to commit', () => {
    expect(JSON.stringify(fixture).length).toBeLessThan(100_000)
  })
})
