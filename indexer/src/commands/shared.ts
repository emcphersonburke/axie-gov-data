import type { Config } from '../config.js'
import { openDb } from '../db/open.js'
import { prepareStatements } from '../db/statements.js'
import { createStrategy } from '../fetch/txLogs.js'
import type { Logger } from '../logger.js'
import type { AppContext } from '../pipeline/context.js'
import { Rpc } from '../rpc/client.js'
import { getBlockHeader } from '../rpc/methods.js'
import { buildSnapshot } from '../snapshot/build.js'
import type { RatesTracker } from '../snapshot/rates.js'
import type { WrittenSnapshot } from '../snapshot/write.js'
import { writeSnapshot } from '../snapshot/write.js'

export function createContext(config: Config, log: Logger): AppContext {
  const db = openDb(config.DB_PATH)
  return {
    config,
    log,
    rpc: new Rpc(config, log),
    db,
    stmts: prepareStatements(db),
    strategy: createStrategy(config.LOG_FETCH_STRATEGY),
  }
}

export function closeContext(ctx: AppContext): void {
  ctx.rpc.dispose()
  ctx.db.close()
}

/** Fetch the head header (best effort), build and atomically write dashboard.json + health.json. */
export async function snapshotNow(
  ctx: AppContext,
  rates: RatesTracker,
): Promise<WrittenSnapshot> {
  let head: { number: number; timestamp: number } | null = null
  try {
    head = await getBlockHeader(ctx.rpc, 'latest')
  } catch (err) {
    ctx.log.warn(
      { err: (err as Error).message },
      'could not fetch head for snapshot; using cursor',
    )
  }
  const pair = buildSnapshot(ctx.db, ctx.config, {
    now: Math.floor(Date.now() / 1000),
    head: head?.number ?? null,
    headAt: head?.timestamp ?? null,
    rates: rates.current(),
  })
  const written = writeSnapshot(ctx.config.SNAPSHOT_DIR, pair)
  ctx.log.info(
    {
      path: written.dashboardPath,
      bytes: written.dashboardBytes,
      status: pair.dashboard.indexer.status,
      lag: pair.dashboard.indexer.lagBlocks,
    },
    'snapshot written',
  )
  return written
}

export function parseIntArg(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value.replace(/[_,]/g, ''))
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`--${name} must be a non-negative integer`)
  return n
}
