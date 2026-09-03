import { afterEach, describe, expect, it, vi } from 'vitest'

import { silentLogger } from '../src/logger.js'
import type { Endpoint } from '../src/rpc/client.js'
import {
  endpointUsageDelta,
  NoEndpointForMethod,
  Rpc,
} from '../src/rpc/client.js'
import { getLogs } from '../src/rpc/methods.js'
import { classifyError } from '../src/rpc/retry.js'
import { testConfig } from './helpers.js'

/**
 * One fake JSON-RPC provider per host. A handler returns the result, or an
 * `HttpFailure` / `RpcFailure` to answer with an HTTP status / JSON-RPC error;
 * throwing simulates a network failure.
 */
type Handler = (method: string, params: unknown, headers: Headers) => unknown

class HttpFailure {
  constructor(
    readonly status: number,
    readonly headers: Record<string, string> = {},
  ) {}
}
class RpcFailure {
  constructor(
    readonly code: number,
    readonly message: string,
  ) {}
}

interface Call {
  host: string
  method: string
}

interface RpcRequest {
  id: number
  method: string
  params: unknown
}

function fakeFetch(handlers: Record<string, Handler>) {
  const calls: Call[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const host = new URL(href).host
    const handler = handlers[host]
    if (!handler) return new Response('no such host', { status: 404 })
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body)) as RpcRequest | RpcRequest[]
    const requests = Array.isArray(body) ? body : [body]
    const out: unknown[] = []
    for (const r of requests) {
      calls.push({ host, method: r.method })
      const res = await handler(r.method, r.params, headers)
      if (res instanceof HttpFailure)
        return new Response(`HTTP ${res.status}`, {
          status: res.status,
          headers: res.headers,
        })
      if (res instanceof RpcFailure)
        out.push({
          jsonrpc: '2.0',
          id: r.id,
          error: { code: res.code, message: res.message },
        })
      else out.push({ jsonrpc: '2.0', id: r.id, result: res })
    }
    return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return {
    fetchFn,
    calls,
    on: (host: string) => calls.filter((c) => c.host === host),
  }
}

const PRIMARY = 'https://primary.example/rpc'
const BACKUP = 'https://backup.example/rpc'
const LOGS = 'https://logs.example/v2/AbCdEfGhIjKlMnOpQrStUv'

const rpcs: Rpc[] = []

function makeRpc(
  env: Record<string, string>,
  handlers: Record<string, Handler>,
) {
  const config = testConfig({
    RONIN_RPC_URL: PRIMARY,
    RPC_START_RPS: '1000',
    RPC_MAX_RPS: '1000',
    RPC_BATCH_SIZE: '1',
    ...env,
  })
  const fake = fakeFetch(handlers)
  const sleeps: number[] = []
  const rpc = new Rpc(config, silentLogger, {
    fetch: fake.fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0.5,
  })
  rpcs.push(rpc)
  return { rpc, sleeps, ...fake }
}

const labels = (eps: readonly Endpoint[]) => eps.map((e) => e.label)
const filter = { fromBlock: 1, toBlock: 2, address: [] }

afterEach(() => {
  for (const rpc of rpcs.splice(0)) rpc.dispose()
  vi.useRealTimers()
})

describe('Rpc routing', () => {
  it('sends allowlisted methods to their endpoints first, everything else to general endpoints by priority', async () => {
    const { rpc, on } = makeRpc(
      {
        RPC_URLS: `${LOGS}|1000|1|methods=eth_getLogs;priority=0, ${BACKUP}|1000|1|priority=10`,
      },
      {
        'primary.example': () => '0x10',
        'logs.example': (m) =>
          m === 'eth_getLogs' ? [] : new RpcFailure(-32601, 'method not found'),
        'backup.example': () => '0x99',
      },
    )
    expect(labels(rpc.candidates('eth_getLogs'))).toEqual([
      'logs.example',
      'primary.example',
      'backup.example',
    ])
    expect(labels(rpc.candidates('eth_getTransactionReceipt'))).toEqual([
      'primary.example',
      'backup.example',
    ])
    await expect(getLogs(rpc, filter)).resolves.toEqual([])
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x10')
    expect(on('logs.example').map((c) => c.method)).toEqual(['eth_getLogs'])
    expect(on('primary.example').map((c) => c.method)).toEqual([
      'eth_blockNumber',
    ])
    expect(on('backup.example')).toEqual([])
  })

  it('orders candidates by priority, not config order, and honours the primary allowlist', async () => {
    const { rpc, on } = makeRpc(
      {
        RONIN_RPC_METHODS: 'eth_getTransactionReceipt',
        RONIN_RPC_PRIORITY: '3',
        RPC_URLS: `https://a.example/rpc|1000|1|methods=eth_getLogs;priority=5, https://b.example/rpc|1000|1|methods=eth_getLogs;priority=1, ${BACKUP}|1000|1`,
      },
      {
        'primary.example': () => null,
        'a.example': () => [],
        'b.example': () => [],
        'backup.example': () => '0x1',
      },
    )
    expect(labels(rpc.candidates('eth_getLogs'))).toEqual([
      'b.example',
      'a.example',
      'backup.example',
    ])
    expect(labels(rpc.candidates('eth_getTransactionReceipt'))).toEqual([
      'primary.example',
      'backup.example',
    ])
    expect(labels(rpc.candidates('eth_blockNumber'))).toEqual([
      'backup.example',
    ])
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(on('primary.example')).toEqual([])
  })

  it('rejects with NoEndpointForMethod when every endpoint has an allowlist that excludes the method', async () => {
    const { rpc } = makeRpc(
      {
        RONIN_RPC_METHODS: 'eth_getLogs',
        RPC_URLS: `${LOGS}|1000|1|methods=eth_getLogs`,
      },
      {},
    )
    await expect(rpc.request('eth_blockNumber', [])).rejects.toBeInstanceOf(
      NoEndpointForMethod,
    )
    await expect(rpc.request('eth_blockNumber', [])).rejects.toThrow(
      /no RPC endpoint serves eth_blockNumber/,
    )
  })

  it('skips endpoints in cooldown and, when all are cooling down, picks the one that recovers first', () => {
    const { rpc } = makeRpc({ RPC_URLS: `${BACKUP}|1000|1|priority=10` }, {})
    const [primary, backup] = rpc.endpoints as [Endpoint, Endpoint]
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(primary)
    primary.health.cooldownUntil = Date.now() + 50_000
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(backup)
    backup.health.cooldownUntil = Date.now() + 20_000
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(backup)
    backup.health.cooldownUntil = Date.now() + 80_000
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(primary)
    expect(rpc.pickEndpoint('eth_blockNumber', new Set([primary]))).toBe(backup)
  })

  it('shares load between equal-priority endpoints of the same tier', () => {
    const { rpc } = makeRpc({ RPC_URLS: `${BACKUP}|1000|1|priority=0` }, {})
    const [primary, backup] = rpc.endpoints as [Endpoint, Endpoint]
    primary.throttle.rps = 1
    backup.throttle.rps = 1000
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(backup)
    backup.throttle.rps = 1
    primary.throttle.rps = 1000
    expect(rpc.pickEndpoint('eth_blockNumber')).toBe(primary)
  })

  it('labels endpoints by host and disambiguates duplicates', () => {
    const { rpc } = makeRpc(
      { RPC_URLS: `https://user:pw@primary.example/other?key=abc|1000|1` },
      {},
    )
    expect(labels(rpc.endpoints)).toEqual([
      'primary.example',
      'primary.example#1',
    ])
  })
})

describe('Rpc failover', () => {
  it('moves a failing call to the next endpoint at once, cools the endpoint down, doubles on repeat, recovers on success', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    let primaryUp = false
    const { rpc, on, sleeps } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () => (primaryUp ? '0x1' : new HttpFailure(503)),
        'backup.example': () => '0x2',
      },
    )
    const [primary, backup] = rpc.endpoints as [Endpoint, Endpoint]

    // primary fails -> immediate failover, no backoff, primary in cooldown
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x2')
    expect(sleeps).toEqual([])
    expect(primary.counters.failures).toBe(1)
    expect(primary.health.consecutiveFailures).toBe(1)
    expect(primary.health.cooldownUntil - Date.now()).toBe(30_000)
    expect(rpc.counters().perEndpoint[0]?.cooldownMs).toBe(30_000)

    // while cooling down the primary is not even tried
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x2')
    expect(on('primary.example')).toHaveLength(1)
    expect(on('backup.example')).toHaveLength(2)

    // cooldown over, still failing -> tried once, cooldown doubles
    vi.advanceTimersByTime(30_000)
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x2')
    expect(on('primary.example')).toHaveLength(2)
    expect(primary.health.consecutiveFailures).toBe(2)
    expect(primary.health.cooldownMs).toBe(60_000)
    expect(primary.health.cooldownUntil - Date.now()).toBe(60_000)

    // back up after that cooldown -> healthy and preferred again
    vi.advanceTimersByTime(60_000)
    primaryUp = true
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(primary.health.cooldownUntil).toBe(0)
    expect(primary.health.consecutiveFailures).toBe(0)
    expect(primary.health.cooldownMs).toBe(0)
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(on('backup.example')).toHaveLength(3)
    expect(backup.counters.failures).toBe(0)
    expect(rpc.counters().failures).toBe(2)
  })

  it('caps the cooldown at 10 minutes and does not compound failures during a cooldown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { rpc } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () => new HttpFailure(500),
        'backup.example': () => '0x2',
      },
    )
    const primary = rpc.primary
    const seen: number[] = []
    for (let i = 0; i < 7; i++) {
      await rpc.request('eth_blockNumber', [])
      seen.push(primary.health.cooldownMs)
      // a second failure inside the cooldown (all-candidates-cooling path) must not double it
      vi.advanceTimersByTime(primary.health.cooldownMs)
    }
    expect(seen).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000,
    ])
  })

  it('keeps rate-limited calls on the same endpoint (AIMD) instead of failing over', async () => {
    let n = 0
    const { rpc, on } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () =>
          n++ === 0 ? new HttpFailure(429, { 'retry-after': '0' }) : '0x1',
        'backup.example': () => '0x2',
      },
    )
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(on('primary.example')).toHaveLength(2)
    expect(on('backup.example')).toHaveLength(0)
    expect(rpc.primary.counters.failures).toBe(0)
    expect(rpc.primary.health.cooldownUntil).toBe(0)
    expect(rpc.primary.throttle.rps).toBeCloseTo(700)
  })

  it('propagates range-cap errors to the range sizer without failing over', async () => {
    const { rpc, on } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () =>
          new RpcFailure(
            -32602,
            'requested block range exceeds the limit of 200',
          ),
        'backup.example': () => [],
      },
    )
    await expect(getLogs(rpc, { ...filter, toBlock: 2000 })).rejects.toSatisfy(
      (err: unknown) => {
        const info = classifyError(err)
        return info.shrinkRange && info.rangeLimit === 200
      },
    )
    expect(on('primary.example')).toHaveLength(1)
    expect(on('backup.example')).toHaveLength(0)
    expect(rpc.primary.counters.failures).toBe(0)
    expect(rpc.primary.health.cooldownUntil).toBe(0)
  })

  it('backs off and retries only once every eligible endpoint has failed transiently', async () => {
    let backupCalls = 0
    const { rpc, on, sleeps } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () =>
          backupCalls === 0 ? new HttpFailure(502) : '0x1',
        'backup.example': () => {
          backupCalls += 1
          throw new TypeError('fetch failed')
        },
      },
    )
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(sleeps).toEqual([500])
    expect(on('primary.example')).toHaveLength(2)
    expect(on('backup.example')).toHaveLength(1)
    expect(rpc.counters().failures).toBe(2)
  })

  it('gives up immediately when every endpoint rejects a call permanently (off-plan method)', async () => {
    const { rpc, sleeps } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|priority=10` },
      {
        'primary.example': () =>
          new RpcFailure(
            -32002,
            'eth_getLogs is not available on your current plan',
          ),
        'backup.example': () =>
          new RpcFailure(-32002, 'not available on your current plan'),
      },
    )
    await expect(getLogs(rpc, filter)).rejects.toThrow(/current plan/)
    expect(sleeps).toEqual([])
    for (const ep of rpc.endpoints) {
      expect(ep.counters.failures).toBe(1)
      expect(ep.health.cooldownUntil).toBeGreaterThan(Date.now())
    }
  })

  it('single endpoint: retries transient failures in place with backoff and gives up after maxAttempts', async () => {
    let n = 0
    const { rpc, on, sleeps } = makeRpc(
      {},
      { 'primary.example': () => (n++ < 2 ? new HttpFailure(502) : '0x1') },
    )
    await expect(rpc.request('eth_blockNumber', [])).resolves.toBe('0x1')
    expect(on('primary.example')).toHaveLength(3)
    expect(sleeps).toEqual([500, 1000])
    expect(rpc.primary.health.cooldownUntil).toBe(0)

    n = Number.NEGATIVE_INFINITY
    sleeps.length = 0
    await expect(
      rpc.request('eth_blockNumber', [], { maxAttempts: 3 }),
    ).rejects.toThrow()
    expect(on('primary.example')).toHaveLength(6)
    expect(sleeps).toEqual([500, 1000])
  })

  it('sends per-endpoint basic auth and X-API-KEY headers only to their own endpoint', async () => {
    const seen: Record<string, Headers> = {}
    const { rpc } = makeRpc(
      {
        RONIN_RPC_BASIC_AUTH: 'puser:ppass',
        RPC_URLS: `${BACKUP}|1000|1|basic=buser:bpass;key=bkey;methods=eth_getLogs`,
      },
      {
        'primary.example': (_m, _p, h) => {
          seen.primary = h
          return '0x1'
        },
        'backup.example': (_m, _p, h) => {
          seen.backup = h
          return []
        },
      },
    )
    await rpc.request('eth_blockNumber', [])
    await getLogs(rpc, filter)
    const basic = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`
    expect(seen.primary?.get('authorization')).toBe(basic('puser:ppass'))
    expect(seen.primary?.get('x-api-key')).toBeNull()
    expect(seen.backup?.get('authorization')).toBe(basic('buser:bpass'))
    expect(seen.backup?.get('x-api-key')).toBe('bkey')
  })
})

describe('Rpc counters', () => {
  it('reports per-endpoint usage keyed by host and diffs snapshots', async () => {
    const { rpc } = makeRpc(
      { RPC_URLS: `${BACKUP}|1000|1|methods=eth_getLogs` },
      { 'primary.example': () => '0x1', 'backup.example': () => [] },
    )
    const before = rpc.counters()
    expect(before.endpoints).toEqual({
      'primary.example': { http: 0, sub: 0 },
      'backup.example': { http: 0, sub: 0 },
    })
    await rpc.request('eth_blockNumber', [])
    await getLogs(rpc, filter)
    await getLogs(rpc, filter)
    const after = rpc.counters()
    const expected = {
      'primary.example': { http: 1, sub: 1 },
      'backup.example': { http: 2, sub: 2 },
    }
    expect(after.endpoints).toEqual(expected)
    expect(endpointUsageDelta(before.endpoints, after.endpoints)).toEqual(
      expected,
    )
    expect(after).toMatchObject({ httpRequests: 3, subCalls: 3, failures: 0 })
    expect(after.perEndpoint.map((e) => e.label)).toEqual([
      'primary.example',
      'backup.example',
    ])
  })
})
