import { describe, expect, it } from 'vitest'

import {
  getMeta,
  getMetaBigInt,
  prepareStatements,
  sumWeiColumn,
} from '../src/db/statements.js'
import type { LegBatch } from '../src/db/writeBatch.js'
import { writeBatch } from '../src/db/writeBatch.js'
import { rebuildRollups } from '../src/rollups/rebuild.js'
import {
  fixtureNames,
  fixtureTx,
  memoryDb,
  ONE,
  syntheticTx,
} from './helpers.js'

const rollups = (db: ReturnType<typeof memoryDb>) =>
  db
    .prepare(
      'SELECT hour, type, nft_type, axs_in, weth_in, axs_out, weth_out, tx_count FROM rollups_hourly ORDER BY hour, type, nft_type',
    )
    .all()

function sampleBatch(): LegBatch {
  const h0 = 1_700_000_000 - (1_700_000_000 % 3600)
  const txs = [
    syntheticTx('0x' + 'a1'.repeat(32), 100, h0 + 10, {
      type: 'sale',
      nftType: 'Axie',
      wethIn: ONE / 1000n,
    }),
    syntheticTx('0x' + 'a2'.repeat(32), 101, h0 + 20, {
      type: 'sale',
      nftType: 'Axie',
      wethIn: ONE / 500n,
    }),
    syntheticTx('0x' + 'a3'.repeat(32), 102, h0 + 30, {
      type: 'rc-mint',
      nftType: 'Rune',
      axsIn: 3n * ONE,
    }),
    syntheticTx('0x' + 'a4'.repeat(32), 200, h0 + 3600 + 5, {
      type: 'ascension',
      nftType: 'None',
      axsIn: ONE / 10n,
    }),
    syntheticTx('0x' + 'a5'.repeat(32), 201, h0 + 3600 + 6, {
      type: 'outflow',
      nftType: 'None',
      axsOut: 1000n * ONE,
    }),
    ...fixtureNames().map((n) => fixtureTx(n)),
  ]
  const blocks = [
    ...new Map(
      txs.map((t) => [
        t.block,
        { number: t.block, ts: t.ts, source: 'rpc' as const },
      ]),
    ).values(),
  ]
  return { from: 100, to: 100_000_000, blocks, txs, bridgeEvents: [] }
}

describe('rollups', () => {
  it('incremental rollups and BigInt totals equal a full rebuild', () => {
    const db = memoryDb()
    const stmts = prepareStatements(db)
    const batch = sampleBatch()
    const r = writeBatch(db, stmts, batch, {
      cursorKey: 'cursor_treasury',
      committedAtKey: 'treasury_committed_at',
    })
    expect(r.insertedTxs).toBe(batch.txs.length)
    const incremental = rollups(db)
    const totalsIncremental = [
      'total_axs_in_wei',
      'total_weth_in_wei',
      'total_axs_out_wei',
      'total_weth_out_wei',
    ].map((k) => getMeta(stmts, k as 'total_axs_in_wei'))
    expect(incremental.length).toBeGreaterThan(3)

    rebuildRollups(db)
    expect(rollups(db)).toEqual(incremental)
    const totalsRebuilt = [
      'total_axs_in_wei',
      'total_weth_in_wei',
      'total_axs_out_wei',
      'total_weth_out_wei',
    ].map((k) => getMeta(stmts, k as 'total_axs_in_wei'))
    expect(totalsRebuilt).toEqual(totalsIncremental)
    expect(getMetaBigInt(stmts, 'total_axs_out_wei')).toBe(1000n * ONE)
    expect(getMetaBigInt(stmts, 'total_axs_in_wei')).toBe(
      sumWeiColumn(db, 'transactions', 'axs_in_wei'),
    )
    expect(getMeta(stmts, 'first_tx_block')).toBe('100')
    db.close()
  })

  it('applying the same batch twice changes nothing (idempotent reprocessing)', () => {
    const db = memoryDb()
    const stmts = prepareStatements(db)
    const batch = sampleBatch()
    writeBatch(db, stmts, batch, {
      cursorKey: 'cursor_treasury',
      committedAtKey: 'treasury_committed_at',
    })
    const before = rollups(db)
    const totals = getMetaBigInt(stmts, 'total_weth_in_wei')
    const counts = () => ({
      tx: (
        db.prepare('SELECT COUNT(*) n FROM transactions').get() as { n: number }
      ).n,
      tt: (
        db.prepare('SELECT COUNT(*) n FROM token_transfers').get() as {
          n: number
        }
      ).n,
      nft: (
        db.prepare('SELECT COUNT(*) n FROM nft_transfers').get() as {
          n: number
        }
      ).n,
    })
    const c1 = counts()
    const r2 = writeBatch(db, stmts, batch, {
      cursorKey: 'cursor_treasury',
      committedAtKey: 'treasury_committed_at',
    })
    expect(r2.insertedTxs).toBe(0)
    expect(r2.skippedTxs).toBe(batch.txs.length)
    expect(rollups(db)).toEqual(before)
    expect(getMetaBigInt(stmts, 'total_weth_in_wei')).toBe(totals)
    expect(counts()).toEqual(c1)
    expect(getMeta(stmts, 'cursor_treasury')).toBe(String(batch.to + 1))
    db.close()
  })

  it('stores exact wei, one row per fee transfer and per NFT (with quantities), and cascades on delete', () => {
    const db = memoryDb()
    const stmts = prepareStatements(db)
    writeBatch(
      db,
      stmts,
      {
        from: 1,
        to: 2,
        blocks: [{ number: 60446200, ts: 1788361187, source: 'rpc' }],
        txs: [fixtureTx('multi-fee')],
        bridgeEvents: [],
      },
      { cursorKey: 'cursor_treasury', committedAtKey: 'treasury_committed_at' },
    )
    const tx = db.prepare('SELECT * FROM transactions').get() as Record<
      string,
      unknown
    >
    expect(tx.weth_in_wei).toBe('3058725000000')
    expect(tx.weth_in).toBeCloseTo(0.000003058725, 15)
    expect(tx.type).toBe('sale')
    expect(tx.nft_count).toBe(3)
    expect(
      (
        db.prepare('SELECT COUNT(*) n FROM token_transfers').get() as {
          n: number
        }
      ).n,
    ).toBe(3)
    expect(
      db.prepare('SELECT quantity FROM nft_transfers ORDER BY log_index').all(),
    ).toEqual([{ quantity: '1' }, { quantity: '10' }, { quantity: '4' }])
    db.prepare('DELETE FROM transactions').run()
    expect(
      (
        db.prepare('SELECT COUNT(*) n FROM token_transfers').get() as {
          n: number
        }
      ).n,
    ).toBe(0)
    expect(
      (
        db.prepare('SELECT COUNT(*) n FROM nft_transfers').get() as {
          n: number
        }
      ).n,
    ).toBe(0)
    db.close()
  })

  it('an exact block timestamp replaces an interpolated one, never the reverse', () => {
    const db = memoryDb()
    const stmts = prepareStatements(db)
    stmts.insertBlock.run(5, 100, 'interp')
    stmts.insertBlock.run(5, 101, 'rpc')
    expect(
      db.prepare('SELECT ts, source FROM blocks WHERE number = 5').get(),
    ).toEqual({ ts: 101, source: 'rpc' })
    stmts.insertBlock.run(5, 102, 'interp')
    expect(
      db.prepare('SELECT ts, source FROM blocks WHERE number = 5').get(),
    ).toEqual({ ts: 101, source: 'rpc' })
    db.close()
  })

  it('sumWeiColumn is exact beyond 2^63', () => {
    const db = memoryDb()
    const stmts = prepareStatements(db)
    const big = 22_000_000n * ONE // > int64
    const txs = [
      syntheticTx('0x' + 'b1'.repeat(32), 1, 3600, { axsIn: big }),
      syntheticTx('0x' + 'b2'.repeat(32), 2, 3601, { axsIn: 123456789n }),
      syntheticTx('0x' + 'b3'.repeat(32), 3, 3602, { axsIn: 5n }),
    ]
    writeBatch(
      db,
      stmts,
      {
        from: 1,
        to: 3,
        blocks: txs.map((t) => ({
          number: t.block,
          ts: t.ts,
          source: 'rpc' as const,
        })),
        txs,
        bridgeEvents: [],
      },
      { cursorKey: 'cursor_treasury', committedAtKey: 'treasury_committed_at' },
    )
    expect(sumWeiColumn(db, 'transactions', 'axs_in_wei')).toBe(
      big + 123456789n + 5n,
    )
    expect(getMetaBigInt(stmts, 'total_axs_in_wei')).toBe(big + 123456789n + 5n)
    db.close()
  })
})
