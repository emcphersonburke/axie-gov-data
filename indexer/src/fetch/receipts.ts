import type { Hex } from 'viem'

import { getTransactionReceipt } from '../rpc/methods.js'
import { ReplicaLagError } from '../rpc/retry.js'
import type { TxLogs, TxLogsStrategy } from './txLogs.js'

export const receiptsStrategy: TxLogsStrategy = {
  name: 'receipts',
  async fetch(ctx, hashes) {
    const receipts = await Promise.all(
      hashes.map((h) => getTransactionReceipt(ctx.rpc, h)),
    )
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
