import { bridgeLeg } from '../legs/bridge.js'
import type { Leg } from '../legs/leg.js'
import { treasuryLeg } from '../legs/treasury.js'
import type { AppContext } from '../pipeline/context.js'
import { LegRunner, runLegToEnd } from '../pipeline/runLeg.js'
import type { Stopper } from '../pipeline/stop.js'
import { RatesTracker } from '../snapshot/rates.js'
import { snapshotNow } from './shared.js'

export type LegChoice = 'treasury' | 'bridge' | 'all'

export interface BackfillOptions {
  leg: LegChoice
  from?: number
  to?: number
  stop: Stopper
}

export interface BackfillSummary {
  legs: Array<{
    leg: Leg['name']
    cursorStart: number
    cursorEnd: number
    insertedTxs: number
    insertedBridge: number
    batches: number
  }>
}

/**
 * Same loop as `tail`, but exits when every selected leg is caught up (or
 * `--to` is reached). `--from/--to` bound a run for smoke tests; without them
 * the stored cursor is used.
 */
export async function backfill(
  ctx: AppContext,
  opts: BackfillOptions,
): Promise<BackfillSummary> {
  const legs: Leg[] =
    opts.leg === 'all'
      ? [treasuryLeg, bridgeLeg]
      : opts.leg === 'treasury'
        ? [treasuryLeg]
        : [bridgeLeg]
  const rates = new RatesTracker(ctx.config, ctx.stmts, ctx.log)
  const summary: BackfillSummary = { legs: [] }
  let lastSnapshotAt = 0

  for (const leg of legs) {
    if (opts.stop.requested) break
    const runner = new LegRunner(ctx, leg, {
      from: opts.from,
      to: opts.to,
      stop: opts.stop,
    })
    const cursorStart = runner.cursor
    const entry = {
      leg: leg.name,
      cursorStart,
      cursorEnd: cursorStart,
      insertedTxs: 0,
      insertedBridge: 0,
      batches: 0,
    }
    ctx.log.info(
      { leg: leg.name, from: cursorStart, to: opts.to ?? 'head' },
      'backfill starting',
    )
    await runLegToEnd(runner, opts.stop, async (info) => {
      entry.batches += 1
      entry.insertedTxs += info.result.insertedTxs
      entry.insertedBridge += info.result.insertedBridge
      const now = Date.now()
      if (now - lastSnapshotAt >= ctx.config.SNAPSHOT_INTERVAL_MS) {
        lastSnapshotAt = now
        await rates.refreshIfDue(now)
        await snapshotNow(ctx, rates).catch((err: Error) =>
          ctx.log.warn({ err: err.message }, 'periodic snapshot failed'),
        )
      }
    })
    entry.cursorEnd = runner.cursor
    summary.legs.push(entry)
    ctx.log.info(
      {
        ...entry,
        logBlockTimestamp: ctx.rpc.features.logBlockTimestamp,
        rpc: ctx.rpc.counters(),
      },
      opts.stop.requested ? 'backfill interrupted' : 'backfill leg finished',
    )
  }
  await rates.refreshIfDue(Date.now())
  await snapshotNow(ctx, rates)
  return summary
}
