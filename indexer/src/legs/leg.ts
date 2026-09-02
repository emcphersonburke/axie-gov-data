import type { LegBatch } from '../db/writeBatch.js'
import type { AppContext } from '../pipeline/context.js'

export interface LegStats {
  /** Phase-1 result count; drives the range sizer. */
  discoveredLogs: number
  txs: number
  blocksFetched: number
  blocksInterpolated: number
}

export interface ProcessOptions {
  /** Tail mode: fetch every block timestamp exactly. */
  exact: boolean
}

export interface Leg {
  readonly name: 'treasury' | 'bridge'
  readonly cursorKey: 'cursor_treasury' | 'cursor_bridge'
  readonly committedAtKey: 'treasury_committed_at' | 'bridge_committed_at'
  startBlock(ctx: AppContext): number
  /** All RPC work for [from, to]; pure with respect to the database. */
  process(
    ctx: AppContext,
    from: number,
    to: number,
    opts: ProcessOptions,
  ): Promise<LegBatch & { stats: LegStats }>
}
