import { describe, expect, it } from 'vitest'

import { interpolate, planTimestamps } from '../src/rpc/timestamps.js'

describe('timestamps', () => {
  it('interpolates linearly between anchors and clamps outside', () => {
    const anchors = [
      { number: 100, ts: 1000 },
      { number: 164, ts: 1192 },
      { number: 228, ts: 1384 },
    ]
    expect(interpolate(anchors, 100)).toBe(1000)
    expect(interpolate(anchors, 132)).toBe(1096)
    expect(interpolate(anchors, 164)).toBe(1192)
    expect(interpolate(anchors, 196)).toBe(1288)
    expect(interpolate(anchors, 50)).toBe(1000)
    expect(interpolate(anchors, 999)).toBe(1384)
  })

  it('fetches exactly in tail mode', () => {
    const plan = planTimestamps(
      [5, 9, 20],
      new Set(),
      { from: 0, to: 1000 },
      { exact: true, anchorInterval: 64 },
    )
    expect(plan.exact).toEqual([5, 9, 20])
    expect(plan.anchors).toEqual([])
    expect(plan.interpolated).toEqual([])
  })

  it('fetches exactly when that is no more calls than anchoring', () => {
    // 0..1000 step 64 -> 16 anchors + the range end = 17; 10 blocks is cheaper exactly
    const few = planTimestamps(
      Array.from({ length: 10 }, (_, i) => i * 90),
      new Set(),
      { from: 0, to: 1000 },
      { exact: false, anchorInterval: 64 },
    )
    expect(few.exact.length).toBe(10)
    expect(few.interpolated).toEqual([])
    // 500 blocks -> anchors win
    const many = planTimestamps(
      Array.from({ length: 500 }, (_, i) => i * 2),
      new Set(),
      { from: 0, to: 1000 },
      { exact: false, anchorInterval: 64 },
    )
    expect(many.exact).toEqual([])
    expect(many.anchors.length).toBe(17)
    expect(many.anchors[0]).toBe(0)
    expect(many.anchors[many.anchors.length - 1]).toBe(1000)
    expect(many.interpolated.length).toBe(500)
  })

  it('skips blocks whose timestamps are already known (blockTimestamp on logs)', () => {
    const plan = planTimestamps(
      [1, 2, 3],
      new Set([1, 2, 3]),
      { from: 0, to: 100 },
      { exact: false, anchorInterval: 64 },
    )
    expect(plan).toEqual({ exact: [], anchors: [], interpolated: [] })
    const partial = planTimestamps(
      [1, 2, 3],
      new Set([2]),
      { from: 0, to: 100 },
      { exact: true, anchorInterval: 64 },
    )
    expect(partial.exact).toEqual([1, 3])
  })
})
