import type { BreakdownRow, NftType, TxType } from '@axie-gov/shared'
import { describe, expect, it } from 'vitest'

import { buildPieData } from './pie'

const row = (
  type: TxType,
  nftType: NftType,
  axs: number,
  weth: number,
  txCount = 1,
): BreakdownRow => ({ type, nftType, axs, weth, txCount })

const breakdown: BreakdownRow[] = [
  row('sale', 'Axie', 10, 1, 5),
  row('sale', 'Land', 4, 0.5, 2),
  row('sale', 'Mixed', 1, 0.1, 1),
  row('rc-mint', 'Rune', 20, 0, 8),
  row('rc-mint', 'Charm', 30, 0, 9),
  row('ascension', 'None', 7, 0, 3),
  row('breeding', 'None', 8, 0, 4),
  row('evolution', 'None', 0, 0, 0),
  row('atiablessing', 'None', 2, 0, 1),
  row('unknown', 'None', 3, 0.2, 2),
  row('unknown', 'Axie', 1, 0, 1),
  row('outflow', 'None', 999, 99, 7),
]

describe('buildPieData', () => {
  it('nftType mode groups by NFT type, excludes None and outflows, sorts alphabetically', () => {
    const out = buildPieData(breakdown, 'nftType', 'weth')
    expect(out.map((d) => d.label)).toEqual(['Axie', 'Land', 'Mixed'])
    expect(out.find((d) => d.label === 'Axie')).toEqual({
      id: 'Axie',
      label: 'Axie',
      value: 1,
      txCount: 6, // sale×Axie (5) + unknown×Axie (1)
    })
    expect(out.some((d) => d.label === 'None')).toBe(false)
  })

  it('txType mode splits rc-mint into Rune Mint / Charm Mint, maps unknown to Other, hides outflow', () => {
    const out = buildPieData(breakdown, 'txType', 'axs')
    expect(out.map((d) => d.label)).toEqual([
      'Ascension',
      'Blessing Streak Restore',
      'Breeding',
      'Charm Mint',
      'Marketplace Sale',
      'Other',
      'Rune Mint',
    ])
    expect(out.find((d) => d.label === 'Rune Mint')?.value).toBe(20)
    expect(out.find((d) => d.label === 'Charm Mint')?.value).toBe(30)
    expect(out.find((d) => d.label === 'Other')).toEqual({
      id: 'Other',
      label: 'Other',
      value: 4,
      txCount: 3,
    })
    expect(out.find((d) => d.label === 'Marketplace Sale')?.value).toBe(15)
    expect(out.some((d) => /outflow/i.test(d.label))).toBe(false)
    expect(out.some((d) => d.label === 'rc-mint')).toBe(false)
  })

  it('drops zero-value slices', () => {
    const out = buildPieData(breakdown, 'txType', 'axs')
    expect(out.some((d) => d.label === 'Evolution')).toBe(false)
    // rc-mint carries no WETH at all, so the WETH pie has no mint slices
    const weth = buildPieData(breakdown, 'txType', 'weth')
    expect(weth.some((d) => /Mint/.test(d.label))).toBe(false)
  })

  it('returns an empty array for an empty breakdown', () => {
    expect(buildPieData([], 'nftType', 'weth')).toEqual([])
  })
})
