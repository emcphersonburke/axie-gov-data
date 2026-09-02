import type { AppContext } from '../pipeline/context.js'
import { RatesTracker } from '../snapshot/rates.js'
import { snapshotNow } from './shared.js'

/** Build + atomically write the snapshot once. */
export async function snapshot(ctx: AppContext): Promise<void> {
  const rates = new RatesTracker(ctx.config, ctx.stmts, ctx.log)
  await rates.refreshIfDue(Date.now(), true)
  await snapshotNow(ctx, rates)
}
