import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { dashboardSnapshotSchema } from '@axie-gov/shared'
import type { Hex } from 'viem'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { backfill } from '../../src/commands/backfill.js'
import { closeContext, createContext } from '../../src/commands/shared.js'
import { verify } from '../../src/commands/verify.js'
import { loadConfig } from '../../src/config.js'
import { silentLogger } from '../../src/logger.js'
import type { AppContext } from '../../src/pipeline/context.js'
import { Stopper } from '../../src/pipeline/stop.js'

/**
 * Live test against the configured RPC (env: RONIN_RPC_URL, RONIN_API_KEY,
 * RPC_BATCH_SIZE...). Defaults target the public RPC's history window around
 * the `sale` fixture; override INTEGRATION_FROM / INTEGRATION_SALE for the
 * gateway once it serves the archive.
 */
const FROM = Number(process.env.INTEGRATION_FROM ?? 60_446_000)
const TO = FROM + 299
const SALE = (process.env.INTEGRATION_SALE ??
  '0xeae4135d0cd1bafcc5a34233286b180aa022d4bbafde38ccd3139ea6a5b6da16') as Hex

describe.runIf(process.env.INTEGRATION === '1')(
  'live indexing of a ~300-block range',
  () => {
    let dir: string
    let ctx: AppContext

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'axie-integration-'))
      const config = loadConfig({
        RONIN_RPC_URL:
          process.env.RONIN_RPC_URL ?? 'https://api.roninchain.com/rpc',
        RONIN_API_KEY: process.env.RONIN_API_KEY ?? 'unused',
        RPC_BATCH_SIZE: process.env.RPC_BATCH_SIZE ?? '3',
        RPC_START_RPS: process.env.RPC_START_RPS ?? '3',
        RPC_MAX_RPS: process.env.RPC_MAX_RPS ?? '3',
        RPC_CONCURRENCY: process.env.RPC_CONCURRENCY ?? '6',
        RANGE_START: '300',
        DB_PATH: join(dir, 'indexer.db'),
        SNAPSHOT_DIR: join(dir, 'snapshots'),
      })
      ctx = createContext(config, silentLogger)
    })

    afterAll(() => {
      closeContext(ctx)
      rmSync(dir, { recursive: true, force: true })
    })

    it('indexes the range, classifies the known sale, re-runs as a no-op, and writes a valid snapshot', async () => {
      const first = await backfill(ctx, {
        leg: 'treasury',
        from: FROM,
        to: TO,
        stop: new Stopper(),
      })
      const leg = first.legs[0]
      expect(leg?.cursorEnd).toBe(TO + 1)
      expect(leg?.insertedTxs).toBeGreaterThan(0)

      const sale = ctx.db
        .prepare(
          'SELECT type, nft_type, weth_in_wei, block FROM transactions WHERE hash = ?',
        )
        .get(SALE) as
        | { type: string; nft_type: string; weth_in_wei: string; block: number }
        | undefined
      expect(sale).toBeDefined()
      expect(sale?.type).toBe('sale')
      expect(sale?.block).toBeGreaterThanOrEqual(FROM)

      const counts = () => ({
        tx: (
          ctx.db.prepare('SELECT COUNT(*) n FROM transactions').get() as {
            n: number
          }
        ).n,
        tt: (
          ctx.db.prepare('SELECT COUNT(*) n FROM token_transfers').get() as {
            n: number
          }
        ).n,
        nft: (
          ctx.db.prepare('SELECT COUNT(*) n FROM nft_transfers').get() as {
            n: number
          }
        ).n,
        rollups: (
          ctx.db
            .prepare('SELECT COALESCE(SUM(tx_count),0) n FROM rollups_hourly')
            .get() as { n: number }
        ).n,
      })
      const c1 = counts()
      expect(c1.rollups).toBe(c1.tx)
      const orphanBlocks = (
        ctx.db
          .prepare(
            'SELECT COUNT(*) n FROM transactions t LEFT JOIN blocks b ON b.number = t.block WHERE b.number IS NULL',
          )
          .get() as { n: number }
      ).n
      expect(orphanBlocks).toBe(0)

      const second = await backfill(ctx, {
        leg: 'treasury',
        from: FROM,
        to: TO,
        stop: new Stopper(),
      })
      expect(second.legs[0]?.insertedTxs).toBe(0)
      expect(counts()).toEqual(c1)

      const snapshot = dashboardSnapshotSchema.parse(
        JSON.parse(
          readFileSync(join(dir, 'snapshots', 'dashboard.json'), 'utf8'),
        ),
      )
      expect(snapshot.indexer.lastIndexedBlock).toBe(TO)
      expect(snapshot.totals.txCount).toBe(c1.tx)

      const lines: string[] = []
      expect(await verify(ctx, {}, (l) => lines.push(l))).toBe(true)
      expect(lines.every((l) => l.startsWith('PASS'))).toBe(true)
    })
  },
)
