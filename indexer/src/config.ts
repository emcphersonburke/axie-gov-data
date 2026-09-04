import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { BRIDGE_START_BLOCK, TREASURY_START_BLOCK } from '@axie-gov/shared'
import { z } from 'zod'

import { scrubSecrets } from './logger.js'

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
  /** "user:password" for providers that protect the endpoint with HTTP basic auth (e.g. Chainstack). Sent only to RONIN_RPC_URL. */
  RONIN_RPC_BASIC_AUTH: z.string().optional(),
  /** Comma-separated JSON-RPC methods the primary serves exclusively and is preferred for (same as `methods=` in RPC_URLS). */
  RONIN_RPC_METHODS: z.string().optional(),
  /** Routing priority of the primary; lower is tried first. Extras default to 10. */
  RONIN_RPC_PRIORITY: z.coerce.number().int().default(0),
  /** Extra endpoints, "url|rps|batchSize|option=value;…" entries separated by commas; see `parseRpcUrls`. */
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
  /** Largest HTTP response body accepted from any endpoint (a batch of big receipts can exceed viem's 10 MB default). */
  RPC_MAX_RESPONSE_MB: int(256, 1),
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
  /** Lower is tried first among the endpoints eligible for a method. Primary 0, extras 10 unless overridden. */
  priority: number
  /** When set, the endpoint serves ONLY these methods and is preferred over general endpoints for them. */
  methods?: readonly string[]
  /** Sent as `X-API-KEY`. The primary gets RONIN_API_KEY on Sky Mavis hosts only; extras need an explicit `key=`. */
  apiKey?: string
  /** HTTP basic-auth credentials ("user:password"). */
  basicAuth?: string
}

export type Config = Readonly<
  z.infer<typeof schema> & { endpoints: readonly RpcEndpointConfig[] }
>

/** Routing priority of RPC_URLS entries that do not set `priority=`. */
export const DEFAULT_EXTRA_PRIORITY = 10

const METHOD_NAME_RE = /^[a-z][A-Za-z0-9_]*$/

/** Parse a comma/whitespace-separated list of JSON-RPC method names. */
export function parseMethodList(raw: string, where: string): string[] {
  const methods = raw.split(/[\s,]+/).filter(Boolean)
  if (methods.length === 0) throw new Error(`${where}: methods list is empty`)
  for (const m of methods)
    if (!METHOD_NAME_RE.test(m))
      throw new Error(`${where}: "${m}" is not a JSON-RPC method name`)
  return [...new Set(methods)]
}

/**
 * Split RPC_URLS on the commas that start a new entry. Every entry begins
 * with a URL, so a comma followed by anything else (`methods=a,b`, a password)
 * belongs to the entry before it.
 */
function splitEntries(raw: string): string[] {
  const out: string[] = []
  for (const piece of raw.split(',')) {
    const s = piece.trim()
    if (!s) continue
    const last = out.length - 1
    if (last >= 0 && !/^https?:\/\//i.test(s))
      out[last] = `${out[last] ?? ''},${s}`
    else out.push(s)
  }
  return out
}

interface EndpointOptions {
  methods?: string[]
  priority?: number
  basicAuth?: string
  apiKey?: string
}

/** The 4th `|` field: `;`-separated `key=value` pairs. Error messages never echo the values. */
function parseEndpointOptions(raw: string, where: string): EndpointOptions {
  const out: EndpointOptions = {}
  for (const part of raw.split(';')) {
    const kv = part.trim()
    if (!kv) continue
    const eq = kv.indexOf('=')
    if (eq <= 0)
      throw new Error(
        `${where}: options must be key=value pairs separated by ";"`,
      )
    const key = kv.slice(0, eq).trim().toLowerCase()
    const value = kv.slice(eq + 1).trim()
    switch (key) {
      case 'methods':
        out.methods = parseMethodList(value, where)
        break
      case 'priority': {
        const n = Number(value)
        if (value === '' || !Number.isInteger(n))
          throw new Error(`${where}: priority must be an integer`)
        out.priority = n
        break
      }
      case 'basic':
        if (!value.includes(':'))
          throw new Error(`${where}: basic must be "user:password"`)
        out.basicAuth = value
        break
      case 'key':
        if (!value) throw new Error(`${where}: key must not be empty`)
        out.apiKey = value
        break
      default:
        throw new Error(
          `${where}: unknown option "${key}" (expected methods, priority, basic or key)`,
        )
    }
  }
  return out
}

/**
 * `RPC_URLS` grammar, entries separated by commas:
 *
 *   url|rps|batchSize|methods=eth_getLogs,eth_getBlockByNumber;priority=0;basic=user:pw;key=…
 *
 * Every field after the URL is optional. `methods=` pins the endpoint to
 * those methods (it serves nothing else and is preferred for them),
 * `priority=` orders candidates (lower first, default 10), `basic=` and
 * `key=` are per-endpoint credentials. Credential values must not contain
 * `|`, `;` or a comma followed by `http`.
 */
export function parseRpcUrls(
  raw: string,
  defaults: { rps: number; maxRps: number; batchSize: number },
): RpcEndpointConfig[] {
  return splitEntries(raw).map((entry) => {
    const [url = '', rps, batch, ...rest] = entry
      .split('|')
      .map((s) => s.trim())
    if (!/^https?:\/\//i.test(url))
      throw new Error(`RPC_URLS: invalid entry "${redactRpcUrls(entry)}"`)
    let host: string
    try {
      host = new URL(url).host
    } catch {
      throw new Error(
        `RPC_URLS: invalid URL in entry "${redactRpcUrls(entry)}"`,
      )
    }
    const where = `RPC_URLS entry ${host}`
    const parsedRps = rps ? Number(rps) : defaults.rps
    const parsedBatch = batch ? Number(batch) : defaults.batchSize
    if (!Number.isFinite(parsedRps) || parsedRps <= 0)
      throw new Error(`${where}: invalid rps "${rps}"`)
    if (!Number.isInteger(parsedBatch) || parsedBatch < 1)
      throw new Error(`${where}: invalid batch size "${batch}"`)
    const options = parseEndpointOptions(rest.join('|'), where)
    const ep: RpcEndpointConfig = {
      url,
      rps: parsedRps,
      maxRps: Math.max(parsedRps, defaults.maxRps),
      batchSize: parsedBatch,
      priority: options.priority ?? DEFAULT_EXTRA_PRIORITY,
    }
    if (options.methods) ep.methods = options.methods
    if (options.basicAuth) ep.basicAuth = options.basicAuth
    if (options.apiKey) ep.apiKey = options.apiKey
    return ep
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
    priority: c.RONIN_RPC_PRIORITY,
    // The key is a Sky Mavis credential: never send it to any other host (e.g. the public RPC used for smoke tests).
    apiKey: isSkyMavisHost(c.RONIN_RPC_URL) ? c.RONIN_API_KEY : undefined,
    basicAuth: c.RONIN_RPC_BASIC_AUTH,
  }
  if (c.RONIN_RPC_METHODS)
    primary.methods = parseMethodList(c.RONIN_RPC_METHODS, 'RONIN_RPC_METHODS')
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
export const SECRET_KEYS = ['RONIN_API_KEY', 'RONIN_RPC_BASIC_AUTH'] as const

/**
 * Every literal credential the process knows about, for the logger's scrub
 * list: API keys, basic-auth pairs, their password halves and the base64
 * form that travels in the Authorization header.
 */
export function collectSecrets(config: Config): string[] {
  const out = new Set<string>()
  const add = (v: string | undefined) => {
    if (v) out.add(v)
  }
  add(config.RONIN_API_KEY)
  add(config.RONIN_RPC_BASIC_AUTH)
  for (const e of config.endpoints) {
    add(e.apiKey)
    if (e.basicAuth) {
      add(e.basicAuth)
      add(e.basicAuth.slice(e.basicAuth.indexOf(':') + 1))
      add(Buffer.from(e.basicAuth).toString('base64'))
    }
  }
  return [...out]
}

/** RPC_URLS with `basic=` / `key=` values and URL-embedded keys masked; safe for logs and error messages. */
export function redactRpcUrls(
  raw: string,
  secrets: readonly string[] = [],
): string {
  return scrubSecrets(
    raw.replace(
      /\b(basic|key)=.*?(?=;|\||,\s*https?:\/\/|$)/gi,
      '$1=<redacted>',
    ),
    secrets,
  )
}

/** A copy of the config safe to log (secrets redacted, endpoints without keys). */
export function redactConfig(config: Config): Record<string, unknown> {
  const secrets = collectSecrets(config)
  const out: Record<string, unknown> = { ...config }
  for (const k of SECRET_KEYS) out[k] = config[k] ? '<redacted>' : '<unset>'
  out.RPC_URLS = redactRpcUrls(config.RPC_URLS, secrets)
  out.endpoints = config.endpoints.map((e) => ({
    url: scrubSecrets(e.url, secrets),
    rps: e.rps,
    maxRps: e.maxRps,
    batchSize: e.batchSize,
    priority: e.priority,
    methods: e.methods,
    hasKey: Boolean(e.apiKey),
    hasBasicAuth: Boolean(e.basicAuth),
  }))
  return out
}
