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
 * batches — exact, but one request per transaction. `range` reuses the
 * discovered treasury transfers and sweeps `eth_getLogs` over the NFT, marker
 * and gateway contracts for the range — a handful of calls per batch however
 * dense the range is, at the cost of `from`/`to` being unknown.
 */
export interface TxLogsStrategy {
  readonly name: StrategyName
  /** `discovered` are the treasury transfer logs phase 1 already fetched; the range strategy reuses them. */
  fetch(
    ctx: FetchContext,
    hashes: readonly Hex[],
    discovered?: readonly RawLog[],
  ): Promise<Map<Hex, TxLogs>>
}

export function createStrategy(name: StrategyName): TxLogsStrategy {
  return name === 'range' ? rangeStrategy : receiptsStrategy
}
