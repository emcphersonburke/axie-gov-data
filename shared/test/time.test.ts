import { describe, expect, it } from 'vitest'

import {
  addMonths,
  bucketStarts,
  DAY,
  floor8h,
  floorDay,
  floorHour,
  floorMonth,
  floorWeek,
  HOUR,
  rangeWindow,
} from '../src/time'

const T = Date.UTC(2026, 8, 2, 13, 47, 21) / 1000 // 2026-09-02T13:47:21Z (Wednesday)

describe('floors', () => {
  it('hour/8h/day are epoch aligned', () => {
    expect(floorHour(T)).toBe(Date.UTC(2026, 8, 2, 13) / 1000)
    expect(floor8h(T)).toBe(Date.UTC(2026, 8, 2, 8) / 1000)
    expect(floorDay(T)).toBe(Date.UTC(2026, 8, 2) / 1000)
  })
  it('week floors to Monday 00:00 UTC', () => {
    const monday = Date.UTC(2026, 7, 31) / 1000 // 2026-08-31 is a Monday
    expect(floorWeek(T)).toBe(monday)
    expect(floorWeek(monday)).toBe(monday)
    expect(floorWeek(monday - 1)).toBe(monday - 7 * DAY)
  })
  it('month floors to the 1st', () => {
    expect(floorMonth(T)).toBe(Date.UTC(2026, 8, 1) / 1000)
    expect(addMonths(floorMonth(T), -12)).toBe(Date.UTC(2025, 8, 1) / 1000)
  })
})

describe('rangeWindow / bucketStarts', () => {
  const first = Date.UTC(2022, 9, 11, 10, 38, 17) / 1000
  it('24h gives 25 hourly buckets ending at now', () => {
    const w = rangeWindow('24h', T, first)
    const starts = bucketStarts(w)
    expect(w.bucket).toBe('1h')
    expect(starts).toHaveLength(25)
    expect(starts[0]).toBe(floorHour(T - DAY))
    expect(starts.at(-1)).toBe(floorHour(T))
    expect(starts[1]! - starts[0]!).toBe(HOUR)
  })
  it('7d uses 8h buckets aligned to 00/08/16 UTC', () => {
    const starts = bucketStarts(rangeWindow('7d', T, first))
    expect(starts.every((s) => s % (8 * HOUR) === 0)).toBe(true)
    expect(starts.length).toBe(22)
  })
  it('all starts at the first tx month and is monthly', () => {
    const starts = bucketStarts(rangeWindow('all', T, first))
    expect(starts[0]).toBe(Date.UTC(2022, 9, 1) / 1000)
    expect(starts.at(-1)).toBe(Date.UTC(2026, 8, 1) / 1000)
    expect(starts).toHaveLength(48)
  })
  it('6m is weekly from Monday', () => {
    const w = rangeWindow('6m', T, first)
    expect(w.bucket).toBe('1w')
    expect(floorWeek(w.windowStart)).toBe(w.windowStart)
  })
})
