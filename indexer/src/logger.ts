import type { Logger } from 'pino'
import { pino } from 'pino'

export type { Logger }

/**
 * pino root logger. Pretty output on a TTY (humans), NDJSON otherwise
 * (journald / files). Redacts the API key header if it ever ends up in a
 * logged object (viem errors embed request metadata).
 */
export function createLogger(
  level: string,
  pretty = Boolean(process.stdout.isTTY),
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
