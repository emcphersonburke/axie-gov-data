import type { Bucket } from '@axie-gov/shared'

const token4 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})
const fixed2 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const price = new Intl.NumberFormat()

/** Token amounts on the totals tiles and pie tooltips: 4 decimals. */
export const formatToken = (n: number): string => token4.format(n)

/** USD totals: 2 decimals, no currency symbol (callers prefix `$`). */
export const formatUsd = (n: number): string => fixed2.format(n)

/** Chart deltas ("+1,234.56 AXS"): 2 decimals, always signed. */
export const formatDelta = (n: number): string =>
  `${n < 0 ? '−' : '+'}${fixed2.format(Math.abs(n))}`

/** Spot prices in the header boxes; `—` when the rate is unknown. */
export const formatPrice = (n: number | null): string =>
  n === null ? '—' : price.format(n)

/** Block numbers: grouped digits (60,444,658). */
export const formatBlock = (n: number): string => grouped.format(n)

/** Block counts for prose ("18.2M blocks behind"). */
export const formatCompact = (n: number): string => compact.format(n)

/** "Data as of" stamps: local date + time with zone, or `unknown` for null. */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/** Shows the time-of-day only for sub-day buckets; month-only for monthly buckets. */
export function formatBucketTime(unixSeconds: number, bucket: Bucket): string {
  const d = new Date(unixSeconds * 1000)
  switch (bucket) {
    case '1h':
    case '8h':
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case '1d':
    case '1w':
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    case '1M':
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  }
}

/** Rough human duration for lag prose. */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`
  const minutes = seconds / 60
  if (minutes < 90) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 36) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} d`
}
