import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  dashboardSnapshotSchema,
  DAY,
  floorMonth,
  HOUR,
  RANGE_KEYS,
} from '@axie-gov/shared'
import { describe, expect, it } from 'vitest'

import { prepareStatements } from '../src/db/statements.js'
import type { BridgeEventRow, TxWithTs } from '../src/db/writeBatch.js'
import { writeBatch } from '../src/db/writeBatch.js'
import { buildSnapshot } from '../src/snapshot/build.js'
import { writeSnapshot } from '../src/snapshot/write.js'
import { memoryDb, ONE, syntheticTx, testConfig } from './helpers.js'

// a fixed "now" that is not bucket-aligned: 2026-09-02T12:34:56Z
const NOW = Date.UTC(2026, 8, 2, 12, 34, 56) / 1000
const FIRST_TX_TS = Date.UTC(2022, 9, 11, 3, 0, 0) / 1000

function seed() {
  const db = memoryDb()
  const stmts = prepareStatements(db)
  const txs: TxWithTs[] = []
  let i = 0
  const add = (ts: number, o: Parameters<typeof syntheticTx>[3]) => {
    i += 1
    txs.push(
      syntheticTx(
        '0x' + i.toString(16).padStart(64, '0'),
        16_400_000 + i,
        ts,
        o,
      ),
    )
  }
  add(FIRST_TX_TS, { type: 'sale', nftType: 'Axie', wethIn: ONE })
  add(FIRST_TX_TS + 30 * DAY, {
    type: 'unknown',
    nftType: 'None',
    axsIn: 22_000_000n * ONE,
  }) // the big Oct-2022 inflow
  for (let d = 401; d > 1; d -= 7)
    add(NOW - d * DAY, { type: 'rc-mint', nftType: 'Rune', axsIn: 10n * ONE })
  for (let h = 200; h > 0; h -= 5)
    add(NOW - h * HOUR, { type: 'sale', nftType: 'Axie', wethIn: ONE / 100n })
  add(NOW - 2 * HOUR, { type: 'ascension', nftType: 'None', axsIn: ONE })
  add(NOW - HOUR, { type: 'outflow', nftType: 'None', axsOut: 500n * ONE })
  add(NOW - 600, { type: 'sale', nftType: 'Charm', wethIn: ONE / 50n })
  const blocks = txs.map((t) => ({
    number: t.block,
    ts: t.ts,
    source: 'rpc' as const,
  }))
  const bridgeEvents: BridgeEventRow[] = [
    {
      txHash: '0x' + 'c1'.repeat(32),
      logIndex: 1,
      block: 20_000_000,
      ts: NOW - 100 * DAY,
      kind: 'deposit',
      token: 'WETH',
      amountWei: 100n * ONE,
      amount: 100,
      address: '0x245db945c485b68fdc429e4f7085a1761aa4d45d',
      receiptId: '1',
    },
    {
      txHash: '0x' + 'c2'.repeat(32),
      logIndex: 1,
      block: 20_000_001,
      ts: NOW - 99 * DAY,
      kind: 'deposit',
      token: 'WETH',
      amountWei: 50n * ONE,
      amount: 50,
      address: '0x000000000000000000000000000000000000beef',
      receiptId: '2',
    },
    {
      txHash: '0x' + 'c3'.repeat(32),
      logIndex: 1,
      block: 20_000_002,
      ts: NOW - 98 * DAY,
      kind: 'withdrawal',
      token: 'WETH',
      amountWei: 30n * ONE,
      amount: 30,
      address: '0x000000000000000000000000000000000000beef',
      receiptId: '3',
    },
    {
      txHash: '0x' + 'c4'.repeat(32),
      logIndex: 1,
      block: 20_000_003,
      ts: NOW - 97 * DAY,
      kind: 'deposit',
      token: 'AXS',
      amountWei: 7n * ONE,
      amount: 7,
      address: '0x000000000000000000000000000000000000beef',
      receiptId: '4',
    },
    {
      txHash: '0x' + 'c5'.repeat(32),
      logIndex: 1,
      block: 20_000_004,
      ts: NOW - 96 * DAY,
      kind: 'deposit',
      token: '0x0000000000000000000000000000000000000usd',
      amountWei: 5_000_000n,
      amount: 0,
      address: '0x000000000000000000000000000000000000beef',
      receiptId: '5',
    },
  ]
  writeBatch(
    db,
    stmts,
    { from: 16_377_111, to: 60_000_000, blocks, txs, bridgeEvents: [] },
    { cursorKey: 'cursor_treasury', committedAtKey: 'treasury_committed_at' },
  )
  writeBatch(
    db,
    stmts,
    { from: 14_765_762, to: 59_999_000, blocks: [], txs: [], bridgeEvents },
    { cursorKey: 'cursor_bridge', committedAtKey: 'bridge_committed_at' },
  )
  return { db, txs }
}

const rates = {
  axsUsd: 0.9,
  ethUsd: 2400,
  fetchedAt: new Date(NOW * 1000).toISOString(),
  stale: false,
}

describe('snapshot', () => {
  const config = testConfig()

  it('validates against the shared schema and reports indexer state', () => {
    const { db, txs } = seed()
    const { dashboard, health } = buildSnapshot(db, config, {
      now: NOW,
      head: 60_000_100,
      headAt: NOW - 20,
      rates,
    })
    expect(() => dashboardSnapshotSchema.parse(dashboard)).not.toThrow()
    expect(dashboard.indexer.lastIndexedBlock).toBe(60_000_000)
    expect(dashboard.indexer.lagBlocks).toBe(100)
    expect(dashboard.indexer.status).toBe('live')
    expect(dashboard.indexer.txCount).toBe(txs.length)
    expect(dashboard.indexer.firstTxAt).toBe(
      new Date(FIRST_TX_TS * 1000).toISOString(),
    )
    expect(dashboard.indexer.bridgeLastIndexedBlock).toBe(59_999_000)
    expect(dashboard.totals.outflow.axs).toBe(500)
    expect(dashboard.totals.exact.axsOutWei).toBe((500n * ONE).toString())
    expect(dashboard.totals.net.axs).toBeCloseTo(
      dashboard.totals.inflow.axs - 500,
      6,
    )
    expect(health.ok).toBe(true)
    expect(health.lagBlocks).toBe(100)
    db.close()
  })

  it('bridge totals use WETH only; treasury subset filters by ronin address', () => {
    const { db } = seed()
    const { dashboard } = buildSnapshot(db, config, {
      now: NOW,
      head: null,
      headAt: null,
      rates,
    })
    expect(dashboard.bridge.all).toEqual({
      deposited: 150,
      withdrawn: 30,
      net: 120,
    })
    expect(dashboard.bridge.treasury).toEqual({
      deposited: 100,
      withdrawn: 0,
      net: 100,
    })
    expect(dashboard.bridge.eventCount).toBe(5)
    expect(dashboard.chain.headAt).toBeNull()
    db.close()
  })

  it('emits dense, ascending series with the expected lengths for a fixed now', () => {
    const { db } = seed()
    const { dashboard } = buildSnapshot(db, config, {
      now: NOW,
      head: 60_000_100,
      headAt: NOW,
      rates,
    })
    const len = (k: (typeof RANGE_KEYS)[number]) =>
      dashboard.ranges[k].series.length
    expect(len('24h')).toBe(25)
    expect(len('7d')).toBe(22)
    expect(len('30d')).toBe(31)
    expect(len('6m')).toBeGreaterThanOrEqual(26)
    expect(len('6m')).toBeLessThanOrEqual(28)
    expect(len('1y')).toBe(13)
    const months = (2026 - 2022) * 12 + (8 - 9) + 1 // Oct 2022 .. Sep 2026 inclusive
    expect(len('all')).toBe(months)
    expect(dashboard.ranges.all.windowStart).toBe(floorMonth(FIRST_TX_TS))
    for (const k of RANGE_KEYS) {
      const s = dashboard.ranges[k].series
      for (let i = 1; i < s.length; i++)
        expect(s[i]!.t).toBeGreaterThan(s[i - 1]!.t)
      expect(s[0]!.t).toBeLessThanOrEqual(dashboard.ranges[k].windowStart)
      expect(dashboard.ranges[k].windowEnd).toBe(NOW)
    }
    db.close()
  })

  it('baseline + sum(series) equals total inflow for every range, and the breakdown is consistent', () => {
    const { db } = seed()
    const { dashboard } = buildSnapshot(db, config, {
      now: NOW,
      head: 60_000_100,
      headAt: NOW,
      rates,
    })
    for (const k of RANGE_KEYS) {
      const r = dashboard.ranges[k]
      const sumAxs = r.series.reduce((a, p) => a + p.axs, 0)
      const sumWeth = r.series.reduce((a, p) => a + p.weth, 0)
      expect(r.baseline.axs + sumAxs).toBeCloseTo(
        dashboard.totals.inflow.axs,
        4,
      )
      expect(r.baseline.weth + sumWeth).toBeCloseTo(
        dashboard.totals.inflow.weth,
        9,
      )
      const byTypeAxs = r.byType.reduce((a, p) => a + p.axs, 0)
      const byNftAxs = r.byNftType.reduce((a, p) => a + p.axs, 0)
      const bdAxs = r.breakdown.reduce((a, p) => a + p.axs, 0)
      expect(byTypeAxs).toBeCloseTo(sumAxs, 6)
      expect(byNftAxs).toBeCloseTo(sumAxs, 6)
      expect(bdAxs).toBeCloseTo(sumAxs, 6)
      expect(r.byType.reduce((a, p) => a + p.txCount, 0)).toBe(
        r.series.reduce((a, p) => a + p.txCount, 0),
      )
    }
    expect(dashboard.ranges.all.baseline).toEqual({ axs: 0, weth: 0 })
    expect(dashboard.ranges['24h'].byType.map((b) => b.type)).toEqual([
      'sale',
      'ascension',
      'outflow',
    ])
    expect(
      dashboard.ranges['24h'].byType.find((b) => b.type === 'outflow'),
    ).toMatchObject({ axs: 0, weth: 0, txCount: 1 })
    expect(dashboard.ranges['24h'].breakdown).toContainEqual(
      expect.objectContaining({ type: 'sale', nftType: 'Charm', txCount: 1 }),
    )
    db.close()
  })

  it('writes both files atomically, well under 100 KB, and round-trips through the schema', () => {
    const { db } = seed()
    const dir = mkdtempSync(join(tmpdir(), 'axie-snap-'))
    try {
      const pair = buildSnapshot(db, config, {
        now: NOW,
        head: 60_000_100,
        headAt: NOW,
        rates,
      })
      const w = writeSnapshot(dir, pair)
      expect(w.dashboardBytes).toBeLessThan(100_000)
      const parsed = dashboardSnapshotSchema.parse(
        JSON.parse(readFileSync(w.dashboardPath, 'utf8')),
      )
      expect(parsed.generatedAt).toBe(pair.dashboard.generatedAt)
      expect(JSON.parse(readFileSync(w.healthPath, 'utf8'))).toEqual(
        pair.health,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
      db.close()
    }
  })

  it('reports backfilling when lag exceeds the stale threshold and copes with an empty database', () => {
    const db = memoryDb()
    const { dashboard, health } = buildSnapshot(db, config, {
      now: NOW,
      head: 60_000_000,
      headAt: NOW,
      rates: { ...rates, stale: true },
    })
    expect(() => dashboardSnapshotSchema.parse(dashboard)).not.toThrow()
    expect(dashboard.indexer.status).toBe('backfilling')
    expect(dashboard.indexer.lastIndexedBlock).toBe(config.START_BLOCK - 1)
    expect(dashboard.indexer.txCount).toBe(0)
    expect(dashboard.ranges.all.series.length).toBe(1)
    expect(health.ok).toBe(false)
    expect(health.ratesStale).toBe(true)
    db.close()
  })

  it('never reports live/ok when the chain head is unknown (RPC unreachable)', () => {
    const { db } = seed()
    const { dashboard, health } = buildSnapshot(db, config, {
      now: NOW,
      head: null,
      headAt: null,
      rates,
    })
    expect(() => dashboardSnapshotSchema.parse(dashboard)).not.toThrow()
    expect(dashboard.chain.headAt).toBeNull()
    expect(dashboard.indexer.status).toBe('backfilling')
    expect(health.ok).toBe(false)
    db.close()
  })
})
