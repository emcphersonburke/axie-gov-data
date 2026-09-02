import type { PublicClient } from 'viem'
import { createPublicClient, http } from 'viem'
import { ronin } from 'viem/chains'

import type { Config, RpcEndpointConfig } from '../config.js'
import type { Logger } from '../logger.js'
import type { ErrorInfo } from './retry.js'
import { withRetry } from './retry.js'
import { Throttle } from './throttle.js'

export interface RpcCounters {
  httpRequests: number
  subCalls: number
  httpErrors: number
  bytesIn: number
}

export interface Endpoint {
  readonly label: string
  readonly config: RpcEndpointConfig
  readonly client: PublicClient
  readonly throttle: Throttle
  readonly counters: RpcCounters
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
  maxAttempts?: number
}

type RawRequest = (args: {
  method: string
  params?: unknown
}) => Promise<unknown>

function makeEndpoint(
  cfg: RpcEndpointConfig,
  concurrency: number,
  counters: RpcCounters,
): Endpoint {
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers['X-API-KEY'] = cfg.apiKey
  const client = createPublicClient({
    chain: ronin,
    transport: http(cfg.url, {
      batch: { batchSize: cfg.batchSize, wait: 10 },
      fetchOptions: { headers },
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
  const label = new URL(cfg.url).host
  return {
    label,
    config: cfg,
    client,
    throttle: new Throttle({
      startRps: cfg.rps,
      maxRps: cfg.maxRps,
      concurrency,
      batchSize: cfg.batchSize,
    }),
    counters,
  }
}

/**
 * Pool of viem clients (one per endpoint) with per-endpoint throttles. Every
 * call goes through `request()`, which picks the least-loaded endpoint that is
 * not paused and applies retry/AIMD. The API key is only ever attached to the
 * primary endpoint's headers.
 */
export class Rpc {
  readonly endpoints: readonly Endpoint[]
  readonly features: RpcFeatures = {}
  private readonly log: Logger

  constructor(config: Config, log: Logger) {
    this.log = log
    this.endpoints = config.endpoints.map((e) =>
      makeEndpoint(e, config.RPC_CONCURRENCY, {
        httpRequests: 0,
        subCalls: 0,
        httpErrors: 0,
        bytesIn: 0,
      }),
    )
    if (this.endpoints.length === 0)
      throw new Error('no RPC endpoints configured')
  }

  get primary(): Endpoint {
    return this.endpoints[0] as Endpoint
  }

  pickEndpoint(): Endpoint {
    let best: Endpoint | undefined
    let bestScore = Number.POSITIVE_INFINITY
    for (const ep of this.endpoints) {
      const s = ep.throttle.snapshot()
      // pending work per unit of rate; paused endpoints are pushed to the back
      const score =
        (s.inFlight + s.queued + 1) / Math.max(ep.throttle.rps, 0.1) +
        s.pausedForMs / 1000
      if (score < bestScore) {
        best = ep
        bestScore = score
      }
    }
    return best ?? this.primary
  }

  async request<T>(
    method: string,
    params: unknown[],
    opts: RequestOptions = {},
  ): Promise<T> {
    const ep = this.pickEndpoint()
    ep.counters.subCalls += 1
    const raw = ep.client.request as unknown as RawRequest
    return withRetry(() => raw({ method, params }) as Promise<T>, {
      throttle: ep.throttle,
      label: `${opts.label ?? method}@${ep.label}`,
      log: this.log,
      propagate: opts.propagate,
      maxAttempts: opts.maxAttempts,
    })
  }

  counters(): RpcCounters & {
    perEndpoint: Array<{ label: string; rps: number } & RpcCounters>
  } {
    const total: RpcCounters = {
      httpRequests: 0,
      subCalls: 0,
      httpErrors: 0,
      bytesIn: 0,
    }
    const perEndpoint = this.endpoints.map((ep) => {
      total.httpRequests += ep.counters.httpRequests
      total.subCalls += ep.counters.subCalls
      total.httpErrors += ep.counters.httpErrors
      total.bytesIn += ep.counters.bytesIn
      return { label: ep.label, rps: ep.throttle.rps, ...ep.counters }
    })
    return { ...total, perEndpoint }
  }

  dispose(): void {
    for (const ep of this.endpoints) ep.throttle.dispose()
  }
}
