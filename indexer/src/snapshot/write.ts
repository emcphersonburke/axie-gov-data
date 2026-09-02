import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

import { dashboardSnapshotSchema, healthSchema } from '@axie-gov/shared'

import type { SnapshotPair } from './build.js'

/** Write `name.json.tmp`, fsync, rename — readers never see a partial file. */
export function writeJsonAtomic(path: string, data: unknown): number {
  const body = JSON.stringify(data)
  const tmp = `${path}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, body)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  return Buffer.byteLength(body)
}

export interface WrittenSnapshot {
  dashboardPath: string
  healthPath: string
  dashboardBytes: number
}

/** Validate against the shared zod contract, then write both files atomically. */
export function writeSnapshot(
  dir: string,
  pair: SnapshotPair,
): WrittenSnapshot {
  const dashboard = dashboardSnapshotSchema.parse(pair.dashboard)
  const health = healthSchema.parse(pair.health)
  mkdirSync(dir, { recursive: true })
  const dashboardPath = join(dir, 'dashboard.json')
  const healthPath = join(dir, 'health.json')
  const dashboardBytes = writeJsonAtomic(dashboardPath, dashboard)
  writeJsonAtomic(healthPath, health)
  return { dashboardPath, healthPath, dashboardBytes }
}
