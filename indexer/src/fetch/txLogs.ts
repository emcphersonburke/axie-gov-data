import type { Address, Hex } from 'viem'

import type { Logger } from '../logger.js'
import type { Rpc } from '../rpc/client.js'
import type { RawLog } from '../rpc/methods.js'
import { rangeStrategy } from './range.js'
import { receiptsStrategy } from './receipts.js'

/** All logs of one transaction plus the receipt fields the classifier stores. */
export interface TxLogs {
  hash: Hex
  block: number
  txIndex: number | null
  from: Address | null
  to: Address | null
  logs: RawLog[]
}

export interface FetchContext {
  rpc: Rpc
  log: Logger
  range: { from: number; to: number }
}

export type StrategyName = 'receipts' | 'range'

/**
 * Phase 2: turn the tx hashes discovered by the filtered `eth_getLogs` into
 * their full log sets. `receipts` (default) asks for each receipt in JSON-RPC
 * batches; `range` re-queries `eth_getLogs` over the same block range for all
 * tracked contracts and groups by hash (kept only in case receipts are priced
 * badly — it is the failure mode that killed the old pipeline).
 */
export interface TxLogsStrategy {
  readonly name: StrategyName
  fetch(ctx: FetchContext, hashes: readonly Hex[]): Promise<Map<Hex, TxLogs>>
}

export function createStrategy(name: StrategyName): TxLogsStrategy {
  return name === 'range' ? rangeStrategy : receiptsStrategy
}
