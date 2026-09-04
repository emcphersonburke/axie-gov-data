import { CONTRACTS } from '@axie-gov/shared'
import type { Address, Hex } from 'viem'

import type { RawLog } from '../rpc/methods.js'
import { getLogs } from '../rpc/methods.js'
import { classifyError } from '../rpc/retry.js'
import type { FetchContext, TxLogs, TxLogsStrategy } from './txLogs.js'

/**
 * Contracts whose logs the classifier needs beyond the treasury's own token
 * transfers: NFT contracts (what moved), marker contracts (why), the gateway.
 * AXS/WETH are deliberately excluded — chain-wide token transfers dwarf
 * everything else and discovery already fetched the treasury-touching ones.
 */
export const RANGE_ADDRESSES: readonly Address[] = CONTRACTS.filter(
  (c) => c.standard !== 'erc20' && (c.nftType || c.markerEvents),
).map((c) => c.address)

const MIN_SPLIT = 50

/** `eth_getLogs` over [from, to] for the range addresses, splitting in halves (in parallel) when the provider rejects the range or the response is too large. */
export async function fetchRangeLogs(
  ctx: FetchContext,
  from: number,
  to: number,
): Promise<RawLog[]> {
  try {
    return await getLogs(ctx.rpc, {
      fromBlock: from,
      toBlock: to,
      address: RANGE_ADDRESSES as Address[],
    })
  } catch (err) {
    const info = classifyError(err)
    const splittable = info.shrinkRange || info.oversized
    if (!splittable || info.rateLimited || to - from + 1 <= MIN_SPLIT) throw err
    const mid = from + Math.floor((to - from) / 2)
    const [a, b] = await Promise.all([
      fetchRangeLogs(ctx, from, mid),
      fetchRangeLogs(ctx, mid + 1, to),
    ])
    return [...a, ...b]
  }
}

/** Pure: group the discovered treasury transfers plus the range logs into per-tx log sets (only for wanted hashes). */
export function groupTxLogs(
  hashes: readonly Hex[],
  discovered: readonly RawLog[],
  rangeLogs: readonly RawLog[],
): Map<Hex, TxLogs> {
  const wanted = new Set<Hex>(hashes)
  const out = new Map<Hex, TxLogs>()
  const seen = new Set<string>()
  for (const l of [...discovered, ...rangeLogs]) {
    if (!wanted.has(l.transactionHash)) continue
    const key = `${l.transactionHash}:${l.logIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    let entry = out.get(l.transactionHash)
    if (!entry) {
      entry = {
        hash: l.transactionHash,
        block: l.blockNumber,
        txIndex: l.transactionIndex,
        from: null,
        to: null,
        logs: [],
      }
      out.set(l.transactionHash, entry)
    }
    entry.logs.push(l)
  }
  for (const entry of out.values())
    entry.logs.sort((a, b) => a.logIndex - b.logIndex)
  return out
}

/**
 * Phase-2 without receipts: the treasury transfers come from discovery, and
 * one adaptive `eth_getLogs` sweep over the NFT/marker/gateway contracts
 * supplies the rest of each transaction's relevant logs. Cheap on
 * compute-metered providers and immune to per-transaction request caps;
 * the price is `from`/`to` staying null (nothing on the dashboard uses them).
 */
export const rangeStrategy: TxLogsStrategy = {
  name: 'range',
  async fetch(ctx, hashes, discovered = []) {
    const rangeLogs = await fetchRangeLogs(ctx, ctx.range.from, ctx.range.to)
    return groupTxLogs(hashes, discovered, rangeLogs)
  },
}
