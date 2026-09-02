import { getMetaInt, setMeta } from '../db/statements.js'
import type { AppContext } from '../pipeline/context.js'
import { rebuildRollups } from '../rollups/rebuild.js'

export interface RewindResult {
  toBlock: number
  deletedTxs: number
  deletedBridgeEvents: number
  deletedBlocks: number
}

/**
 * Deep-reorg remedy: delete everything at or above `toBlock`, move both
 * cursors back to it, and rebuild rollups/totals so the DB is consistent
 * again. The next `tail`/`backfill` re-indexes from there.
 */
export function rewind(ctx: AppContext, toBlock: number): RewindResult {
  const { db, stmts } = ctx
  const result = db.transaction((): RewindResult => {
    const txs = db
      .prepare('DELETE FROM transactions WHERE block >= ?')
      .run(toBlock)
    const bridge = db
      .prepare('DELETE FROM bridge_events WHERE block >= ?')
      .run(toBlock)
    const blocks = db
      .prepare('DELETE FROM blocks WHERE number >= ?')
      .run(toBlock)
    for (const key of ['cursor_treasury', 'cursor_bridge'] as const) {
      const cur = getMetaInt(stmts, key)
      if (cur !== undefined && cur > toBlock)
        setMeta(stmts, key, String(toBlock))
    }
    setMeta(stmts, 'rollups_dirty', '1')
    return {
      toBlock,
      deletedTxs: Number(txs.changes),
      deletedBridgeEvents: Number(bridge.changes),
      deletedBlocks: Number(blocks.changes),
    }
  })()
  rebuildRollups(db)
  ctx.log.info(result, 'rewound; rollups rebuilt')
  return result
}
