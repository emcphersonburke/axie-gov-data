import type { Db } from '../db/open.js'
import { prepareStatements, setMeta, sumWeiColumn } from '../db/statements.js'

export interface RebuildResult {
  rollupRows: number
  totals: {
    axsInWei: bigint
    wethInWei: bigint
    axsOutWei: bigint
    wethOutWei: bigint
  }
  firstTxBlock: number | null
  firstTxTs: number | null
}

/**
 * Recompute `rollups_hourly` and the exact BigInt totals in `meta` from
 * `transactions`. Used after classifier changes, rewinds, or any doubt.
 */
export function rebuildRollups(db: Db): RebuildResult {
  const stmts = prepareStatements(db)
  return db.transaction((): RebuildResult => {
    db.exec('DELETE FROM rollups_hourly')
    const info = db
      .prepare(
        `INSERT INTO rollups_hourly (hour, type, nft_type, axs_in, weth_in, axs_out, weth_out, tx_count)
         SELECT (ts / 3600) * 3600, type, nft_type,
                SUM(axs_in), SUM(weth_in), SUM(axs_out), SUM(weth_out), COUNT(*)
         FROM transactions GROUP BY 1, 2, 3`,
      )
      .run()
    const totals = {
      axsInWei: sumWeiColumn(db, 'transactions', 'axs_in_wei'),
      wethInWei: sumWeiColumn(db, 'transactions', 'weth_in_wei'),
      axsOutWei: sumWeiColumn(db, 'transactions', 'axs_out_wei'),
      wethOutWei: sumWeiColumn(db, 'transactions', 'weth_out_wei'),
    }
    setMeta(stmts, 'total_axs_in_wei', totals.axsInWei.toString())
    setMeta(stmts, 'total_weth_in_wei', totals.wethInWei.toString())
    setMeta(stmts, 'total_axs_out_wei', totals.axsOutWei.toString())
    setMeta(stmts, 'total_weth_out_wei', totals.wethOutWei.toString())
    const first = db
      .prepare(
        'SELECT block, ts FROM transactions ORDER BY block ASC, tx_index ASC LIMIT 1',
      )
      .get() as { block: number; ts: number } | undefined
    if (first) {
      setMeta(stmts, 'first_tx_block', String(first.block))
      setMeta(stmts, 'first_tx_ts', String(first.ts))
    } else {
      db.prepare(
        "DELETE FROM meta WHERE key IN ('first_tx_block', 'first_tx_ts')",
      ).run()
    }
    setMeta(stmts, 'rollups_dirty', '0')
    return {
      rollupRows: Number(info.changes),
      totals,
      firstTxBlock: first?.block ?? null,
      firstTxTs: first?.ts ?? null,
    }
  })()
}
