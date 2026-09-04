import { STALE_LAG_BLOCKS } from '@axie-gov/shared'

import type { WriteResult } from '../db/writeBatch.js'
import { readCursor, writeBatch } from '../db/writeBatch.js'
import type { Leg } from '../legs/leg.js'
import { endpointUsageDelta } from '../rpc/client.js'
import { getBlockNumber } from '../rpc/methods.js'
import { RangeSizer } from '../rpc/rangeSizer.js'
import { classifyError, ReplicaLagError } from '../rpc/retry.js'
import type { AppContext } from './context.js'
import type { Stopper } from './stop.js'

export interface RunOptions {
  /** Override the stored cursor (smoke tests / ad-hoc re-index). */
  from?: number
  /** Stop once this block is committed. */
  to?: number
  stop: Stopper
}

export type StepResult = 'committed' | 'idle' | 'done' | 'retry'

export interface CommitInfo {
  leg: Leg['name']
  from: number
  to: number
  result: WriteResult
  blocksPerSec: number
  etaSeconds: number | null
}

const HEAD_CACHE_MS = 5_000

/**
 * Drives one leg: `cursor` is the next block to process; each `step()` does
 * all RPC work for `[cursor, min(cursor + range - 1, head - CONFIRMATIONS)]`,
 * then commits it in one transaction and advances. Catch-up and follow are the
 * same loop, so `tail` and `backfill` differ only in when they stop.
 */
export class LegRunner {
  cursor: number
  readonly sizer: RangeSizer
  private head: { value: number; at: number } | undefined
  private ema: number | undefined
  private lagRetries = 0
  private lastCommit: CommitInfo | undefined

  constructor(
    private readonly ctx: AppContext,
    readonly leg: Leg,
    private readonly opts: RunOptions,
  ) {
    const stored = readCursor(ctx.stmts, leg.cursorKey)
    this.cursor = opts.from ?? stored ?? leg.startBlock(ctx)
    this.sizer = new RangeSizer({
      start: ctx.config.RANGE_START,
      max: ctx.config.RANGE_MAX,
      min: ctx.config.RANGE_MIN,
    })
  }

  get last(): CommitInfo | undefined {
    return this.lastCommit
  }

  get log(): AppContext['log'] {
    return this.ctx.log
  }

  async getHead(force = false): Promise<number> {
    const now = Date.now()
    if (!force && this.head && now - this.head.at < HEAD_CACHE_MS)
      return this.head.value
    const value = await getBlockNumber(this.ctx.rpc)
    this.head = { value, at: now }
    return value
  }

  /** Blocks between the cursor and the confirmed head. */
  async lag(): Promise<number> {
    const head = await this.getHead()
    return Math.max(0, head - this.ctx.config.CONFIRMATIONS + 1 - this.cursor)
  }

  async step(): Promise<StepResult> {
    const { config, log } = this.ctx
    const head = await this.getHead()
    const safeHead = head - config.CONFIRMATIONS
    const hardTo =
      this.opts.to === undefined ? safeHead : Math.min(this.opts.to, safeHead)
    if (this.cursor > hardTo) {
      if (this.opts.to !== undefined && this.cursor > this.opts.to)
        return 'done'
      // maybe the head cache is stale
      const fresh = await this.getHead(true)
      if (this.cursor > fresh - config.CONFIRMATIONS) return 'idle'
      return 'retry'
    }
    const from = this.cursor
    const to = Math.min(from + this.sizer.size - 1, hardTo)
    const exact = safeHead - from < STALE_LAG_BLOCKS
    const started = Date.now()
    const callsBefore = this.ctx.rpc.counters()

    let batch
    try {
      batch = await this.leg.process(this.ctx, from, to, { exact })
    } catch (err) {
      if (err instanceof ReplicaLagError) {
        this.lagRetries += 1
        if (this.lagRetries > 10) throw err
        const wait = Math.min(30_000, 1000 * 2 ** this.lagRetries)
        log.warn(
          {
            leg: this.leg.name,
            from,
            to,
            attempt: this.lagRetries,
            waitMs: wait,
            err: err.message,
          },
          'replica lag detected; retrying batch without committing',
        )
        await this.opts.stop.sleep(wait)
        return 'retry'
      }
      const info = classifyError(err)
      if (info.shrinkRange && !info.rateLimited) {
        const before = this.sizer.size
        if (!this.sizer.onError(info)) {
          throw new Error(
            `range ${from}-${to} rejected at the minimum width (${before}): ${info.message}`,
            { cause: err },
          )
        }
        log.warn(
          {
            leg: this.leg.name,
            from,
            to,
            rangeBefore: before,
            rangeAfter: this.sizer.size,
            cap: this.sizer.cap,
            err: info.message,
          },
          'range rejected; shrinking',
        )
        return 'retry'
      }
      throw err
    }
    this.lagRetries = 0

    const result = writeBatch(this.ctx.db, this.ctx.stmts, batch, {
      cursorKey: this.leg.cursorKey,
      committedAtKey: this.leg.committedAtKey,
    })
    this.sizer.onResult(batch.stats.discoveredLogs)
    this.cursor = to + 1

    const elapsed = Math.max(1, Date.now() - started) / 1000
    const rate = (to - from + 1) / elapsed
    this.ema = this.ema === undefined ? rate : 0.3 * rate + 0.7 * this.ema
    const remaining = Math.max(0, hardTo - this.cursor + 1)
    const eta = this.ema > 0 ? Math.round(remaining / this.ema) : null
    const callsAfter = this.ctx.rpc.counters()
    this.lastCommit = {
      leg: this.leg.name,
      from,
      to,
      result,
      blocksPerSec: this.ema,
      etaSeconds: eta,
    }
    log.info(
      {
        leg: this.leg.name,
        from,
        to,
        blocks: to - from + 1,
        range: this.sizer.size,
        logs: batch.stats.discoveredLogs,
        txs: result.insertedTxs,
        skipped: result.skippedTxs,
        bridge: result.insertedBridge,
        tsInterp: batch.stats.blocksInterpolated,
        blocksPerSec: Number(this.ema.toFixed(1)),
        etaMin: eta === null ? null : Math.round(eta / 60),
        http: callsAfter.httpRequests - callsBefore.httpRequests,
        subCalls: callsAfter.subCalls - callsBefore.subCalls,
        endpoints: endpointUsageDelta(
          callsBefore.endpoints,
          callsAfter.endpoints,
        ),
        rps: Number(this.ctx.rpc.primary.throttle.rps.toFixed(1)),
        lag: remaining,
      },
      'batch committed',
    )
    return 'committed'
  }
}

/** Upper bound for the back-off between failed steps (mirrors `tail`). */
export const MAX_STEP_BACKOFF_MS = 10 * 60_000

/**
 * Run a leg until it is caught up (or `to` is reached) — the `backfill` shape.
 * A step that throws (provider outage, network blip, reboot in progress) is
 * logged and retried after an exponential back-off (`baseBackoffMs` doubling
 * up to 10 minutes) instead of aborting the whole run; the cursor only moves
 * on committed batches, so nothing is skipped.
 */
export async function runLegToEnd(
  runner: LegRunner,
  stop: Stopper,
  onCommit?: (info: CommitInfo) => void | Promise<void>,
  baseBackoffMs = 15_000,
): Promise<void> {
  let consecutiveFailures = 0
  while (!stop.requested) {
    let r: StepResult
    try {
      r = await runner.step()
    } catch (err) {
      consecutiveFailures += 1
      const waitMs = Math.min(
        baseBackoffMs * 2 ** Math.min(consecutiveFailures - 1, 8),
        MAX_STEP_BACKOFF_MS,
      )
      runner.log.error(
        {
          leg: runner.leg.name,
          cursor: runner.cursor,
          attempt: consecutiveFailures,
          waitMs,
          err: (err as Error).message,
        },
        'leg step failed; backing off',
      )
      await stop.sleep(waitMs)
      continue
    }
    consecutiveFailures = 0
    if (r === 'committed' && onCommit && runner.last)
      await onCommit(runner.last)
    if (r === 'done' || r === 'idle') return
  }
}
