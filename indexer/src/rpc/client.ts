import type { PublicClient } from 'viem'
import { createPublicClient, http } from 'viem'
import { ronin } from 'viem/chains'

import type { Config, RpcEndpointConfig } from '../config.js'
import type { Logger } from '../logger.js'
import type { ErrorInfo } from './retry.js'
import { classifyError, withRetry } from './retry.js'
import { Throttle } from './throttle.js'

/** viem's default is 10 MB, which a batch of receipt-heavy transactions can exceed. */
export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024 * 1024

export interface RpcCounters {
  httpRequests: number
  subCalls: number
  httpErrors: number
  bytesIn: number
  /** Sub-calls that failed with a non-rate-limit error (each one triggers failover / a cooldown). */
  failures: number
}

/** Circuit-breaker state of one endpoint. */
export interface EndpointHealth {
  /** Epoch ms until which the endpoint is skipped while an alternative exists; 0 when healthy. */
  cooldownUntil: number
  /** Length of the current cooldown: COOLDOWN_START_MS, doubling per consecutive failure up to COOLDOWN_MAX_MS. */
  cooldownMs: number
  consecutiveFailures: number
}

export interface Endpoint {
  /** URL host (no path, no credentials); suffixed with `#<index>` if two endpoints share a host. */
  readonly label: string
  readonly config: RpcEndpointConfig
  readonly client: PublicClient
  readonly throttle: Throttle
  readonly counters: RpcCounters
  readonly health: EndpointHealth
}

/** Capabilities discovered at runtime (the day-1 probe). */
export interface RpcFeatures {
  /** Whether `eth_getLogs` entries carry `blockTimestamp` (saves phase 3 entirely). */
  logBlockTimestamp?: boolean
}

export interface RequestOptions {
  label?: string
  /** Rethrow immediately instead of retrying when this returns true. */
  propagate?: (info: ErrorInfo) => boolean
  /** Rounds over all eligible endpoints before a transient failure is given up on (default 7). */
  maxAttempts?: number
}

export interface EndpointReport extends RpcCounters {
  label: string
  rps: number
  priority: number
  methods?: readonly string[]
  /** Remaining cooldown in ms (0 when healthy). */
  cooldownMs: number
}

/** `{ <host>: { http, sub } }` — request counts per endpoint. */
export type EndpointUsage = Record<string, { http: number; sub: number }>

export interface CountersReport extends RpcCounters {
  perEndpoint: EndpointReport[]
  endpoints: EndpointUsage
}

/** Thrown when every endpoint has a `methods` allowlist and none of them lists the requested method. */
export class NoEndpointForMethod extends Error {
  constructor(
    readonly method: string,
    endpoints: readonly string[],
  ) {
    super(
      `no RPC endpoint serves ${method}: every endpoint has a methods allowlist and none lists it (endpoints: ${endpoints.join(', ')})`,
    )
    this.name = 'NoEndpointForMethod'
  }
}

export interface RpcOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  /** Replaces global fetch for every endpoint (tests). */
  fetch?: typeof fetch
  cooldownStartMs?: number
  cooldownMaxMs?: number
  /** Largest HTTP response body accepted (bytes); defaults to 256 MB. */
  maxResponseBytes?: number
  /** Base delay of the backoff applied once every eligible endpoint has failed (default 500 ms). */
  baseDelayMs?: number
}

export const COOLDOWN_START_MS = 30_000
export const COOLDOWN_MAX_MS = 600_000

type RawRequest = (args: {
  method: string
  params?: unknown
}) => Promise<unknown>

function makeEndpoint(
  cfg: RpcEndpointConfig,
  label: string,
  concurrency: number,
  opts: RpcOptions,
): Endpoint {
  const counters: RpcCounters = {
    httpRequests: 0,
    subCalls: 0,
    httpErrors: 0,
    bytesIn: 0,
    failures: 0,
  }
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers['X-API-KEY'] = cfg.apiKey
  if (cfg.basicAuth)
    headers['Authorization'] =
      `Basic ${Buffer.from(cfg.basicAuth).toString('base64')}`
  const client = createPublicClient({
    chain: ronin,
    transport: http(cfg.url, {
      batch: { batchSize: cfg.batchSize, wait: 10 },
      maxResponseBodySize: opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      fetchOptions: { headers },
      fetchFn: opts.fetch,
      retryCount: 0,
      timeout: 30_000,
      onFetchRequest: () => {
        counters.httpRequests += 1
      },
      onFetchResponse: (res) => {
        if (!res.ok) counters.httpErrors += 1
        const len = Number(res.headers.get('content-length'))
        if (Number.isFinite(len)) counters.bytesIn += len
      },
    }),
  })
  return {
    label,
    config: cfg,
    client,
    throttle: new Throttle({
      startRps: cfg.rps,
      maxRps: cfg.maxRps,
      concurrency,
      batchSize: cfg.batchSize,
      now: opts.now,
    }),
    counters,
    health: { cooldownUntil: 0, cooldownMs: 0, consecutiveFailures: 0 },
  }
}

/** Pending work per unit of rate; paused (rate-limited) endpoints are pushed to the back. */
function leastLoaded(endpoints: readonly Endpoint[]): Endpoint | undefined {
  let best: Endpoint | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const ep of endpoints) {
    const s = ep.throttle.snapshot()
    const score =
      (s.inFlight + s.queued + 1) / Math.max(ep.throttle.rps, 0.1) +
      s.pausedForMs / 1000
    if (score < bestScore) {
      best = ep
      bestScore = score
    }
  }
  return best
}

/** Per-endpoint request counts between two `counters()` snapshots (what one batch cost on each host). */
export function endpointUsageDelta(
  before: EndpointUsage,
  after: EndpointUsage,
): EndpointUsage {
  const out: EndpointUsage = {}
  for (const [label, a] of Object.entries(after)) {
    const b = before[label]
    out[label] = { http: a.http - (b?.http ?? 0), sub: a.sub - (b?.sub ?? 0) }
  }
  return out
}

/**
 * Pool of viem clients (one per endpoint) with per-endpoint throttles and a
 * circuit breaker. Every call goes through `request()`, which routes by
 * method — endpoints whose `methods` allowlist names the method first (by
 * priority), then endpoints without an allowlist (by priority) — and fails
 * over to the next candidate as soon as one errors. Rate limits stay on the
 * endpoint that raised them (AIMD pause and retry); range caps propagate to
 * the caller. The Sky Mavis API key is only ever attached to the primary.
 */
export class Rpc {
  readonly endpoints: readonly Endpoint[]
  readonly features: RpcFeatures = {}
  private readonly log: Logger
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number
  private readonly cooldownStartMs: number
  private readonly cooldownMaxMs: number
  private readonly baseDelayMs: number
  private readonly routes = new Map<string, readonly Endpoint[]>()

  constructor(config: Config, log: Logger, opts: RpcOptions = {}) {
    this.log = log
    this.now = opts.now ?? Date.now
    this.sleep =
      opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
    this.random = opts.random ?? Math.random
    this.cooldownStartMs = opts.cooldownStartMs ?? COOLDOWN_START_MS
    this.cooldownMaxMs = opts.cooldownMaxMs ?? COOLDOWN_MAX_MS
    this.baseDelayMs = opts.baseDelayMs ?? 500
    const labels = new Set<string>()
    this.endpoints = config.endpoints.map((e, i) => {
      let label = new URL(e.url).host
      if (labels.has(label)) label = `${label}#${i}`
      labels.add(label)
      return makeEndpoint(e, label, config.RPC_CONCURRENCY, opts)
    })
    if (this.endpoints.length === 0)
      throw new Error('no RPC endpoints configured')
  }

  get primary(): Endpoint {
    return this.endpoints[0] as Endpoint
  }

  /**
   * Endpoints allowed to serve `method`, most preferred first: those whose
   * allowlist names it (by priority, config order on ties), then those with
   * no allowlist (by priority).
   */
  candidates(method: string): readonly Endpoint[] {
    let list = this.routes.get(method)
    if (!list) {
      const byPriority = (a: Endpoint, b: Endpoint) =>
        a.config.priority - b.config.priority
      list = [
        ...this.endpoints
          .filter((e) => e.config.methods?.includes(method))
          .sort(byPriority),
        ...this.endpoints
          .filter((e) => e.config.methods === undefined)
          .sort(byPriority),
      ]
      if (list.length === 0)
        throw new NoEndpointForMethod(
          method,
          this.endpoints.map((e) => e.label),
        )
      this.routes.set(method, list)
    }
    return list
  }

  /**
   * Where the next call for `method` goes. Endpoints in cooldown are skipped;
   * among the healthy ones only the first tier (same allowlist status and
   * priority) is considered, and inside a tier the least-loaded endpoint
   * wins — the pre-routing pool behaviour, so equal-priority endpoints still
   * share load. When every candidate is cooling down, the one that recovers
   * first is used so nothing ever dead-locks.
   */
  pickEndpoint(method: string, exclude?: ReadonlySet<Endpoint>): Endpoint {
    const all = this.candidates(method)
    const candidates = exclude ? all.filter((e) => !exclude.has(e)) : all
    if (candidates.length === 0)
      throw new Error(`pickEndpoint(${method}): every candidate is excluded`)
    const now = this.now()
    const healthy = candidates.filter((e) => e.health.cooldownUntil <= now)
    const lead = healthy[0]
    if (!lead)
      return candidates.reduce((a, b) =>
        b.health.cooldownUntil < a.health.cooldownUntil ? b : a,
      )
    const tier = healthy.filter(
      (e) =>
        Boolean(e.config.methods) === Boolean(lead.config.methods) &&
        e.config.priority === lead.config.priority,
    )
    return leastLoaded(tier) ?? lead
  }

  async request<T>(
    method: string,
    params: unknown[],
    opts: RequestOptions = {},
  ): Promise<T> {
    const candidates = this.candidates(method)
    const maxAttempts = opts.maxAttempts ?? 7
    const label = opts.label ?? method
    const failed = new Set<Endpoint>()
    let rounds = 0
    let anyTransient = false
    for (;;) {
      const ep = this.pickEndpoint(method, failed)
      ep.counters.subCalls += 1
      const raw = ep.client.request as unknown as RawRequest
      try {
        const result = await withRetry(
          () => raw({ method, params }) as Promise<T>,
          {
            throttle: ep.throttle,
            label: `${label}@${ep.label}`,
            log: this.log,
            propagate: opts.propagate,
            // a transient failure moves to the next endpoint instead of retrying here
            maxAttempts: 1,
            sleep: this.sleep,
            random: this.random,
          },
        )
        this.markSuccess(ep)
        return result
      } catch (err) {
        const info = classifyError(err)
        // Range caps belong to the range sizer, and an exhausted rate-limit wait is not the endpoint's fault.
        // Oversized responses are the caller's to split up (smaller batches), not an endpoint fault.
        if (opts.propagate?.(info) || info.rateLimited || info.oversized)
          throw err
        this.markFailure(ep, info)
        failed.add(ep)
        anyTransient ||= info.transient
        if (failed.size < candidates.length) continue
        // every eligible endpoint failed this round
        rounds += 1
        if (!anyTransient || rounds >= maxAttempts) throw err
        const delay =
          this.baseDelayMs * 2 ** (rounds - 1) * (0.5 + this.random())
        this.log.warn(
          {
            label,
            attempt: rounds,
            delayMs: Math.round(delay),
            tried: [...failed].map((e) => e.label),
            status: info.status,
            err: info.message,
          },
          'transient RPC failure on every endpoint; retrying',
        )
        await this.sleep(delay)
        failed.clear()
        anyTransient = false
      }
    }
  }

  /**
   * Put `ep` in cooldown. A failure while already cooling down does not
   * compound (concurrent in-flight calls all fail at once); a failure after
   * the cooldown expired doubles it.
   */
  private markFailure(ep: Endpoint, info: ErrorInfo): void {
    ep.counters.failures += 1
    const h = ep.health
    const now = this.now()
    if (now < h.cooldownUntil) return
    h.consecutiveFailures += 1
    h.cooldownMs =
      h.consecutiveFailures === 1
        ? this.cooldownStartMs
        : Math.min(this.cooldownMaxMs, h.cooldownMs * 2)
    h.cooldownUntil = now + h.cooldownMs
    this.log.warn(
      {
        host: ep.label,
        cooldownMs: h.cooldownMs,
        consecutiveFailures: h.consecutiveFailures,
        status: info.status,
        code: info.code,
        reason: info.message,
      },
      'endpoint failed; entering cooldown',
    )
  }

  private markSuccess(ep: Endpoint): void {
    const h = ep.health
    if (h.consecutiveFailures === 0) return
    const failures = h.consecutiveFailures
    h.consecutiveFailures = 0
    h.cooldownMs = 0
    h.cooldownUntil = 0
    this.log.info(
      { host: ep.label, failures },
      'endpoint recovered; cooldown cleared',
    )
  }

  counters(): CountersReport {
    const now = this.now()
    const total: RpcCounters = {
      httpRequests: 0,
      subCalls: 0,
      httpErrors: 0,
      bytesIn: 0,
      failures: 0,
    }
    const endpoints: EndpointUsage = {}
    const perEndpoint = this.endpoints.map((ep) => {
      total.httpRequests += ep.counters.httpRequests
      total.subCalls += ep.counters.subCalls
      total.httpErrors += ep.counters.httpErrors
      total.bytesIn += ep.counters.bytesIn
      total.failures += ep.counters.failures
      endpoints[ep.label] = {
        http: ep.counters.httpRequests,
        sub: ep.counters.subCalls,
      }
      return {
        label: ep.label,
        rps: ep.throttle.rps,
        priority: ep.config.priority,
        methods: ep.config.methods,
        cooldownMs: Math.max(0, ep.health.cooldownUntil - now),
        ...ep.counters,
      }
    })
    return { ...total, perEndpoint, endpoints }
  }

  dispose(): void {
    for (const ep of this.endpoints) ep.throttle.dispose()
  }
}
