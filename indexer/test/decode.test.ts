import {
  abiEvent,
  ADDRESSES,
  erc1155EventsAbi,
  roninGatewayAbi,
  TRANSFER_BATCH_TOPIC,
  TRANSFER_SINGLE_TOPIC,
  TRANSFER_TOPIC,
} from '@axie-gov/shared'
import type { Address, Hex } from 'viem'
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  padHex,
  toHex,
} from 'viem'
import { describe, expect, it } from 'vitest'

import { decodeLog, decodeLogs } from '../src/decode/decodeLog.js'
import { lookupContract, REGISTRY } from '../src/decode/registry.js'
import type { RawLog } from '../src/rpc/methods.js'
import { fixtureLogs } from './helpers.js'

const rawLog = (
  address: Address,
  topics: Hex[],
  data: Hex,
  logIndex = 0,
): RawLog => ({
  address,
  topics: topics as RawLog['topics'],
  data,
  blockNumber: 1,
  transactionHash: ('0x' + '11'.repeat(32)) as Hex,
  transactionIndex: 0,
  logIndex,
  removed: false,
})

const ALICE = '0x00000000000000000000000000000000000a11ce' as Address
const BOB = '0x0000000000000000000000000000000000000b0b' as Address

describe('selectors', () => {
  it('pins the canonical topic0 constants', () => {
    expect(TRANSFER_TOPIC).toBe(
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    )
    expect(TRANSFER_SINGLE_TOPIC).toBe(
      '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
    )
    expect(TRANSFER_BATCH_TOPIC).toBe(
      '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
    )
  })

  it('registers ERC-20 and ERC-721 Transfer under the same topic0, dispatched by address', () => {
    expect(
      lookupContract(ADDRESSES.AXS)?.events.get(TRANSFER_TOPIC)?.kind,
    ).toBe('erc20Transfer')
    expect(
      lookupContract(ADDRESSES.AXIE)?.events.get(TRANSFER_TOPIC)?.kind,
    ).toBe('erc721Transfer')
    expect(
      lookupContract(ADDRESSES.RUNE)?.events.get(TRANSFER_SINGLE_TOPIC)?.kind,
    ).toBe('erc1155Single')
    expect(
      lookupContract(ADDRESSES.RUNE)?.events.get(TRANSFER_BATCH_TOPIC)?.kind,
    ).toBe('erc1155Batch')
    expect(REGISTRY.size).toBe(16)
  })

  it('registers marker and bridge events by name from the project ABIs', () => {
    const names = (addr: Address) =>
      [...(lookupContract(addr)?.events.values() ?? [])]
        .map((e) => `${e.kind}:${e.name}`)
        .sort()
    expect(names(ADDRESSES.AXIE)).toEqual([
      'erc721Transfer:Transfer',
      'marker:AxieSpawn',
    ])
    expect(names(ADDRESSES.AXIE_ASCEND)).toEqual(['marker:AxieLevelAscended'])
    expect(names(ADDRESSES.ATIAS_BLESSING)).toEqual([
      'marker:PrayerCountSynced',
    ])
    expect(names(ADDRESSES.PART_EVOLUTION)).toEqual([
      'marker:PartEvolutionCreated',
    ])
    expect(names(ADDRESSES.RONIN_GATEWAY)).toEqual([
      'bridge:Deposited',
      'bridge:WithdrawalRequested',
    ])
    expect(
      lookupContract(ADDRESSES.RONIN_GATEWAY)?.events.has(
        '0x8d20d8121a34dded9035ff5b43e901c142824f7a22126392992c353c37890524',
      ),
    ).toBe(true)
    expect(
      lookupContract(ADDRESSES.RONIN_GATEWAY)?.events.has(
        '0xf313c253a5be72c29d0deb2c8768a9543744ac03d6b3cafd50cc976f1c2632fc',
      ),
    ).toBe(true)
  })
})

describe('decodeLog', () => {
  it('decodes an ERC-20 Transfer on AXS with lowercase addresses and bigint value', () => {
    const topics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: { from: ALICE, to: BOB },
    })
    const d = decodeLog(
      rawLog(
        ADDRESSES.AXS,
        topics as Hex[],
        toHex(5n * 10n ** 18n, { size: 32 }),
      ),
    )
    expect(d).toMatchObject({
      kind: 'erc20Transfer',
      token: 'AXS',
      contract: 'AXS',
      from: ALICE,
      to: BOB,
      value: 5n * 10n ** 18n,
    })
  })

  it('decodes the same topic0 as an ERC-721 Transfer on the Axie contract', () => {
    const topics = encodeEventTopics({
      abi: erc721Abi,
      eventName: 'Transfer',
      args: { from: ALICE, to: BOB, tokenId: 12229249n },
    })
    const d = decodeLog(rawLog(ADDRESSES.AXIE, topics as Hex[], '0x'))
    expect(d).toMatchObject({
      kind: 'erc721Transfer',
      nftType: 'Axie',
      from: ALICE,
      to: BOB,
      tokenId: 12229249n,
    })
  })

  it('ignores logs from unknown addresses and untracked events on known ones', () => {
    const topics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: { from: ALICE, to: BOB },
    })
    expect(
      decodeLog(
        rawLog(
          '0x000000000000000000000000000000000000dead',
          topics as Hex[],
          toHex(1n, { size: 32 }),
        ),
      ),
    ).toBeUndefined()
    const approval = keccak256(toHex('Approval(address,address,uint256)'))
    expect(
      decodeLog(
        rawLog(
          ADDRESSES.AXS,
          [approval, padHex(ALICE, { size: 32 }), padHex(BOB, { size: 32 })],
          toHex(1n, { size: 32 }),
        ),
      ),
    ).toBeUndefined()
  })

  it('skips (does not throw on) a log that fails strict decoding', () => {
    // ERC-721 Transfer with only 3 topics (non-indexed tokenId) on the Axie contract
    const topics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: { from: ALICE, to: BOB },
    })
    expect(
      decodeLog(rawLog(ADDRESSES.AXIE, topics as Hex[], '0x')),
    ).toBeUndefined()
  })

  it('decodes TransferBatch with ids and values', () => {
    const topics = encodeEventTopics({
      abi: erc1155EventsAbi,
      eventName: 'TransferBatch',
      args: { operator: ALICE, from: ALICE, to: BOB },
    })
    const data = encodeAbiParameters(
      [{ type: 'uint256[]' }, { type: 'uint256[]' }],
      [
        [1n, 2n, 3n],
        [10n, 20n, 30n],
      ],
    )
    const d = decodeLog(rawLog(ADDRESSES.RUNE, topics as Hex[], data, 7))
    expect(d).toMatchObject({
      kind: 'erc1155Batch',
      nftType: 'Rune',
      operator: ALICE,
      from: ALICE,
      to: BOB,
      ids: [1n, 2n, 3n],
      values: [10n, 20n, 30n],
      logIndex: 7,
    })
  })

  it('decodes gateway Deposited and WithdrawalRequested receipts (the latter has an unnamed struct in the ABI)', () => {
    const receipt = {
      id: 42n,
      kind: 0,
      mainchain: { addr: ALICE, tokenAddr: BOB, chainId: 1n },
      ronin: {
        addr: ADDRESSES.TREASURY,
        tokenAddr: ADDRESSES.WETH,
        chainId: 2020n,
      },
      info: { erc: 0, id: 0n, quantity: 7n * 10n ** 17n },
    }
    for (const name of ['Deposited', 'WithdrawalRequested'] as const) {
      const ev = abiEvent(roninGatewayAbi, name)
      const topics = encodeEventTopics({ abi: [ev], eventName: name })
      const data = encodeAbiParameters(ev.inputs, [
        ('0x' + 'ab'.repeat(32)) as Hex,
        receipt,
      ])
      const d = decodeLog(
        rawLog(ADDRESSES.RONIN_GATEWAY, topics as Hex[], data),
      )
      expect(d).toMatchObject({
        kind: 'bridge',
        event: name,
        receiptId: 42n,
        receiptKind: 0,
        roninAddr: ADDRESSES.TREASURY,
        roninTokenAddr: ADDRESSES.WETH,
        mainchainAddr: ALICE,
        erc: 0,
        quantity: 7n * 10n ** 17n,
      })
    }
  })

  it('decodes every tracked log of the sale fixture and drops the rest', () => {
    const logs = fixtureLogs('sale')
    const decoded = decodeLogs(logs)
    expect(logs).toHaveLength(6)
    expect(decoded.map((d) => d.kind)).toEqual([
      'erc20Transfer',
      'erc20Transfer',
      'erc20Transfer',
      'erc721Transfer',
    ])
    for (const d of decoded) expect(d.address).toBe(d.address.toLowerCase())
  })
})

const erc20Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const
const erc721Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const
