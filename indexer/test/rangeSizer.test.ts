import { describe, expect, it } from 'vitest'

import { RangeSizer } from '../src/rpc/rangeSizer.js'
import type { ErrorInfo } from '../src/rpc/retry.js'

const info = (over: Partial<ErrorInfo>): ErrorInfo => ({
  rateLimited: false,
  transient: false,
  shrinkRange: false,
  message: '',
  ...over,
})

describe('RangeSizer', () => {
  it('starts at RANGE_START and grows x1.5 while results stay under 5000, capped at max', () => {
    const s = new RangeSizer({ start: 2000, max: 100_000, min: 50 })
    expect(s.size).toBe(2000)
    s.onResult(10)
    expect(s.size).toBe(3000)
    s.onResult(4999)
    expect(s.size).toBe(4500)
    s.onResult(5000)
    expect(s.size).toBe(4500) // >= 5000 results: hold
    for (let i = 0; i < 20; i++) s.onResult(0)
    expect(s.size).toBe(100_000)
  })

  it('halves on limit/timeout errors with a floor of min', () => {
    const s = new RangeSizer({ start: 2000, max: 100_000, min: 50 })
    expect(
      s.onError(info({ shrinkRange: true, message: 'query timeout' })),
    ).toBe(true)
    expect(s.size).toBe(1000)
    for (let i = 0; i < 10; i++) s.onError(info({ shrinkRange: true }))
    expect(s.size).toBe(50)
    expect(s.onError(info({ shrinkRange: true }))).toBe(false)
    expect(s.size).toBe(50)
  })

  it('never shrinks on 429', () => {
    const s = new RangeSizer({ start: 2000, max: 100_000, min: 50 })
    expect(s.onError(info({ rateLimited: true }))).toBe(false)
    expect(s.size).toBe(2000)
    expect(s.onError(info({ rateLimited: true, shrinkRange: true }))).toBe(
      false,
    )
    expect(s.size).toBe(2000)
  })

  it('pins to an explicit provider cap and never grows past it', () => {
    const s = new RangeSizer({ start: 2000, max: 100_000, min: 50 })
    expect(
      s.onError(
        info({
          shrinkRange: true,
          rangeLimit: 200,
          message: 'requested block range 2000 exceeds the limit of 200',
        }),
      ),
    ).toBe(true)
    expect(s.size).toBe(200)
    expect(s.cap).toBe(200)
    for (let i = 0; i < 5; i++) s.onResult(1)
    expect(s.size).toBe(200)
    // a cap above the current size still halves the current size (the error was still an error)
    const t = new RangeSizer({ start: 2000, max: 100_000, min: 50 })
    t.onError(info({ shrinkRange: true, rangeLimit: 10_000 }))
    expect(t.size).toBe(1000)
    expect(t.effectiveMax).toBe(10_000)
  })
})
