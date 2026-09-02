import type { AppContext } from '../pipeline/context.js'
import { rebuildRollups } from '../rollups/rebuild.js'

export function rebuildRollupsCommand(ctx: AppContext): void {
  const t0 = Date.now()
  const r = rebuildRollups(ctx.db)
  ctx.log.info(
    {
      rollupRows: r.rollupRows,
      axsInWei: r.totals.axsInWei.toString(),
      wethInWei: r.totals.wethInWei.toString(),
      axsOutWei: r.totals.axsOutWei.toString(),
      wethOutWei: r.totals.wethOutWei.toString(),
      firstTxBlock: r.firstTxBlock,
      ms: Date.now() - t0,
    },
    'rollups rebuilt',
  )
}
