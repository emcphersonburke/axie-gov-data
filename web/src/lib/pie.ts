import type { BreakdownRow, NftType, TxType } from '@axie-gov/shared'

import type { Token } from './series'

export type PieMode = 'nftType' | 'txType'

export interface PieDatum {
  id: string
  label: string
  value: number
  txCount: number
}

/** Display labels per transaction type; `null` means the row is derived elsewhere or hidden. */
const TX_TYPE_LABELS: Record<TxType, string | null> = {
  sale: 'Marketplace Sale',
  'rc-mint': null, // split by nftType below
  ascension: 'Ascension',
  breeding: 'Breeding',
  evolution: 'Evolution',
  atiablessing: 'Blessing Streak Restore',
  outflow: null, // not a fee — hidden
  unknown: 'Other',
}

function txTypeLabel(type: TxType, nftType: NftType): string | null {
  if (type === 'rc-mint') {
    if (nftType === 'Rune') return 'Rune Mint'
    if (nftType === 'Charm') return 'Charm Mint'
    return 'Rune/Charm Mint'
  }
  return TX_TYPE_LABELS[type]
}

/**
 * Aggregate the (type × nftType) breakdown into pie slices.
 *
 * - Outflows are never fees, so they are hidden in both modes.
 * - `nftType` mode drops `None` (fees with no NFT transfer).
 * - `txType` mode splits `rc-mint` into Rune Mint / Charm Mint and folds
 *   `unknown` into "Other".
 * - Zero-value slices are dropped; the result is sorted alphabetically.
 */
export function buildPieData(
  breakdown: readonly BreakdownRow[],
  mode: PieMode,
  token: Token,
): PieDatum[] {
  const slices = new Map<string, PieDatum>()
  for (const row of breakdown) {
    if (row.type === 'outflow') continue
    let label: string | null
    if (mode === 'nftType') {
      if (row.nftType === 'None') continue
      label = row.nftType
    } else {
      label = txTypeLabel(row.type, row.nftType)
    }
    if (label === null) continue
    const slice = slices.get(label) ?? {
      id: label,
      label,
      value: 0,
      txCount: 0,
    }
    slice.value += row[token]
    slice.txCount += row.txCount
    slices.set(label, slice)
  }
  return [...slices.values()]
    .filter((slice) => slice.value > 0)
    .sort((a, b) => a.label.localeCompare(b.label))
}
