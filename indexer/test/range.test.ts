import { ADDRESSES } from '@axie-gov/shared'
import type { Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import { groupTxLogs, RANGE_ADDRESSES } from '../src/fetch/range.js'
import type { RawLog } from '../src/rpc/methods.js'

const log = (hash: Hex, logIndex: number, address: Hex, block = 100): RawLog =>
  ({
    address,
    blockNumber: block,
    transactionHash: hash,
    transactionIndex: 3,
    logIndex,
    topics: [],
    data: '0x',
  }) as unknown as RawLog

describe('range strategy', () => {
  it('sweeps NFT, marker and gateway contracts but not AXS/WETH or the marketplace', () => {
    expect(RANGE_ADDRESSES).toContain(ADDRESSES.AXIE)
    expect(RANGE_ADDRESSES).toContain(ADDRESSES.ATIAS_BLESSING)
    expect(RANGE_ADDRESSES).toContain(ADDRESSES.RONIN_GATEWAY)
    expect(RANGE_ADDRESSES).not.toContain(ADDRESSES.AXS)
    expect(RANGE_ADDRESSES).not.toContain(ADDRESSES.WETH)
    expect(RANGE_ADDRESSES).not.toContain(ADDRESSES.MARKETPLACE)
  })
  it('merges discovered transfers with range logs per wanted tx, deduped and ordered', () => {
    const h1 = '0x01' as Hex
    const h2 = '0x02' as Hex
    const other = '0x03' as Hex
    const discovered = [log(h1, 5, ADDRESSES.AXS), log(h2, 1, ADDRESSES.WETH)]
    const range = [
      log(h1, 2, ADDRESSES.AXIE),
      log(h1, 5, ADDRESSES.AXS), // duplicate of a discovered log
      log(other, 0, ADDRESSES.AXIE), // not wanted
      log(h2, 0, ADDRESSES.ATIAS_BLESSING),
    ]
    const out = groupTxLogs([h1, h2], discovered, range)
    expect([...out.keys()]).toEqual([h1, h2])
    expect(out.get(h1)!.logs.map((l) => l.logIndex)).toEqual([2, 5])
    expect(out.get(h2)!.logs.map((l) => l.logIndex)).toEqual([0, 1])
    expect(out.get(h1)!.from).toBeNull()
    expect(out.get(h1)!.txIndex).toBe(3)
  })
})
