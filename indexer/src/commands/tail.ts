import { checkpoint } from '../db/open.js'
import { getMeta } from '../db/statements.js'
import { bridgeLeg } from '../legs/bridge.js'
import { treasuryLeg } from '../legs/treasury.js'
import type { AppContext } from '../pipeline/context.js'
import { LegRunner } from '../pipeline/runLeg.js'
import type { Stopper } from '../pipeline/stop.js'
import { RatesTracker } from '../snapshot/rates.js'
import { snapshotNow } from './shared.js'

/** Upper bound for the failure back-off between leg steps. */
const MAX_FAILURE_BACKOFF_MS = 10 * 60_000

/** Minimum gap between snapshots while batches are flying in during catch-up. */
const SNAPSHOT_MIN_GAP_MS = 10_000

/**
 * Forever: step each leg (one batch or idle), refresh rates every
 * RATES_INTERVAL_MS, snapshot after commits and at least every
 * SNAPSHOT_INTERVAL_MS, checkpoint the WAL every ~10 min, sleep when both legs
 * are caught up. Returns when `stop` is requested, after the in-flight batch.
 */
export async function tail(ctx: AppContext, stop: Stopper): Promise<void> {
  const { config, log } = ctx
  if (getMeta(ctx.stmts, 'rollups_dirty') === '1')
    log.warn('rollups are marked dirty; run `rebuild-rollups`')
  const runners = [
    new LegRunner(ctx, treasuryLeg, { stop }),
    new LegRunner(ctx, bridgeLeg, { stop }),
  ]
  const rates = new RatesTracker(config, ctx.stmts, log)
  await rates.refreshIfDue(Date.now(), true)

  let lastSnapshotAt = 0
  let lastCheckpointAt = Date.now()
  let pendingSnapshot = true
  let probeLogged = false
  // Consecutive step failures back off exponentially (15 s → 30 s → … → 10 min) so a provider
  // that is down or refusing us is not hammered every poll interval.
  let consecutiveFailures = 0

  while (!stop.requested) {
    let allIdle = true
    for (const runner of runners) {
      if (stop.requested) break
      try {
        const r = await runner.step()
        consecutiveFailures = 0
        if (r === 'committed') {
          pendingSnapshot = true
          allIdle = false
        } else if (r === 'retry') allIdle = false
      } catch (err) {
        allIdle = false
        consecutiveFailures += 1
        const waitMs = Math.min(
          config.TAIL_SLEEP_MS * 2 ** Math.min(consecutiveFailures - 1, 8),
          MAX_FAILURE_BACKOFF_MS,
        )
        log.error(
          {
            leg: runner.leg.name,
            attempt: consecutiveFailures,
            waitMs,
            err: (err as Error).message,
          },
          'leg step failed; backing off',
        )
        await stop.sleep(waitMs)
      }
    }
    if (!probeLogged && ctx.rpc.features.logBlockTimestamp !== undefined) {
      probeLogged = true
      log.info(
        { logBlockTimestamp: ctx.rpc.features.logBlockTimestamp },
        'eth_getLogs blockTimestamp probe',
      )
    }
    await rates.refreshIfDue()
    const now = Date.now()
    if (
      (pendingSnapshot && now - lastSnapshotAt >= SNAPSHOT_MIN_GAP_MS) ||
      now - lastSnapshotAt >= config.SNAPSHOT_INTERVAL_MS
    ) {
      try {
        await snapshotNow(ctx, rates)
        pendingSnapshot = false
        lastSnapshotAt = now
      } catch (err) {
        log.error({ err: (err as Error).message }, 'snapshot failed')
      }
    }
    if (now - lastCheckpointAt >= config.WAL_CHECKPOINT_INTERVAL_MS) {
      checkpoint(ctx.db)
      lastCheckpointAt = now
    }
    if (allIdle && !stop.requested) await stop.sleep(config.TAIL_SLEEP_MS)
  }
  if (pendingSnapshot) {
    try {
      await snapshotNow(ctx, rates)
    } catch (err) {
      log.error({ err: (err as Error).message }, 'final snapshot failed')
    }
  }
  checkpoint(ctx.db)
}
