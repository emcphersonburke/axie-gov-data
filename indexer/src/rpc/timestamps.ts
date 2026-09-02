import type { Logger } from '../logger.js'
import type { Rpc } from './client.js'
import { getBlockHeader } from './methods.js'

export interface BlockTs {
  number: number
  ts: number
  source: 'rpc' | 'interp'
}

export interface TimestampPlan {
  /** Blocks to fetch exactly. */
  exact: number[]
  /** Anchor blocks to fetch (interpolation mode), excluding those already known. */
  anchors: number[]
  /** Blocks whose timestamp will be interpolated. */
  interpolated: number[]
}

export interface Anchor {
  number: number
  ts: number
}

/**
 * Decide how to obtain timestamps for `blocks` inside `range`: fetch each
 * exactly when in tail mode or when that is no more calls than anchoring the
 * range every `anchorInterval` blocks; otherwise fetch anchors and interpolate.
 */
export function planTimestamps(
  blocks: readonly number[],
  known: ReadonlySet<number>,
  range: { from: number; to: number },
  opts: { exact: boolean; anchorInterval: number },
): TimestampPlan {
  const missing = [...new Set(blocks)]
    .filter((b) => !known.has(b))
    .sort((a, b) => a - b)
  if (missing.length === 0) return { exact: [], anchors: [], interpolated: [] }
  const anchorSet = new Set<number>()
  for (let b = range.from; b <= range.to; b += opts.anchorInterval)
    anchorSet.add(b)
  anchorSet.add(range.to)
  const anchors = [...anchorSet].filter((b) => !known.has(b))
  if (opts.exact || missing.length <= anchors.length) {
    return { exact: missing, anchors: [], interpolated: [] }
  }
  return { exact: [], anchors, interpolated: missing }
}

/** Linear interpolation between the nearest anchors (sorted ascending); clamps outside the anchored span. */
export function interpolate(anchors: readonly Anchor[], block: number): number {
  if (anchors.length === 0) throw new Error('interpolate: no anchors')
  const first = anchors[0] as Anchor
  const last = anchors[anchors.length - 1] as Anchor
  if (block <= first.number) return first.ts
  if (block >= last.number) return last.ts
  let lo = 0
  let hi = anchors.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((anchors[mid] as Anchor).number <= block) lo = mid
    else hi = mid
  }
  const a = anchors[lo] as Anchor
  const b = anchors[hi] as Anchor
  if (a.number === block) return a.ts
  if (b.number === a.number) return a.ts
  const t = (block - a.number) / (b.number - a.number)
  return Math.round(a.ts + t * (b.ts - a.ts))
}

export interface ResolveOptions {
  /** Timestamps already known, e.g. from `blockTimestamp` on logs. */
  known: ReadonlyMap<number, number>
  range: { from: number; to: number }
  exact: boolean
  anchorInterval: number
  log?: Logger
}

async function fetchHeaders(
  rpc: Rpc,
  numbers: readonly number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const results = await Promise.all(numbers.map((n) => getBlockHeader(rpc, n)))
  results.forEach((h, i) => {
    const n = numbers[i] as number
    if (!h)
      throw new Error(
        `eth_getBlockByNumber(${n}) returned null (pruned or lagging node)`,
      )
    out.set(n, h.timestamp)
  })
  return out
}

/** Timestamps for every block in `blocks`, exact where cheap, interpolated otherwise. */
export async function resolveTimestamps(
  rpc: Rpc,
  blocks: readonly number[],
  opts: ResolveOptions,
): Promise<Map<number, BlockTs>> {
  const result = new Map<number, BlockTs>()
  const wanted = [...new Set(blocks)]
  for (const b of wanted) {
    const ts = opts.known.get(b)
    if (ts !== undefined) result.set(b, { number: b, ts, source: 'rpc' })
  }
  const plan = planTimestamps(
    wanted,
    new Set(opts.known.keys()),
    opts.range,
    opts,
  )
  if (plan.exact.length > 0) {
    const fetched = await fetchHeaders(rpc, plan.exact)
    for (const [n, ts] of fetched)
      result.set(n, { number: n, ts, source: 'rpc' })
  }
  if (plan.interpolated.length > 0) {
    const fetched = await fetchHeaders(rpc, plan.anchors)
    const anchors: Anchor[] = [
      ...[...opts.known].map(([number, ts]) => ({ number, ts })),
      ...[...fetched].map(([number, ts]) => ({ number, ts })),
    ].sort((a, b) => a.number - b.number)
    for (const n of plan.interpolated) {
      const exact = fetched.get(n)
      result.set(
        n,
        exact === undefined
          ? { number: n, ts: interpolate(anchors, n), source: 'interp' }
          : { number: n, ts: exact, source: 'rpc' },
      )
    }
    opts.log?.debug(
      { anchors: plan.anchors.length, interpolated: plan.interpolated.length },
      'timestamps interpolated',
    )
  }
  return result
}
