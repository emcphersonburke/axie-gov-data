import {
  BaseError,
  HttpRequestError,
  RpcRequestError,
  TimeoutError,
} from 'viem'

import type { Logger } from '../logger.js'
import type { Throttle } from './throttle.js'

/** What an RPC failure means for the caller. */
export interface ErrorInfo {
  /** HTTP 429 or an equivalent JSON-RPC rate-limit message. */
  rateLimited: boolean
  retryAfterMs?: number
  /** Worth retrying as-is after a backoff (5xx, network, timeout). */
  transient: boolean
  /** The provider rejected the block range / result size — shrink and retry. */
  shrinkRange: boolean
  /** Explicit cap parsed from the message ("limit of 200", "over 10000 blocks"). */
  rangeLimit?: number
  status?: number
  code?: number
  message: string
}

const RANGE_RE =
  /limit|too many|exceed|timeout|timed out|413|-32005|-32602|response size|too large|query returned more|ranges? over \d+|block range/i
const RATE_RE = /rate limit|rate-limit|too many requests|throttl|quota/i
/** Provider wording for a backend hiccup that carries no standard code (dRPC "Temporary internal error"). */
const TRANSIENT_RE =
  /temporary internal error|temporarily unavailable|service unavailable|bad gateway|gateway time-?out|try again later/i
/** -32002 wording that means "this method is not on your plan" rather than a passing node hiccup. */
const PLAN_RE =
  /plan|upgrade|not (?:available|supported|enabled|allowed)|unauthori[sz]ed|forbidden/i

/** Thrown when a receipt lacks a log that phase-1 discovery saw: a lagging replica. Never commit; retry the batch. */
export class ReplicaLagError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReplicaLagError'
  }
}

/** Marks an error that must not be retried (bad config, permanent provider rejection). */
export class FatalRpcError extends Error {
  constructor(
    message: string,
    public readonly info: ErrorInfo,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FatalRpcError'
  }
}

function collectText(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  let depth = 0
  while (cur && depth < 6) {
    if (cur instanceof Error) {
      parts.push(cur.message)
      if (cur instanceof BaseError) {
        if (cur.details) parts.push(cur.details)
        if (cur.shortMessage) parts.push(cur.shortMessage)
      }
      if (cur instanceof RpcRequestError && cur.data !== undefined) {
        parts.push(
          typeof cur.data === 'string' ? cur.data : JSON.stringify(cur.data),
        )
      }
      cur = cur.cause
    } else if (typeof cur === 'string') {
      parts.push(cur)
      cur = undefined
    } else {
      cur = undefined
    }
    depth += 1
  }
  return parts.join(' | ')
}

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const secs = Number(value)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(value)
  if (Number.isFinite(at)) return Math.max(0, at - Date.now())
  return undefined
}

function parseRangeLimit(text: string): number | undefined {
  const m =
    /limit of (\d[\d,_]*)/i.exec(text) ??
    /over (\d[\d,_]*) blocks/i.exec(text) ??
    /(?:max(?:imum)?|up to) (\d[\d,_]*) blocks/i.exec(text)
  if (!m?.[1]) return undefined
  const n = Number(m[1].replace(/[,_]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function classifyError(err: unknown): ErrorInfo {
  const text = collectText(err)
  const info: ErrorInfo = {
    rateLimited: false,
    transient: false,
    shrinkRange: false,
    message: text.slice(0, 500),
  }
  if (err instanceof FatalRpcError) return { ...err.info, message: err.message }
  if (err instanceof ReplicaLagError) return info

  if (err instanceof TimeoutError) {
    info.transient = true
    info.shrinkRange = true
    return info
  }
  if (err instanceof HttpRequestError) {
    info.status = err.status
    if (err.status === 429) {
      info.rateLimited = true
      info.retryAfterMs = parseRetryAfter(err.headers?.get('retry-after'))
      return info
    }
    if (err.status === undefined || err.status >= 500 || err.status === 408) {
      info.transient = true
      if (err.status === 408) info.shrinkRange = true
      return info
    }
    if (err.status === 413) {
      info.shrinkRange = true
      return info
    }
    if (RATE_RE.test(text)) {
      // The public Ronin RPC answers oversized JSON-RPC batches with HTTP 400 "Too many requests".
      info.message = `${info.message} (HTTP ${err.status}: if this is a batch, lower RPC_BATCH_SIZE)`
    }
    return info
  }
  // viem maps JSON-RPC errors to RpcError subclasses carrying `code`
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code === 'number') {
    info.code = code
    if (code === 429 || RATE_RE.test(text)) {
      info.rateLimited = true
      return info
    }
    if (code === -32002) {
      // EIP-1474 "resource unavailable": a node hiccup, unless the provider means the method is off-plan
      // ("… not available on your current plan") — then only another endpoint can help.
      info.transient = !PLAN_RE.test(text)
      return info
    }
    if (code === -32005 || code === -32602 || RANGE_RE.test(text)) {
      info.shrinkRange = true
      info.rangeLimit = parseRangeLimit(text)
      return info
    }
    if (code === -32603 || code === -32000 || TRANSIENT_RE.test(text)) {
      // "internal error" — providers use it for transient backend hiccups
      info.transient = true
      return info
    }
    return info
  }
  if (err instanceof Error) {
    if (
      /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(
        text,
      ) ||
      TRANSIENT_RE.test(text)
    ) {
      info.transient = true
    }
    if (RATE_RE.test(text)) info.rateLimited = true
    else if (RANGE_RE.test(text)) {
      info.shrinkRange = true
      info.rangeLimit = parseRangeLimit(text)
    }
  }
  return info
}

export interface RetryOptions {
  throttle: Throttle
  label: string
  log?: Logger
  /** Attempts for transient failures (default 7 = 6 retries). */
  maxAttempts?: number
  /** Attempts while rate limited; each one waits out the throttle pause (default 40). */
  maxRateLimitAttempts?: number
  /** Return true to rethrow immediately (e.g. range errors the caller handles by shrinking). */
  propagate?: (info: ErrorInfo) => boolean
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  baseDelayMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run `fn` under the throttle with retries: 429 → AIMD pause and retry,
 * transient → exponential backoff with jitter, everything else → throw.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 7
  const maxRateLimitAttempts = opts.maxRateLimitAttempts ?? 40
  const sleep = opts.sleep ?? defaultSleep
  const random = opts.random ?? Math.random
  const baseDelay = opts.baseDelayMs ?? 500
  let transientAttempts = 0
  let rateLimitAttempts = 0
  for (;;) {
    const release = await opts.throttle.acquire()
    let result: T
    try {
      result = await fn()
    } catch (err) {
      release()
      const info = classifyError(err)
      if (opts.propagate?.(info)) throw err
      if (info.rateLimited) {
        rateLimitAttempts += 1
        const pause = opts.throttle.onRateLimited(info.retryAfterMs)
        opts.log?.warn(
          {
            label: opts.label,
            pauseMs: Math.round(pause),
            rps: opts.throttle.rps.toFixed(2),
            attempt: rateLimitAttempts,
          },
          'rate limited; pausing',
        )
        if (rateLimitAttempts >= maxRateLimitAttempts) throw err
        continue
      }
      if (info.transient) {
        transientAttempts += 1
        if (transientAttempts >= maxAttempts) throw err
        const delay =
          baseDelay * 2 ** (transientAttempts - 1) * (0.5 + random())
        opts.log?.warn(
          {
            label: opts.label,
            attempt: transientAttempts,
            delayMs: Math.round(delay),
            status: info.status,
            err: info.message,
          },
          'transient RPC failure; retrying',
        )
        await sleep(delay)
        continue
      }
      throw err
    }
    release()
    opts.throttle.onSuccess()
    return result
  }
}
