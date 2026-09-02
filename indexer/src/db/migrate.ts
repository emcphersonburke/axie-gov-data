import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { Db } from './open.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url))

interface Migration {
  version: number
  name: string
  sql: string
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: Number(f.slice(0, 4)),
      name: f,
      sql: readFileSync(new URL(f, `file://${dir}`), 'utf8'),
    }))
}

export function currentVersion(db: Db): number {
  const row = db.pragma('user_version', { simple: true })
  return Number(row)
}

/** Apply every migration above `PRAGMA user_version`, each in its own transaction. Returns the applied versions. */
export function migrate(db: Db, migrations = loadMigrations()): number[] {
  const applied: number[] = []
  let version = currentVersion(db)
  for (const m of migrations) {
    if (m.version <= version) continue
    if (m.version !== version + 1)
      throw new Error(
        `migration gap: at version ${version}, next file is ${m.name}`,
      )
    db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })()
    version = m.version
    applied.push(m.version)
  }
  return applied
}
