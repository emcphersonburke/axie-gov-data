import type {
  Address,
  Hex,
  RpcBlock,
  RpcLog,
  RpcTransactionReceipt,
} from 'viem'
import { hexToNumber, numberToHex } from 'viem'

import type { Rpc } from './client.js'

/** A log as the indexer sees it: numbers decoded, addresses lowercased, raw topics/data kept for decoding. */
export interface RawLog {
  address: Address
  topics: [Hex, ...Hex[]] | []
  data: Hex
  blockNumber: number
  /** Present when the provider includes it on `eth_getLogs` (the public Ronin RPC does). Unix seconds. */
  blockTimestamp?: number
  transactionHash: Hex
  transactionIndex: number
  logIndex: number
  removed: boolean
}

export interface RawReceipt {
  transactionHash: Hex
  blockNumber: number
  transactionIndex: number
  from: Address
  to: Address | null
  status: 'success' | 'reverted'
  logs: RawLog[]
}

export interface BlockHeader {
  number: number
  hash: Hex
  timestamp: number
}

export interface LogFilter {
  fromBlock: number
  toBlock: number
  address: Address[]
  topics?: Array<Hex | Hex[] | null>
}

const lower = (a: string): Address => a.toLowerCase() as Address

export function normalizeLog(l: RpcLog): RawLog {
  if (
    l.blockNumber === null ||
    l.transactionHash === null ||
    l.logIndex === null ||
    l.transactionIndex === null
  )
    throw new Error('pending log in eth_getLogs result')
  const out: RawLog = {
    address: lower(l.address),
    topics: l.topics as RawLog['topics'],
    data: l.data,
    blockNumber: hexToNumber(l.blockNumber),
    transactionHash: l.transactionHash,
    transactionIndex: hexToNumber(l.transactionIndex),
    logIndex: hexToNumber(l.logIndex),
    removed: l.removed,
  }
  if (l.blockTimestamp) out.blockTimestamp = hexToNumber(l.blockTimestamp)
  return out
}

export function normalizeReceipt(r: RpcTransactionReceipt): RawReceipt {
  return {
    transactionHash: r.transactionHash,
    blockNumber: hexToNumber(r.blockNumber),
    transactionIndex: hexToNumber(r.transactionIndex),
    from: lower(r.from),
    to: r.to ? lower(r.to) : null,
    status: r.status === '0x1' ? 'success' : 'reverted',
    logs: r.logs.map(normalizeLog),
  }
}

export async function getBlockNumber(rpc: Rpc): Promise<number> {
  const hex = await rpc.request<Hex>('eth_blockNumber', [])
  return hexToNumber(hex)
}

/**
 * `eth_getLogs` for one filter. Range/limit errors propagate to the caller
 * (who shrinks the range); rate limits and transient errors are retried.
 * Records whether the provider returns `blockTimestamp` (day-1 probe).
 */
export async function getLogs(rpc: Rpc, filter: LogFilter): Promise<RawLog[]> {
  const params = {
    fromBlock: numberToHex(filter.fromBlock),
    toBlock: numberToHex(filter.toBlock),
    address: filter.address,
    ...(filter.topics ? { topics: filter.topics } : {}),
  }
  const logs = await rpc.request<RpcLog[]>('eth_getLogs', [params], {
    propagate: (info) => info.shrinkRange && !info.rateLimited,
  })
  if (logs.length > 0 && rpc.features.logBlockTimestamp !== true) {
    // Some replicas behind the same load balancer include it and some do not; any hit means the field exists.
    // Timestamps are still resolved per block, so a replica without it only costs a few header fetches.
    rpc.features.logBlockTimestamp = logs.some(
      (l) => typeof l.blockTimestamp === 'string',
    )
  }
  return logs.map(normalizeLog)
}

export async function getTransactionReceipt(
  rpc: Rpc,
  hash: Hex,
): Promise<RawReceipt | null> {
  const r = await rpc.request<RpcTransactionReceipt | null>(
    'eth_getTransactionReceipt',
    [hash],
  )
  return r ? normalizeReceipt(r) : null
}

export async function getBlockHeader(
  rpc: Rpc,
  block: number | 'latest',
): Promise<BlockHeader | null> {
  const tag = block === 'latest' ? 'latest' : numberToHex(block)
  const b = await rpc.request<RpcBlock | null>('eth_getBlockByNumber', [
    tag,
    false,
  ])
  if (!b || b.number === null || b.hash === null) return null
  return {
    number: hexToNumber(b.number),
    hash: b.hash,
    timestamp: hexToNumber(b.timestamp),
  }
}
