import type { Hex } from 'viem'

import { getTransactionReceipt } from '../rpc/methods.js'
import { classifyError, ReplicaLagError } from '../rpc/retry.js'
import type { TxLogs, TxLogsStrategy } from './txLogs.js'

export const receiptsStrategy: TxLogsStrategy = {
  name: 'receipts',
  async fetch(ctx, hashes) {
    let receipts
    try {
      receipts = await Promise.all(
        hashes.map((h) => getTransactionReceipt(ctx.rpc, h)),
      )
    } catch (err) {
      if (!classifyError(err).oversized) throw err
      // A JSON-RPC batch of receipt-heavy transactions blew the response cap: fetch them one
      // request at a time (each await is its own HTTP request), slower but always fits.
      ctx.log.warn(
        { hashes: hashes.length, range: ctx.range },
        'receipt batch too large; refetching one at a time',
      )
      receipts = []
      for (const h of hashes)
        receipts.push(await getTransactionReceipt(ctx.rpc, h))
    }
    const out = new Map<Hex, TxLogs>()
    receipts.forEach((r, i) => {
      const hash = hashes[i] as Hex
      // Discovery saw this tx in a log, so a null receipt means the replica we hit is behind (or pruned).
      if (!r) throw new ReplicaLagError(`receipt missing for ${hash}`)
      if (r.status !== 'success')
        throw new ReplicaLagError(
          `receipt for ${hash} reverted but emitted logs`,
        )
      out.set(hash, {
        hash,
        block: r.blockNumber,
        txIndex: r.transactionIndex,
        from: r.from,
        to: r.to,
        logs: r.logs,
      })
    })
    return out
  },
}
