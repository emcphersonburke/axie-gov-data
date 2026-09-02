import type { ErrorInfo } from './retry.js'

export interface RangeSizerOptions {
  start: number
  max: number
  min: number
  /** Grow while a range returned fewer results than this. */
  growBelow?: number
  growFactor?: number
}

/**
 * Adaptive block-range width for `eth_getLogs`: grow ×1.5 while results stay
 * comfortably under the provider's cap, halve on limit/timeout errors (floor
 * `min`), pin to an explicit cap when the error message states one, and never
 * react to 429s (those are the throttle's business).
 */
export class RangeSizer {
  size: number
  /** Provider cap learned from an error message, if any. */
  cap: number | undefined
  private readonly max: number
  private readonly min: number
  private readonly growBelow: number
  private readonly growFactor: number

  constructor(opts: RangeSizerOptions) {
    this.size = opts.start
    this.max = opts.max
    this.min = Math.min(opts.min, opts.start)
    this.growBelow = opts.growBelow ?? 5000
    this.growFactor = opts.growFactor ?? 1.5
  }

  get effectiveMax(): number {
    return this.cap === undefined ? this.max : Math.min(this.max, this.cap)
  }

  onResult(resultCount: number): void {
    if (resultCount < this.growBelow) {
      this.size = Math.min(
        this.effectiveMax,
        Math.floor(this.size * this.growFactor),
      )
    }
    this.size = Math.max(this.min, Math.min(this.size, this.effectiveMax))
  }

  /** Returns false when the error did not shrink the range (rate limit, or already at the floor). */
  onError(info: ErrorInfo): boolean {
    if (info.rateLimited || !info.shrinkRange) return false
    const before = this.size
    if (info.rangeLimit !== undefined && info.rangeLimit >= 1) {
      this.cap = Math.min(this.cap ?? Number.POSITIVE_INFINITY, info.rangeLimit)
      this.size = Math.min(this.size, this.cap)
    }
    if (this.size === before) this.size = Math.floor(this.size / 2)
    this.size = Math.max(Math.min(this.min, this.effectiveMax), this.size)
    return this.size < before
  }
}
