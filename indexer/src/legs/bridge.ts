import { ADDRESSES, eventSelector, roninGatewayAbi } from '@axie-gov/shared'
import type { Address, Hex } from 'viem'

import { weiToUnits } from '../classify/classify.js'
import type { BlockRow, BridgeEventRow } from '../db/writeBatch.js'
import type { BridgeLog } from '../decode/decodeLog.js'
import { decodeLogs } from '../decode/decodeLog.js'
import type { AppContext } from '../pipeline/context.js'
import type { RawLog } from '../rpc/methods.js'
import { getLogs } from '../rpc/methods.js'
import { resolveTimestamps } from '../rpc/timestamps.js'
import type { Leg } from './leg.js'

export const DEPOSITED_TOPIC: Hex = eventSelector(roninGatewayAbi, 'Deposited')
export const WITHDRAWAL_REQUESTED_TOPIC: Hex = eventSelector(
  roninGatewayAbi,
  'WithdrawalRequested',
)

const SYMBOLS: ReadonlyMap<Address, string> = new Map([
  [ADDRESSES.AXS, 'AXS'],
  [ADDRESSES.WETH, 'WETH'],
])

/** Bridge `amount` (token units) is only meaningful for the 18-decimal tokens we chart; everything else keeps wei only. */
export function bridgeRow(log: BridgeLog, ts: number): BridgeEventRow {
  const token = SYMBOLS.get(log.roninTokenAddr) ?? log.roninTokenAddr
  const isCharted = token === 'WETH' || token === 'AXS'
  return {
    txHash: log.txHash,
    logIndex: log.logIndex,
    block: log.blockNumber,
    ts,
    kind: log.event === 'Deposited' ? 'deposit' : 'withdrawal',
    token,
    amountWei: log.quantity,
    amount: isCharted ? weiToUnits(log.quantity) : 0,
    address: log.roninAddr,
    receiptId: log.receiptId.toString(),
  }
}

export async function discoverBridgeLogs(
  ctx: AppContext,
  from: number,
  to: number,
): Promise<RawLog[]> {
  return getLogs(ctx.rpc, {
    fromBlock: from,
    toBlock: to,
    address: [ADDRESSES.RONIN_GATEWAY],
    topics: [[DEPOSITED_TOPIC, WITHDRAWAL_REQUESTED_TOPIC]],
  })
}

export const bridgeLeg: Leg = {
  name: 'bridge',
  cursorKey: 'cursor_bridge',
  committedAtKey: 'bridge_committed_at',
  startBlock: (ctx) => ctx.config.BRIDGE_START_BLOCK,

  async process(ctx, from, to, opts) {
    const raw = await discoverBridgeLogs(ctx, from, to)
    const knownTs = new Map<number, number>()
    for (const l of raw)
      if (l.blockTimestamp !== undefined)
        knownTs.set(l.blockNumber, l.blockTimestamp)
    const decoded = decodeLogs(raw, ctx.log).filter(
      (d): d is BridgeLog => d.kind === 'bridge',
    )

    const blockNumbers = [...new Set(decoded.map((d) => d.blockNumber))]
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
    const bridgeEvents = decoded.map((d) =>
      bridgeRow(d, tsByBlock.get(d.blockNumber) as number),
    )

    return {
      from,
      to,
      blocks,
      txs: [],
      bridgeEvents,
      stats: {
        discoveredLogs: raw.length,
        txs: 0,
        blocksFetched: blocks.filter((b) => b.source === 'rpc').length,
        blocksInterpolated: blocks.filter((b) => b.source === 'interp').length,
      },
    }
  },
}
