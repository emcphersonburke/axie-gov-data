import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Throttle } from '../src/rpc/throttle.js'

describe('Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('admits a full batch per token and meters tokens at rps', async () => {
    const t = new Throttle({
      startRps: 2,
      maxRps: 10,
      concurrency: 100,
      batchSize: 5,
      random: () => 0.5,
    })
    const granted: number[] = []
    const releases: Array<() => void> = []
    const pending = Array.from({ length: 12 }, (_, i) =>
      t.acquire().then((release) => {
        granted.push(i)
        releases.push(release)
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    // capacity is max(1, rps) = 2 tokens at start -> 2 batches of 5
    expect(granted.length).toBe(10)
    await vi.advanceTimersByTimeAsync(499)
    expect(granted.length).toBe(10)
    await vi.advanceTimersByTimeAsync(2)
    expect(granted.length).toBe(12)
    for (const r of releases) r()
    await Promise.all(pending)
    expect(t.snapshot().inFlight).toBe(0)
    t.dispose()
  })

  it('caps in-flight sub-calls at concurrency and refills as calls release', async () => {
    const t = new Throttle({
      startRps: 100,
      maxRps: 100,
      concurrency: 3,
      batchSize: 10,
    })
    const releases: Array<() => void> = []
    const all = Array.from({ length: 6 }, () =>
      t.acquire().then((r) => releases.push(r)),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(releases.length).toBe(3)
    expect(t.snapshot().inFlight).toBe(3)
    releases[0]?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(releases.length).toBe(4)
    for (const r of releases) r()
    await vi.advanceTimersByTimeAsync(100)
    await Promise.all(all)
    t.dispose()
  })

  it('AIMD: 429 cuts rps by 0.7 and pauses everyone; a clean minute adds 1 rps', async () => {
    const t = new Throttle({
      startRps: 10,
      maxRps: 12,
      concurrency: 10,
      batchSize: 1,
      random: () => 0.5,
    })
    const pause = t.onRateLimited(2_000)
    expect(t.rps).toBeCloseTo(7)
    expect(pause).toBeGreaterThanOrEqual(1_700)
    expect(pause).toBeLessThanOrEqual(2_300)
    expect(t.paused).toBe(true)
    // a second 429 during the pause does not compound the decrease
    t.onRateLimited(1_000)
    expect(t.rps).toBeCloseTo(7)

    let granted = false
    const p = t.acquire().then((release) => {
      granted = true
      release()
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(granted).toBe(false)
    await vi.advanceTimersByTimeAsync(1_500)
    await p
    expect(granted).toBe(true)

    t.onSuccess()
    expect(t.rps).toBeCloseTo(7) // no clean minute yet
    vi.advanceTimersByTime(60_001)
    t.onSuccess()
    expect(t.rps).toBeCloseTo(8)
    t.onSuccess()
    expect(t.rps).toBeCloseTo(8) // one increase per minute
    t.dispose()
  })

  it('uses exponential pauses (capped) when no Retry-After is given', () => {
    const t = new Throttle({
      startRps: 10,
      maxRps: 10,
      concurrency: 1,
      batchSize: 1,
      random: () => 0.5,
      maxPauseMs: 60_000,
    })
    expect(t.onRateLimited()).toBeCloseTo(2_000, -2)
    vi.advanceTimersByTime(5_000)
    expect(t.onRateLimited()).toBeCloseTo(4_000, -2)
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(120_000)
      t.onRateLimited()
    }
    vi.advanceTimersByTime(120_000)
    expect(t.onRateLimited()).toBeLessThanOrEqual(60_000)
    t.dispose()
  })
})
