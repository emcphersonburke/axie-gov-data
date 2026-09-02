import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Hex } from 'viem'

import type { ClassifiedTx } from '../src/classify/classify.js'
import { classifyTx } from '../src/classify/classify.js'
import type { Fixture } from '../src/commands/fixture.js'
import type { Config } from '../src/config.js'
import { loadConfig } from '../src/config.js'
import type { Db } from '../src/db/open.js'
import { openDb } from '../src/db/open.js'
import type { TxWithTs } from '../src/db/writeBatch.js'
import { decodeLogs } from '../src/decode/decodeLog.js'
import type { RawLog, RawReceipt } from '../src/rpc/methods.js'
import { normalizeReceipt } from '../src/rpc/methods.js'

export const FIXTURE_DIR = fileURLToPath(
  new URL('./fixtures/', import.meta.url),
)

export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

export function loadFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'),
  ) as Fixture
}

export function fixtureReceipt(name: string): RawReceipt {
  return normalizeReceipt(loadFixture(name).receipt)
}

export function fixtureLogs(name: string): RawLog[] {
  return fixtureReceipt(name).logs
}

export function fixtureTimestamp(name: string): number {
  return Number(loadFixture(name).block.timestamp)
}

/** Decode + classify one fixture the same way the treasury leg does. */
export function classifyFixture(name: string): ClassifiedTx {
  const r = fixtureReceipt(name)
  return classifyTx({
    hash: r.transactionHash,
    block: r.blockNumber,
    txIndex: r.transactionIndex,
    from: r.from,
    to: r.to,
    logs: decodeLogs(r.logs),
  })
}

export function fixtureTx(name: string): TxWithTs {
  return { ...classifyFixture(name), ts: fixtureTimestamp(name) }
}

export function memoryDb(): Db {
  return openDb(':memory:')
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig(
    {
      RONIN_API_KEY: 'test-key',
      DB_PATH: ':memory:',
      SNAPSHOT_DIR: '/tmp/axie-indexer-test-snapshots',
      ...overrides,
    },
    { ensureDirs: false },
  )
}

/** A synthetic classified tx for rollup/snapshot tests. */
export function syntheticTx(
  hash: string,
  block: number,
  ts: number,
  opts: Partial<Pick<ClassifiedTx, 'type' | 'nftType'>> & {
    axsIn?: bigint
    wethIn?: bigint
    axsOut?: bigint
    wethOut?: bigint
  } = {},
): TxWithTs {
  const axsIn = opts.axsIn ?? 0n
  const wethIn = opts.wethIn ?? 0n
  const axsOut = opts.axsOut ?? 0n
  const wethOut = opts.wethOut ?? 0n
  const tokenTransfers: ClassifiedTx['tokenTransfers'] = []
  let li = 0
  const treasury = '0x245db945c485b68fdc429e4f7085a1761aa4d45d' as const
  const other = '0x000000000000000000000000000000000000beef' as const
  if (axsIn > 0n)
    tokenTransfers.push({
      logIndex: li++,
      token: 'AXS',
      direction: 'in',
      from: other,
      to: treasury,
      amountWei: axsIn,
    })
  if (wethIn > 0n)
    tokenTransfers.push({
      logIndex: li++,
      token: 'WETH',
      direction: 'in',
      from: other,
      to: treasury,
      amountWei: wethIn,
    })
  if (axsOut > 0n)
    tokenTransfers.push({
      logIndex: li++,
      token: 'AXS',
      direction: 'out',
      from: treasury,
      to: other,
      amountWei: axsOut,
    })
  if (wethOut > 0n)
    tokenTransfers.push({
      logIndex: li++,
      token: 'WETH',
      direction: 'out',
      from: treasury,
      to: other,
      amountWei: wethOut,
    })
  return {
    hash: hash as Hex,
    block,
    txIndex: 0,
    from: other,
    to: other,
    type: opts.type ?? (axsIn > 0n || wethIn > 0n ? 'unknown' : 'outflow'),
    nftType: opts.nftType ?? 'None',
    nftCount: 0,
    axsInWei: axsIn,
    wethInWei: wethIn,
    axsOutWei: axsOut,
    wethOutWei: wethOut,
    tokenTransfers,
    nftTransfers: [],
    feeFroms: [],
    markers: [],
    ts,
  }
}

export const ONE = 10n ** 18n
