import { ADDRESSES } from '@axie-gov/shared'
import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import { classifyTx, weiToUnits } from '../src/classify/classify.js'
import type { DecodedLog } from '../src/decode/decodeLog.js'
import { classifyFixture } from './helpers.js'

const HASH = ('0x' + '22'.repeat(32)) as Hex
const ALICE = '0x00000000000000000000000000000000000a11ce' as Address
const BOB = '0x0000000000000000000000000000000000000b0b' as Address
const T = ADDRESSES.TREASURY

let li = 0
const base = (address: Address) => ({
  address,
  logIndex: li++,
  txHash: HASH,
  blockNumber: 1,
})
const axsIn = (from: Address, value: bigint): DecodedLog => ({
  ...base(ADDRESSES.AXS),
  contract: 'AXS',
  kind: 'erc20Transfer',
  token: 'AXS',
  from,
  to: T,
  value,
})
const wethIn = (from: Address, value: bigint): DecodedLog => ({
  ...base(ADDRESSES.WETH),
  contract: 'WETH',
  kind: 'erc20Transfer',
  token: 'WETH',
  from,
  to: T,
  value,
})
const axsOut = (to: Address, value: bigint): DecodedLog => ({
  ...base(ADDRESSES.AXS),
  contract: 'AXS',
  kind: 'erc20Transfer',
  token: 'AXS',
  from: T,
  to,
  value,
})
const otherErc20 = (): DecodedLog => ({
  ...base(ADDRESSES.WETH),
  contract: 'WETH',
  kind: 'erc20Transfer',
  token: 'WETH',
  from: ALICE,
  to: BOB,
  value: 99n,
})
const axie = (tokenId: bigint): DecodedLog => ({
  ...base(ADDRESSES.AXIE),
  contract: 'AXIE',
  kind: 'erc721Transfer',
  nftType: 'Axie',
  from: ALICE,
  to: BOB,
  tokenId,
})
const rune = (id: bigint, value: bigint): DecodedLog => ({
  ...base(ADDRESSES.RUNE),
  contract: 'RUNE',
  kind: 'erc1155Single',
  nftType: 'Rune',
  operator: ALICE,
  from: ALICE,
  to: BOB,
  id,
  value,
})
const charmBatch = (ids: bigint[], values: bigint[]): DecodedLog => ({
  ...base(ADDRESSES.CHARM),
  contract: 'CHARM',
  kind: 'erc1155Batch',
  nftType: 'Charm',
  operator: ALICE,
  from: ALICE,
  to: BOB,
  ids,
  values,
})
const marker = (
  event:
    | 'AxieSpawn'
    | 'AxieLevelAscended'
    | 'PrayerCountSynced'
    | 'PartEvolutionCreated',
): DecodedLog => ({
  ...base(ADDRESSES.AXIE),
  contract: 'AXIE',
  kind: 'marker',
  event,
  args: {},
})

const tx = (logs: DecodedLog[]) =>
  classifyTx({ hash: HASH, block: 1, txIndex: 0, from: ALICE, to: BOB, logs })

describe('classifyTx precedence', () => {
  it('markers beat fee-source contracts beat the NFT fallback', () => {
    const fee = axsIn(ADDRESSES.MARKETPLACE, 1n)
    expect(tx([fee, axie(1n), marker('AxieSpawn')]).type).toBe('breeding')
    expect(
      tx([fee, axie(1n), marker('AxieSpawn'), marker('PartEvolutionCreated')])
        .type,
    ).toBe('evolution')
    expect(
      tx([fee, marker('PartEvolutionCreated'), marker('AxieLevelAscended')])
        .type,
    ).toBe('ascension')
    expect(
      tx([fee, marker('AxieLevelAscended'), marker('PrayerCountSynced')]).type,
    ).toBe('atiablessing')
  })

  it('fee from the marketplace is a sale, from the portal an rc-mint, regardless of NFTs', () => {
    expect(tx([wethIn(ADDRESSES.MARKETPLACE, 1n)]).type).toBe('sale')
    expect(tx([axsIn(ADDRESSES.PORTAL, 1n), rune(1n, 1n)]).type).toBe('rc-mint')
    expect(tx([axsIn(ADDRESSES.PORTAL, 1n)]).type).toBe('rc-mint')
    // fee-source lookup uses the fee log's `from`, not the tx sender
    const c = classifyTx({
      hash: HASH,
      block: 1,
      txIndex: 0,
      from: ADDRESSES.MARKETPLACE,
      to: BOB,
      logs: [axsIn(ALICE, 1n)],
    })
    expect(c.type).toBe('unknown')
  })

  it('inflow + NFTs is a sale, inflow alone is unknown, no inflow is an outflow', () => {
    expect(tx([wethIn(ALICE, 1n), axie(1n)]).type).toBe('sale')
    expect(tx([wethIn(ALICE, 1n)]).type).toBe('unknown')
    expect(tx([axsOut(BOB, 5n)]).type).toBe('outflow')
    expect(tx([axsOut(BOB, 5n), axie(1n)]).type).toBe('outflow')
    expect(tx([otherErc20()]).type).toBe('outflow')
  })
})

describe('classifyTx amounts and children', () => {
  it('sums multiple fee transfers per token with BigInt and keeps every transfer row', () => {
    const c = tx([
      wethIn(ADDRESSES.MARKETPLACE, 10n ** 18n),
      wethIn(ADDRESSES.MARKETPLACE, 3n),
      axsIn(ALICE, 7n),
      axsOut(BOB, 2n),
      otherErc20(),
    ])
    expect(c.wethInWei).toBe(10n ** 18n + 3n)
    expect(c.axsInWei).toBe(7n)
    expect(c.axsOutWei).toBe(2n)
    expect(c.wethOutWei).toBe(0n)
    expect(c.tokenTransfers).toHaveLength(4)
    expect(c.feeFroms.sort()).toEqual([ADDRESSES.MARKETPLACE, ALICE].sort())
    expect(c.type).toBe('sale')
  })

  it('expands TransferBatch into rows with sub_index and keeps ERC-1155 quantities', () => {
    const c = tx([
      axsIn(ADDRESSES.PORTAL, 1n),
      charmBatch([5n, 6n], [2n, 30n]),
      rune(9n, 4n),
    ])
    expect(
      c.nftTransfers.map((n) => [
        n.logIndex === c.nftTransfers[0]?.logIndex ? 'batch' : 'single',
        n.subIndex,
        n.nftType,
        n.tokenId,
        n.quantity,
      ]),
    ).toEqual([
      ['batch', 0, 'Charm', 5n, 2n],
      ['batch', 1, 'Charm', 6n, 30n],
      ['single', 0, 'Rune', 9n, 4n],
    ])
    expect(c.nftCount).toBe(3)
    expect(c.nftType).toBe('Mixed')
  })

  it('assigns one nft_type per tx: None, the kind, or Mixed', () => {
    expect(tx([axsIn(ALICE, 1n)]).nftType).toBe('None')
    expect(tx([axsIn(ALICE, 1n), axie(1n), axie(2n)]).nftType).toBe('Axie')
    expect(tx([axsIn(ALICE, 1n), axie(1n), rune(1n, 1n)]).nftType).toBe('Mixed')
  })

  it('ignores treasury self-transfers', () => {
    const self: DecodedLog = {
      ...base(ADDRESSES.AXS),
      contract: 'AXS',
      kind: 'erc20Transfer',
      token: 'AXS',
      from: T,
      to: T,
      value: 5n,
    }
    const c = tx([self])
    expect(c.tokenTransfers).toHaveLength(0)
    expect(c.type).toBe('outflow')
  })

  it('converts wei to units without float drift on integers', () => {
    expect(weiToUnits(10n ** 18n)).toBe(1)
    expect(weiToUnits(15n * 10n ** 18n)).toBe(15)
    expect(weiToUnits(10667500000000n)).toBeCloseTo(0.0000106675, 12)
    expect(
      weiToUnits(22_801_117n * 10n ** 18n + 126n * 10n ** 15n),
    ).toBeCloseTo(22_801_117.126, 6)
  })
})

describe('classifyTx on live fixtures', () => {
  it('sale: WETH fee from the current marketplace, one Axie', () => {
    const c = classifyFixture('sale')
    expect(c.type).toBe('sale')
    expect(c.nftType).toBe('Axie')
    expect(c.nftCount).toBe(1)
    expect(c.wethInWei).toBe(10667500000000n)
    expect(c.axsInWei).toBe(0n)
    expect(c.tokenTransfers).toEqual([
      expect.objectContaining({
        logIndex: 1,
        token: 'WETH',
        direction: 'in',
        amountWei: 10667500000000n,
      }),
    ])
    expect(c.nftTransfers[0]).toMatchObject({
      logIndex: 3,
      nftType: 'Axie',
      tokenId: 12229249n,
      quantity: 1n,
    })
  })

  it('multi-fee: three marketplace fee transfers in one bundle are summed, not overwritten', () => {
    const c = classifyFixture('multi-fee')
    expect(c.type).toBe('sale')
    expect(
      c.tokenTransfers
        .filter((t) => t.direction === 'in')
        .map((t) => t.amountWei),
    ).toEqual([203915000000n, 2039150000000n, 815660000000n])
    expect(c.wethInWei).toBe(203915000000n + 2039150000000n + 815660000000n)
    expect(c.nftType).toBe('Consumable Item')
    expect(c.nftTransfers.map((n) => n.quantity)).toEqual([1n, 10n, 4n])
  })

  it('ascension / atiablessing / evolution are picked by marker events even though the fee comes via a payment router', () => {
    const asc = classifyFixture('ascension')
    expect(asc.type).toBe('ascension')
    expect(asc.markers).toEqual(['AxieLevelAscended'])
    expect(asc.axsInWei).toBe(544734711993958715n)
    expect(asc.nftType).toBe('None')

    const atia = classifyFixture('atiablessing')
    expect(atia.type).toBe('atiablessing')
    expect(atia.axsInWei).toBe(5503501571762550615n)

    const evo = classifyFixture('evolution')
    expect(evo.type).toBe('evolution')
    expect(evo.nftType).toBe('Material')
    expect(evo.nftTransfers[0]).toMatchObject({
      nftType: 'Material',
      tokenId: 1120986464256n,
      quantity: 200n,
    })
  })

  it('mixed: two NFT kinds in one tx collapse to Mixed', () => {
    const c = classifyFixture('mixed')
    expect(c.nftType).toBe('Mixed')
    expect(c.nftTransfers.map((n) => n.nftType)).toEqual([
      'Consumable Item',
      'Material',
    ])
    expect(c.type).toBe('evolution')
  })

  it('unknown: AXS inflow with no NFT and no marker', () => {
    const c = classifyFixture('unknown')
    expect(c.type).toBe('unknown')
    expect(c.axsInWei).toBe(15n * 10n ** 18n)
    expect(c.nftType).toBe('None')
    expect(c.feeFroms).toEqual(['0xb4c12d442fb0f90eba1fe5c63498aa91c02bc183'])
  })
})
