import type { Hex } from 'viem'

import { discoverTreasuryLogs } from '../legs/treasury.js'
import type { AppContext } from '../pipeline/context.js'
import { getBlockNumber, getTransactionReceipt } from '../rpc/methods.js'

export interface ProbeResult {
  logBlockTimestamp: boolean | undefined
  hashes: number
  steps: Array<{
    rps: number
    receipts: number
    seconds: number
    httpRequests: number
    subCalls: number
    achievedReqPerSec: number
    rateLimited: boolean
  }>
  firstRateLimitAtRps: number | null
}

/**
 * Day-1 accounting run: discover ~1,000 recent treasury txs, then fetch their
 * receipts in steps of rising RPS until the first 429. Prints HTTP requests
 * vs sub-calls so the gateway's metering unit becomes obvious, and whether
 * `eth_getLogs` carries `blockTimestamp`.
 */
export async function probe(
  ctx: AppContext,
  opts: { from?: number; to?: number } = {},
): Promise<ProbeResult> {
  const { rpc, log, config } = ctx
  const head = await getBlockNumber(rpc)
  let to = opts.to ?? head - config.CONFIRMATIONS
  const floor = opts.from ?? Math.max(config.START_BLOCK, to - 20_000)
  const hashes: Hex[] = []
  const seen = new Set<Hex>()
  const window = 200 // fits the strictest public cap; the sizer is not involved here
  while (hashes.length < 1000 && to > floor) {
    const from = Math.max(floor, to - window + 1)
    const logs = await discoverTreasuryLogs(ctx, from, to)
    for (const l of logs) {
      if (!seen.has(l.transactionHash)) {
        seen.add(l.transactionHash)
        hashes.push(l.transactionHash)
      }
    }
    to = from - 1
  }
  log.info(
    {
      hashes: hashes.length,
      logBlockTimestamp: rpc.features.logBlockTimestamp,
    },
    'probe: discovery done',
  )

  const result: ProbeResult = {
    logBlockTimestamp: rpc.features.logBlockTimestamp,
    hashes: hashes.length,
    steps: [],
    firstRateLimitAtRps: null,
  }
  const throttle = rpc.primary.throttle
  let offset = 0
  const perStep = Math.max(50, Math.floor(hashes.length / 5))
  for (const rps of [10, 20, 40, 80, 160]) {
    if (offset >= hashes.length) break
    const slice = hashes.slice(offset, offset + perStep)
    offset += slice.length
    throttle.rps = rps
    const before = rpc.counters()
    const limitsBefore = throttle.snapshot().rateLimits
    const t0 = Date.now()
    await Promise.all(slice.map((h) => getTransactionReceipt(rpc, h)))
    const seconds = (Date.now() - t0) / 1000
    const after = rpc.counters()
    const rateLimited = throttle.snapshot().rateLimits > limitsBefore
    const step = {
      rps,
      receipts: slice.length,
      seconds: Number(seconds.toFixed(2)),
      httpRequests: after.httpRequests - before.httpRequests,
      subCalls: after.subCalls - before.subCalls,
      achievedReqPerSec: Number(
        (
          (after.httpRequests - before.httpRequests) /
          Math.max(seconds, 0.001)
        ).toFixed(1),
      ),
      rateLimited,
    }
    result.steps.push(step)
    log.info(step, 'probe step')
    if (rateLimited) {
      result.firstRateLimitAtRps = rps
      break
    }
  }
  log.info(result, 'probe finished')
  return result
}
