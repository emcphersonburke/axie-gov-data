import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { BRIDGE_START_BLOCK, TREASURY_START_BLOCK } from '@axie-gov/shared'
import { z } from 'zod'

/**
 * The single place `process.env` is read. Everything downstream receives the
 * frozen `Config` object; tests build one with `loadConfig({...})`.
 */
const int = (def: number, min = 0) =>
  z.coerce.number().int().min(min).default(def)

const schema = z.object({
  RONIN_RPC_URL: z
    .string()
    .url()
    .default('https://api-gateway.skymavis.com/rpc'),
  RONIN_API_KEY: z.string().min(1, 'RONIN_API_KEY is required'),
  /** Extra endpoints, "url|rps|batchSize" entries separated by commas. No API key is sent to these. */
  RPC_URLS: z.string().default(''),
  DB_PATH: z.string().default('./data/indexer.db'),
  SNAPSHOT_DIR: z.string().default('./data/snapshots'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  CONFIRMATIONS: int(30),
  START_BLOCK: int(TREASURY_START_BLOCK),
  BRIDGE_START_BLOCK: int(BRIDGE_START_BLOCK),
  RPC_START_RPS: z.coerce.number().positive().default(10),
  RPC_MAX_RPS: z.coerce.number().positive().default(50),
  RPC_CONCURRENCY: int(64, 1),
  RPC_BATCH_SIZE: int(20, 1),
  RANGE_START: int(2000, 1),
  RANGE_MAX: int(100_000, 1),
  RANGE_MIN: int(50, 1),
  TS_ANCHOR_INTERVAL: int(64, 1),
  TAIL_SLEEP_MS: int(15_000),
  LOG_FETCH_STRATEGY: z.enum(['receipts', 'range']).default('receipts'),
  RATES_URL: z
    .string()
    .url()
    .default('https://api-gateway.skymavis.com/graphql/marketplace'),
  RATES_INTERVAL_MS: int(300_000),
  RATES_STALE_MS: int(1_800_000),
  SNAPSHOT_INTERVAL_MS: int(300_000),
  WAL_CHECKPOINT_INTERVAL_MS: int(600_000),
})

export interface RpcEndpointConfig {
  url: string
  /** Token-bucket start rate for this endpoint (HTTP requests/s). */
  rps: number
  maxRps: number
  batchSize: number
  /** Only the primary (Sky Mavis) endpoint receives the API key. */
  apiKey?: string
}

export type Config = Readonly<
  z.infer<typeof schema> & { endpoints: readonly RpcEndpointConfig[] }
>

export function parseRpcUrls(
  raw: string,
  defaults: { rps: number; maxRps: number; batchSize: number },
): RpcEndpointConfig[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, rps, batch] = entry.split('|').map((s) => s.trim())
      if (!url || !/^https?:\/\//.test(url))
        throw new Error(`RPC_URLS: invalid entry "${entry}"`)
      const parsedRps = rps ? Number(rps) : defaults.rps
      const parsedBatch = batch ? Number(batch) : defaults.batchSize
      if (!Number.isFinite(parsedRps) || parsedRps <= 0)
        throw new Error(`RPC_URLS: invalid rps in "${entry}"`)
      if (!Number.isInteger(parsedBatch) || parsedBatch < 1)
        throw new Error(`RPC_URLS: invalid batch size in "${entry}"`)
      return {
        url,
        rps: parsedRps,
        maxRps: Math.max(parsedRps, defaults.maxRps),
        batchSize: parsedBatch,
      }
    })
}

export function isSkyMavisHost(url: string): boolean {
  const host = new URL(url).hostname
  return host === 'skymavis.com' || host.endsWith('.skymavis.com')
}

export interface LoadOptions {
  /** Create DB_PATH's directory and SNAPSHOT_DIR (default true). */
  ensureDirs?: boolean
}

export function loadConfig(
  env: Record<string, string | undefined>,
  opts: LoadOptions = {},
): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`invalid configuration: ${issues}`)
  }
  const c = parsed.data
  if (c.RANGE_MIN > c.RANGE_START || c.RANGE_START > c.RANGE_MAX)
    throw new Error(
      'invalid configuration: RANGE_MIN <= RANGE_START <= RANGE_MAX required',
    )
  if (c.RPC_START_RPS > c.RPC_MAX_RPS)
    throw new Error(
      'invalid configuration: RPC_START_RPS must not exceed RPC_MAX_RPS',
    )

  const primary: RpcEndpointConfig = {
    url: c.RONIN_RPC_URL,
    rps: c.RPC_START_RPS,
    maxRps: c.RPC_MAX_RPS,
    batchSize: c.RPC_BATCH_SIZE,
    // The key is a Sky Mavis credential: never send it to any other host (e.g. the public RPC used for smoke tests).
    apiKey: isSkyMavisHost(c.RONIN_RPC_URL) ? c.RONIN_API_KEY : undefined,
  }
  const extras = parseRpcUrls(c.RPC_URLS, {
    rps: c.RPC_START_RPS,
    maxRps: c.RPC_MAX_RPS,
    batchSize: c.RPC_BATCH_SIZE,
  })

  const config: Config = Object.freeze({
    ...c,
    DB_PATH: c.DB_PATH === ':memory:' ? c.DB_PATH : resolve(c.DB_PATH),
    SNAPSHOT_DIR: resolve(c.SNAPSHOT_DIR),
    endpoints: Object.freeze([primary, ...extras]),
  })

  if (opts.ensureDirs !== false) {
    if (config.DB_PATH !== ':memory:')
      mkdirSync(dirname(config.DB_PATH), { recursive: true })
    mkdirSync(config.SNAPSHOT_DIR, { recursive: true })
  }
  return config
}

/** Keys whose values must never appear in logs or error output. */
export const SECRET_KEYS = ['RONIN_API_KEY'] as const

/** A copy of the config safe to log (secrets redacted, endpoints without keys). */
export function redactConfig(config: Config): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config }
  for (const k of SECRET_KEYS) out[k] = config[k] ? '<redacted>' : '<unset>'
  out.endpoints = config.endpoints.map((e) => ({
    url: e.url,
    rps: e.rps,
    maxRps: e.maxRps,
    batchSize: e.batchSize,
    hasKey: Boolean(e.apiKey),
  }))
  return out
}
