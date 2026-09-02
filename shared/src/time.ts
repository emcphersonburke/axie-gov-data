/**
 * UTC time helpers shared by the indexer (bucketing rollups into snapshot
 * series) and the web app (labelling those buckets). All inputs/outputs are
 * unix seconds unless a name says otherwise.
 */
export const RANGE_KEYS = ['24h', '7d', '30d', '6m', '1y', 'all'] as const
export type RangeKey = (typeof RANGE_KEYS)[number]

export const BUCKETS = ['1h', '8h', '1d', '1w', '1M'] as const
export type Bucket = (typeof BUCKETS)[number]

export const HOUR = 3600
export const DAY = 86_400
export const WEEK = 7 * DAY
/** 1970-01-05 was a Monday; used to align weeks to Monday 00:00 UTC (matches Postgres date_trunc('week')). */
const MONDAY_EPOCH_OFFSET = 4 * DAY

const mod = (a: number, n: number): number => ((a % n) + n) % n

export const floorHour = (ts: number): number => ts - mod(ts, HOUR)
/** 8-hour buckets starting 00:00 / 08:00 / 16:00 UTC. */
export const floor8h = (ts: number): number => ts - mod(ts, 8 * HOUR)
export const floorDay = (ts: number): number => ts - mod(ts, DAY)
export const floorWeek = (ts: number): number =>
  ts - mod(ts - MONDAY_EPOCH_OFFSET, WEEK)
export function floorMonth(ts: number): number {
  const d = new Date(ts * 1000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
}

export function addMonths(ts: number, months: number): number {
  const d = new Date(ts * 1000)
  return (
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ) / 1000
  )
}

export function bucketStart(ts: number, bucket: Bucket): number {
  switch (bucket) {
    case '1h':
      return floorHour(ts)
    case '8h':
      return floor8h(ts)
    case '1d':
      return floorDay(ts)
    case '1w':
      return floorWeek(ts)
    case '1M':
      return floorMonth(ts)
  }
}

export function nextBucket(start: number, bucket: Bucket): number {
  switch (bucket) {
    case '1h':
      return start + HOUR
    case '8h':
      return start + 8 * HOUR
    case '1d':
      return start + DAY
    case '1w':
      return start + WEEK
    case '1M':
      return addMonths(start, 1)
  }
}

export interface RangeWindow {
  key: RangeKey
  bucket: Bucket
  /** inclusive, bucket-aligned */
  windowStart: number
  /** exclusive: the generation time */
  windowEnd: number
}

export const RANGE_BUCKET: Record<RangeKey, Bucket> = {
  '24h': '1h',
  '7d': '8h',
  '30d': '1d',
  '6m': '1w',
  '1y': '1M',
  all: '1M',
}

/** Window definitions for each dashboard range. `firstTxTs` bounds the "all" range. */
export function rangeWindow(
  key: RangeKey,
  now: number,
  firstTxTs: number,
): RangeWindow {
  const bucket = RANGE_BUCKET[key]
  let windowStart: number
  switch (key) {
    case '24h':
      windowStart = floorHour(now - DAY)
      break
    case '7d':
      windowStart = floor8h(now - 7 * DAY)
      break
    case '30d':
      windowStart = floorDay(now - 30 * DAY)
      break
    case '6m':
      windowStart = floorWeek(addMonths(now, -6))
      break
    case '1y':
      windowStart = floorMonth(addMonths(now, -12))
      break
    case 'all':
      windowStart = floorMonth(firstTxTs)
      break
  }
  return { key, bucket, windowStart, windowEnd: now }
}

/** All bucket starts covering [windowStart, windowEnd), ascending, dense. */
export function bucketStarts(w: RangeWindow): number[] {
  const out: number[] = []
  for (
    let t = bucketStart(w.windowStart, w.bucket);
    t < w.windowEnd;
    t = nextBucket(t, w.bucket)
  )
    out.push(t)
  return out
}

export const toIso = (ts: number): string => new Date(ts * 1000).toISOString()
