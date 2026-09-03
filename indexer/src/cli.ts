#!/usr/bin/env node
import { parseArgs } from 'node:util'

import type { Hex } from 'viem'

import type { LegChoice } from './commands/backfill.js'
import { backfill } from './commands/backfill.js'
import { captureFixture } from './commands/fixture.js'
import { probe } from './commands/probe.js'
import { rebuildRollupsCommand } from './commands/rebuildRollups.js'
import { rewind } from './commands/rewind.js'
import { closeContext, createContext, parseIntArg } from './commands/shared.js'
import { snapshot } from './commands/snapshot.js'
import { tail } from './commands/tail.js'
import { verify } from './commands/verify.js'
import { loadConfig, redactConfig } from './config.js'
import { createLogger } from './logger.js'
import { Stopper } from './pipeline/stop.js'

const USAGE = `axie-indexer <command> [options]

Commands
  tail                                  Follow the chain forever (systemd service). Catch-up and follow are the same loop.
  backfill [--leg L] [--from N] [--to N] [--probe]
                                        Index until caught up (or --to), then exit. L = treasury|bridge|all (default all).
                                        --probe runs the day-1 RPC accounting probe instead.
  snapshot                              Build and atomically write dashboard.json + health.json once.
  rebuild-rollups                       Recompute rollups_hourly and exact totals from transactions.
  verify [--checkpoint] [--spot N] [--tx HASH] [--full]
                                        Invariants; --checkpoint compares with the legacy 2025-02-04 totals;
                                        --spot re-discovers N random 500-block windows; --tx classifies one tx live.
  rewind --to BLOCK                     Delete rows >= BLOCK, reset cursors, rebuild rollups (deep-reorg remedy).
  fixture HASH NAME [--dir DIR]         Capture a receipt + header into test/fixtures/NAME.json.

Configuration is read from the environment (see .env.example); RONIN_API_KEY is required.
Exit codes: 0 ok, 1 failure, 2 usage.`

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      leg: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      probe: { type: 'boolean' },
      checkpoint: { type: 'boolean' },
      spot: { type: 'string' },
      tx: { type: 'string' },
      full: { type: 'boolean' },
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const command = positionals[0]
  if (values.help || !command) {
    process.stdout.write(`${USAGE}\n`)
    return command ? 0 : 2
  }

  const config = loadConfig(process.env)
  const log = createLogger(config.LOG_LEVEL, undefined, [
    config.RONIN_API_KEY,
    ...(config.RONIN_RPC_BASIC_AUTH
      ? [
          config.RONIN_RPC_BASIC_AUTH,
          config.RONIN_RPC_BASIC_AUTH.split(':').pop() ?? '',
        ]
      : []),
  ])
  log.debug(redactConfig(config), 'configuration')
  const stop = new Stopper()
  const onSignal = (signal: NodeJS.Signals) => {
    if (stop.requested) {
      log.warn({ signal }, 'second signal; exiting immediately')
      process.exit(130)
    }
    log.info({ signal }, 'stop requested; finishing the in-flight batch')
    stop.request()
  }
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)

  const ctx = createContext(config, log)
  try {
    switch (command) {
      case 'tail':
        await tail(ctx, stop)
        return 0
      case 'backfill': {
        const from = parseIntArg(values.from, 'from')
        const to = parseIntArg(values.to, 'to')
        if (values.probe) {
          await probe(ctx, { from, to })
          return 0
        }
        const leg = (values.leg ?? 'all') as LegChoice
        if (!['treasury', 'bridge', 'all'].includes(leg))
          throw new UsageError(
            `--leg must be treasury|bridge|all, got "${leg}"`,
          )
        if (from !== undefined && to !== undefined && to < from)
          throw new UsageError('--to must be >= --from')
        await backfill(ctx, { leg, from, to, stop })
        return stop.requested ? 1 : 0
      }
      case 'snapshot':
        await snapshot(ctx)
        return 0
      case 'rebuild-rollups':
        rebuildRollupsCommand(ctx)
        return 0
      case 'verify': {
        const spot = parseIntArg(values.spot, 'spot')
        const tx = values.tx as Hex | undefined
        if (tx && !/^0x[0-9a-fA-F]{64}$/.test(tx))
          throw new UsageError('--tx must be a 32-byte hex hash')
        const ok = await verify(ctx, {
          checkpoint: values.checkpoint,
          spot,
          tx,
          full: values.full,
        })
        return ok ? 0 : 1
      }
      case 'rewind': {
        const to = parseIntArg(values.to, 'to')
        if (to === undefined) throw new UsageError('rewind requires --to BLOCK')
        rewind(ctx, to)
        return 0
      }
      case 'fixture': {
        const [, hash, name] = positionals
        if (!hash || !name)
          throw new UsageError('fixture requires HASH and NAME')
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
          throw new UsageError('HASH must be a 32-byte hex hash')
        if (!/^[\w.-]+$/.test(name))
          throw new UsageError('NAME may contain letters, digits, _ . -')
        await captureFixture(ctx, hash as Hex, name, values.dir)
        return 0
      }
      default:
        throw new UsageError(`unknown command "${command}"`)
    }
  } finally {
    closeContext(ctx)
    log.flush?.()
  }
}

class UsageError extends Error {}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
    // give pino's transport a moment to flush, then leave even if something lingers
    setTimeout(() => process.exit(code), 300)
  })
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`)
      process.exit(2)
    }
    const message =
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    process.stderr.write(`fatal: ${message}\n`)
    process.exit(1)
  })
