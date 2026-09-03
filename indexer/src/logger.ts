import type { Logger } from 'pino'
import { pino } from 'pino'

export type { Logger }

/**
 * Patterns that mark an API key embedded in a URL: query parameters
 * (`?dkey=…`, `?apikey=…`), Alchemy-style `/v2/<key>` paths, and any long
 * opaque path segment that is not a hex hash. Transaction hashes (`0x…`)
 * are deliberately left alone so logs stay debuggable.
 */
const URL_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /([?&](?:dkey|apikey|api_key|apiKey|key|token|access_token|auth)=)[^&\s"'#]+/gi,
    '$1***',
  ],
  [/(\/v2\/)[A-Za-z0-9_-]{16,}/g, '$1***'],
  [
    /(https?:\/\/[^\s"'/]+(?:\/[^\s"'/]*)*?\/)(?!0x)[A-Za-z0-9_-]{24,}(?=[/?#\s"']|$)/g,
    '$1***',
  ],
]

/** Replace literal secret values and URL-embedded keys in a string. */
export function scrubSecrets(
  text: string,
  secrets: readonly string[] = [],
): string {
  let out = text
  for (const s of secrets) if (s.length >= 8) out = out.split(s).join('***')
  for (const [re, rep] of URL_SECRET_PATTERNS) out = out.replace(re, rep)
  return out
}

/** Deep copy of a value with every string scrubbed; Errors become plain {type, message, stack}. */
export function scrubDeep(
  value: unknown,
  secrets: readonly string[],
  depth = 0,
): unknown {
  if (depth > 6) return value
  if (typeof value === 'string') return scrubSecrets(value, secrets)
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      type: value.name,
      message: scrubSecrets(value.message, secrets),
      stack: value.stack ? scrubSecrets(value.stack, secrets) : undefined,
    }
    for (const k of Object.keys(value)) {
      if (k === 'message' || k === 'stack') continue
      out[k] = scrubDeep(
        (value as unknown as Record<string, unknown>)[k],
        secrets,
        depth + 1,
      )
    }
    return out
  }
  if (Array.isArray(value))
    return value.map((v) => scrubDeep(v, secrets, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = scrubDeep(v, secrets, depth + 1)
    return out
  }
  return value
}

/**
 * pino root logger. Pretty output on a TTY (humans), NDJSON otherwise
 * (journald / files). Every logged string is scrubbed of the configured
 * secret values and of URL-embedded keys, because viem error messages embed
 * the request URL and headers verbatim.
 */
export function createLogger(
  level: string,
  pretty = Boolean(process.stdout.isTTY),
  secrets: readonly string[] = [],
): Logger {
  return pino({
    level,
    base: undefined,
    redact: {
      paths: [
        '*.headers["X-API-KEY"]',
        '*.headers["x-api-key"]',
        'headers["X-API-KEY"]',
        'headers["x-api-key"]',
      ],
      censor: '<redacted>',
    },
    hooks: {
      logMethod(args, method) {
        const scrubbed = args.map((a) => scrubDeep(a, secrets)) as typeof args
        method.apply(this, scrubbed)
      },
    },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  })
}

export const silentLogger: Logger = pino({ level: 'silent' })
