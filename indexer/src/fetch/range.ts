import { CONTRACTS } from '@axie-gov/shared'
import type { Hex } from 'viem'

import { getLogs } from '../rpc/methods.js'
import type { TxLogs, TxLogsStrategy } from './txLogs.js'

const TRACKED_ADDRESSES = CONTRACTS.map((c) => c.address)

export const rangeStrategy: TxLogsStrategy = {
  name: 'range',
  async fetch(ctx, hashes) {
    const wanted = new Set<Hex>(hashes)
    const logs = await getLogs(ctx.rpc, {
      fromBlock: ctx.range.from,
      toBlock: ctx.range.to,
      address: TRACKED_ADDRESSES,
    })
    const out = new Map<Hex, TxLogs>()
    for (const l of logs) {
      if (!wanted.has(l.transactionHash)) continue
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
  },
}
