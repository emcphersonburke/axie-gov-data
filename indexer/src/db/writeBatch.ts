import type { ClassifiedTx } from '../classify/classify.js'
import { weiToUnits } from '../classify/classify.js'
import { applyRollup } from '../rollups/apply.js'
import type { Db } from './open.js'
import type { MetaKey, Statements } from './statements.js'
import { getMeta, getMetaBigInt, setMeta } from './statements.js'

export interface BlockRow {
  number: number
  ts: number
  source: 'rpc' | 'interp'
}

export interface BridgeEventRow {
  txHash: string
  logIndex: number
  block: number
  ts: number
  kind: 'deposit' | 'withdrawal'
  token: string
  amountWei: bigint
  amount: number
  address: string
  receiptId: string | null
}

export type TxWithTs = ClassifiedTx & { ts: number }

/** Everything one leg produced for a block range, ready to be committed atomically. */
export interface LegBatch {
  from: number
  to: number
  blocks: BlockRow[]
  txs: TxWithTs[]
  bridgeEvents: BridgeEventRow[]
}

export interface WriteResult {
  insertedTxs: number
  skippedTxs: number
  insertedBridge: number
  skippedBridge: number
}

export interface WriteOptions {
  cursorKey: 'cursor_treasury' | 'cursor_bridge'
  committedAtKey: 'treasury_committed_at' | 'bridge_committed_at'
  /** Wall-clock ISO timestamp recorded with the cursor (injectable for tests). */
  now?: () => string
}

/**
 * Commit one batch in ONE transaction: blocks, transactions (`ON CONFLICT DO
 * NOTHING`), children, hourly rollups and exact totals *only for rows that
 * were actually inserted*, then `cursor = to + 1`. Re-running a range is a
 * no-op by construction.
 */
export function writeBatch(
  db: Db,
  stmts: Statements,
  batch: LegBatch,
  opts: WriteOptions,
): WriteResult {
  const now = opts.now ?? (() => new Date().toISOString())
  return db.transaction((): WriteResult => {
    const result: WriteResult = {
      insertedTxs: 0,
      skippedTxs: 0,
      insertedBridge: 0,
      skippedBridge: 0,
    }

    for (const b of batch.blocks)
      stmts.insertBlock.run(b.number, b.ts, b.source)

    const totals: Record<
      | 'total_axs_in_wei'
      | 'total_weth_in_wei'
      | 'total_axs_out_wei'
      | 'total_weth_out_wei',
      bigint
    > = {
      total_axs_in_wei: 0n,
      total_weth_in_wei: 0n,
      total_axs_out_wei: 0n,
      total_weth_out_wei: 0n,
    }
    let firstBlock: number | undefined
    let firstTs: number | undefined

    for (const tx of batch.txs) {
      const row = stmts.insertTx.get({
        hash: tx.hash,
        block: tx.block,
        tx_index: tx.txIndex,
        ts: tx.ts,
        type: tx.type,
        nft_type: tx.nftType,
        nft_count: tx.nftCount,
        from_address: tx.from,
        to_address: tx.to,
        axs_in_wei: tx.axsInWei.toString(),
        weth_in_wei: tx.wethInWei.toString(),
        axs_out_wei: tx.axsOutWei.toString(),
        weth_out_wei: tx.wethOutWei.toString(),
        axs_in: weiToUnits(tx.axsInWei),
        weth_in: weiToUnits(tx.wethInWei),
        axs_out: weiToUnits(tx.axsOutWei),
        weth_out: weiToUnits(tx.wethOutWei),
      })
      if (!row) {
        result.skippedTxs += 1
        continue
      }
      result.insertedTxs += 1
      const id = row.id
      for (const t of tx.tokenTransfers) {
        stmts.insertTokenTransfer.run(
          id,
          t.logIndex,
          t.token,
          t.direction,
          t.from,
          t.to,
          t.amountWei.toString(),
          weiToUnits(t.amountWei),
        )
      }
      for (const n of tx.nftTransfers) {
        stmts.insertNftTransfer.run(
          id,
          n.logIndex,
          n.subIndex,
          n.contract,
          n.nftType,
          n.tokenId.toString(),
          n.quantity.toString(),
          n.from,
          n.to,
        )
      }
      applyRollup(stmts, tx, tx.ts)
      totals.total_axs_in_wei += tx.axsInWei
      totals.total_weth_in_wei += tx.wethInWei
      totals.total_axs_out_wei += tx.axsOutWei
      totals.total_weth_out_wei += tx.wethOutWei
      if (firstBlock === undefined || tx.block < firstBlock) {
        firstBlock = tx.block
        firstTs = tx.ts
      }
    }

    if (result.insertedTxs > 0) {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        setMeta(
          stmts,
          key,
          (getMetaBigInt(stmts, key) + totals[key]).toString(),
        )
      }
      const knownFirst = getMeta(stmts, 'first_tx_block')
      if (
        firstBlock !== undefined &&
        firstTs !== undefined &&
        (knownFirst === undefined || firstBlock < Number(knownFirst))
      ) {
        setMeta(stmts, 'first_tx_block', String(firstBlock))
        setMeta(stmts, 'first_tx_ts', String(firstTs))
      }
    }

    for (const e of batch.bridgeEvents) {
      const info = stmts.insertBridgeEvent.run(
        e.txHash,
        e.logIndex,
        e.block,
        e.ts,
        e.kind,
        e.token,
        e.amountWei.toString(),
        e.amount,
        e.address,
        e.receiptId,
      )
      if (info.changes > 0) result.insertedBridge += 1
      else result.skippedBridge += 1
    }

    setMeta(stmts, opts.cursorKey, String(batch.to + 1))
    setMeta(stmts, opts.committedAtKey, now())
    return result
  })()
}

/** Cursor = next block to process, or undefined when the leg has never run. */
export function readCursor(
  stmts: Statements,
  key: MetaKey,
): number | undefined {
  const v = getMeta(stmts, key)
  return v === undefined ? undefined : Number(v)
}
