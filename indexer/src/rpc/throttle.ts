/**
 * Token bucket + semaphore + AIMD rate control for one RPC endpoint.
 *
 * Tokens are *HTTP requests*: viem batches sub-calls issued within its 10 ms
 * window into one JSON-RPC batch, so one token admits up to `batchSize`
 * sub-calls issued within `batchWindowMs`. That way `rps` means requests/s no
 * matter how full the batches are, and callers never have to think about
 * batching. The semaphore caps in-flight sub-calls so batches actually fill.
 *
 * AIMD: a 429 multiplies `rps` by 0.7 and pauses *every* caller until
 * `Retry-After` (or 2^attempt seconds, capped at 60 s, jittered) has elapsed; a
 * clean minute adds 1 rps up to `maxRps`.
 */
export interface ThrottleOptions {
  startRps: number
  maxRps: number
  minRps?: number
  concurrency: number
  batchSize: number
  batchWindowMs?: number
  cleanIntervalMs?: number
  maxPauseMs?: number
  now?: () => number
  random?: () => number
}

export interface ThrottleSnapshot {
  rps: number
  inFlight: number
  queued: number
  pausedForMs: number
  granted: number
  rateLimits: number
  pausedMsTotal: number
}

export class Throttle {
  rps: number
  private readonly maxRps: number
  private readonly minRps: number
  private readonly concurrency: number
  private readonly batchSize: number
  private readonly batchWindowMs: number
  private readonly cleanIntervalMs: number
  private readonly maxPauseMs: number
  private readonly now: () => number
  private readonly random: () => number

  private tokens: number
  private lastRefill: number
  private slots = 0
  private slotsExpireAt = 0
  private inFlight = 0
  private readonly queue: Array<() => void> = []
  private timer: NodeJS.Timeout | undefined
  private pausedUntil = 0
  private lastRateLimitAt = Number.NEGATIVE_INFINITY
  private lastIncreaseAt: number
  private consecutiveRateLimits = 0
  private granted = 0
  private rateLimits = 0
  private pausedMsTotal = 0

  constructor(opts: ThrottleOptions) {
    this.rps = opts.startRps
    this.maxRps = opts.maxRps
    this.minRps = opts.minRps ?? 0.2
    this.concurrency = opts.concurrency
    this.batchSize = Math.max(1, opts.batchSize)
    this.batchWindowMs = opts.batchWindowMs ?? 15
    this.cleanIntervalMs = opts.cleanIntervalMs ?? 60_000
    this.maxPauseMs = opts.maxPauseMs ?? 60_000
    this.now = opts.now ?? Date.now
    this.random = opts.random ?? Math.random
    this.tokens = Math.max(1, this.rps)
    this.lastRefill = this.now()
    this.lastIncreaseAt = this.lastRefill
  }

  /** Resolves when the caller may issue one sub-call. Call the returned function when it settles. */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      this.queue.push(() => {
        let released = false
        resolve(() => {
          if (released) return
          released = true
          this.inFlight -= 1
          this.pump()
        })
      })
      this.pump()
    })
  }

  /** Record a 429. Returns the pause applied in ms. */
  onRateLimited(retryAfterMs?: number): number {
    const now = this.now()
    this.rateLimits += 1
    this.lastRateLimitAt = now
    const alreadyPaused = now < this.pausedUntil
    if (!alreadyPaused) {
      this.consecutiveRateLimits += 1
      this.rps = Math.max(this.minRps, this.rps * 0.7)
      this.tokens = 0
      this.slots = 0
    }
    // Retry-After is authoritative; only the exponential fallback gets jitter.
    const pause =
      retryAfterMs !== undefined
        ? Math.min(this.maxPauseMs, retryAfterMs)
        : Math.min(
            this.maxPauseMs,
            1000 *
              2 ** this.consecutiveRateLimits *
              (0.85 + this.random() * 0.3),
          )
    const until = now + pause
    if (until > this.pausedUntil) {
      this.pausedMsTotal += until - Math.max(now, this.pausedUntil)
      this.pausedUntil = until
    }
    this.schedule()
    return Math.max(0, this.pausedUntil - now)
  }

  /** Record a successful call: resets the 429 streak and applies the additive increase after a clean minute. */
  onSuccess(): void {
    const now = this.now()
    this.consecutiveRateLimits = 0
    if (
      now - this.lastRateLimitAt >= this.cleanIntervalMs &&
      now - this.lastIncreaseAt >= this.cleanIntervalMs &&
      this.rps < this.maxRps
    ) {
      this.rps = Math.min(this.maxRps, this.rps + 1)
      this.lastIncreaseAt = now
    }
  }

  get paused(): boolean {
    return this.now() < this.pausedUntil
  }

  snapshot(): ThrottleSnapshot {
    return {
      rps: this.rps,
      inFlight: this.inFlight,
      queued: this.queue.length,
      pausedForMs: Math.max(0, this.pausedUntil - this.now()),
      granted: this.granted,
      rateLimits: this.rateLimits,
      pausedMsTotal: this.pausedMsTotal,
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  private refill(now: number): void {
    const elapsed = (now - this.lastRefill) / 1000
    if (elapsed <= 0) return
    this.tokens = Math.min(
      Math.max(1, this.rps),
      this.tokens + elapsed * this.rps,
    )
    this.lastRefill = now
  }

  private pump(): void {
    const now = this.now()
    if (now < this.pausedUntil) {
      this.schedule()
      return
    }
    this.refill(now)
    while (this.queue.length > 0 && this.inFlight < this.concurrency) {
      if (this.slots > 0 && now < this.slotsExpireAt) {
        this.slots -= 1
      } else if (this.tokens >= 1) {
        this.tokens -= 1
        this.slots = this.batchSize - 1
        this.slotsExpireAt = now + this.batchWindowMs
      } else {
        break
      }
      this.inFlight += 1
      this.granted += 1
      const next = this.queue.shift()
      next?.()
    }
    if (this.queue.length > 0) this.schedule()
  }

  private schedule(): void {
    if (this.timer || this.queue.length === 0) return
    const now = this.now()
    let wait: number
    if (now < this.pausedUntil) wait = this.pausedUntil - now
    else if (this.inFlight >= this.concurrency)
      return // release() will pump
    else wait = Math.max(1, ((1 - this.tokens) / this.rps) * 1000)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.pump()
    }, Math.ceil(wait))
  }
}
