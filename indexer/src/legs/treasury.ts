import { ADDRESSES, TRANSFER_TOPIC } from '@axie-gov/shared'
import type { Hex } from 'viem'
import { padHex } from 'viem'

import { classifyTx } from '../classify/classify.js'
import type { BlockRow, TxWithTs } from '../db/writeBatch.js'
import { decodeLogs } from '../decode/decodeLog.js'
import type { AppContext } from '../pipeline/context.js'
import type { RawLog } from '../rpc/methods.js'
import { getLogs } from '../rpc/methods.js'
import { classifyError, ReplicaLagError } from '../rpc/retry.js'
import { resolveTimestamps } from '../rpc/timestamps.js'
import type { Leg } from './leg.js'

const TREASURY_TOPIC = padHex(ADDRESSES.TREASURY, { size: 32 })
const TOKENS = [ADDRESSES.AXS, ADDRESSES.WETH]

/** Phase 1: every AXS/WETH Transfer into or out of the treasury in [from, to]. */
export async function discoverTreasuryLogs(
  ctx: AppContext,
  from: number,
  to: number,
): Promise<RawLog[]> {
  const [inflow, outflow] = await Promise.all([
    getLogs(ctx.rpc, {
      fromBlock: from,
      toBlock: to,
      address: TOKENS,
      topics: [TRANSFER_TOPIC, null, TREASURY_TOPIC],
    }),
    getLogs(ctx.rpc, {
      fromBlock: from,
      toBlock: to,
      address: TOKENS,
      topics: [TRANSFER_TOPIC, TREASURY_TOPIC, null],
    }),
  ])
  const seen = new Set<string>()
  const out: RawLog[] = []
  for (const l of [...inflow, ...outflow]) {
    const key = `${l.transactionHash}:${l.logIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  out.sort(
    (a, b) =>
      a.blockNumber - b.blockNumber ||
      a.transactionIndex - b.transactionIndex ||
      a.logIndex - b.logIndex,
  )
  return out
}

/**
 * Discovery that copes with provider range caps on its own by splitting the
 * range in halves (down to 50 blocks) whenever the provider rejects it. Used
 * by ad-hoc commands (`verify --spot`); the pipeline uses the range sizer.
 */
export async function discoverTreasuryLogsAdaptive(
  ctx: AppContext,
  from: number,
  to: number,
): Promise<RawLog[]> {
  try {
    return await discoverTreasuryLogs(ctx, from, to)
  } catch (err) {
    const info = classifyError(err)
    if (!info.shrinkRange || info.rateLimited || to - from + 1 <= 50) throw err
    const mid = from + Math.floor((to - from) / 2)
    const [a, b] = await Promise.all([
      discoverTreasuryLogsAdaptive(ctx, from, mid),
      discoverTreasuryLogsAdaptive(ctx, mid + 1, to),
    ])
    return [...a, ...b]
  }
}

export const treasuryLeg: Leg = {
  name: 'treasury',
  cursorKey: 'cursor_treasury',
  committedAtKey: 'treasury_committed_at',
  startBlock: (ctx) => ctx.config.START_BLOCK,

  async process(ctx, from, to, opts) {
    const discovered = await discoverTreasuryLogs(ctx, from, to)
    const hashes: Hex[] = []
    const seenHashes = new Set<Hex>()
    const knownTs = new Map<number, number>()
    for (const l of discovered) {
      if (!seenHashes.has(l.transactionHash)) {
        seenHashes.add(l.transactionHash)
        hashes.push(l.transactionHash)
      }
      if (l.blockTimestamp !== undefined)
        knownTs.set(l.blockNumber, l.blockTimestamp)
    }

    const txLogs = await ctx.strategy.fetch(
      { rpc: ctx.rpc, log: ctx.log, range: { from, to } },
      hashes,
      discovered,
    )

    // Integrity cross-check: every discovered (hash, logIndex) must be in the receipt we got.
    for (const l of discovered) {
      const t = txLogs.get(l.transactionHash)
      if (!t)
        throw new ReplicaLagError(
          `tx ${l.transactionHash} missing from phase-2 result`,
        )
      if (t.block !== l.blockNumber)
        throw new ReplicaLagError(
          `tx ${l.transactionHash} block mismatch: logs say ${l.blockNumber}, receipt says ${t.block}`,
        )
      if (!t.logs.some((x) => x.logIndex === l.logIndex))
        throw new ReplicaLagError(
          `tx ${l.transactionHash} log ${l.logIndex} missing from receipt (lagging replica)`,
        )
    }

    const classified = hashes.map((hash) => {
      const t = txLogs.get(hash)
      if (!t)
        throw new ReplicaLagError(`tx ${hash} missing from phase-2 result`)
      return classifyTx(
        {
          hash,
          block: t.block,
          txIndex: t.txIndex,
          from: t.from,
          to: t.to,
          logs: decodeLogs(t.logs, ctx.log),
        },
        { treasury: ADDRESSES.TREASURY },
      )
    })

    const blockNumbers = [...new Set(classified.map((c) => c.block))]
    const timestamps = await resolveTimestamps(ctx.rpc, blockNumbers, {
      known: knownTs,
      range: { from, to },
      exact: opts.exact,
      anchorInterval: ctx.config.TS_ANCHOR_INTERVAL,
      log: ctx.log,
    })
    const blocks: BlockRow[] = blockNumbers.map((n) => {
      const t = timestamps.get(n)
      if (!t) throw new Error(`no timestamp resolved for block ${n}`)
      return { number: n, ts: t.ts, source: t.source }
    })
    const tsByBlock = new Map(blocks.map((b) => [b.number, b.ts]))
    const txs: TxWithTs[] = classified.map((c) => ({
      ...c,
      ts: tsByBlock.get(c.block) as number,
    }))

    return {
      from,
      to,
      blocks,
      txs,
      bridgeEvents: [],
      stats: {
        discoveredLogs: discovered.length,
        txs: txs.length,
        blocksFetched: blocks.filter((b) => b.source === 'rpc').length,
        blocksInterpolated: blocks.filter((b) => b.source === 'interp').length,
      },
    }
  },
}
