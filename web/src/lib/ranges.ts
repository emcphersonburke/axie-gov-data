import type { RangeKey } from '@axie-gov/shared'
import { RANGE_KEYS } from '@axie-gov/shared/time'

/** Button captions, in display order (mirrors RANGE_KEYS). */
export const RANGE_LABELS: Record<RangeKey, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  '6m': '6M',
  '1y': '1Y',
  all: 'ALL',
}

export const RANGE_ORDER: readonly RangeKey[] = RANGE_KEYS
export const DEFAULT_RANGE: RangeKey = '24h'

export const rangeLabel = (key: RangeKey): string => RANGE_LABELS[key]

export function rangeFromLabel(label: string): RangeKey | undefined {
  const upper = label.toUpperCase()
  return RANGE_ORDER.find((key) => RANGE_LABELS[key] === upper)
}

export const isRangeKey = (value: string): value is RangeKey =>
  (RANGE_KEYS as readonly string[]).includes(value)
