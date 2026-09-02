import { floorHour } from '@axie-gov/shared'

import type { ClassifiedTx } from '../classify/classify.js'
import { weiToUnits } from '../classify/classify.js'
import type { RollupParams, Statements } from '../db/statements.js'

/** The hourly rollup contribution of one transaction. */
export function rollupDelta(tx: ClassifiedTx, ts: number): RollupParams {
  return {
    hour: floorHour(ts),
    type: tx.type,
    nft_type: tx.nftType,
    axs_in: weiToUnits(tx.axsInWei),
    weth_in: weiToUnits(tx.wethInWei),
    axs_out: weiToUnits(tx.axsOutWei),
    weth_out: weiToUnits(tx.wethOutWei),
    tx_count: 1,
  }
}

/** Add one *newly inserted* transaction to `rollups_hourly`. Callers must not apply a tx twice. */
export function applyRollup(
  stmts: Statements,
  tx: ClassifiedTx,
  ts: number,
): void {
  stmts.upsertRollup.run(rollupDelta(tx, ts))
}
