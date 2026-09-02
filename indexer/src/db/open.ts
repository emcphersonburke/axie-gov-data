import Database from 'better-sqlite3'

import { migrate } from './migrate.js'

export type Db = Database.Database

export interface OpenOptions {
  /** Skip migrations (only for inspecting a foreign file). */
  readonly?: boolean
}

/**
 * Open (creating if needed) the indexer database with the production pragmas
 * and run pending migrations. Pass ':memory:' for tests.
 */
export function openDb(path: string, opts: OpenOptions = {}): Db {
  const db = new Database(path, { readonly: opts.readonly ?? false })
  if (!opts.readonly) {
    if (path !== ':memory:') db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    db.pragma('cache_size = -262144') // 256 MB
    db.pragma('temp_store = MEMORY')
    db.pragma('busy_timeout = 5000')
    db.pragma('mmap_size = 268435456') // 256 MB
    migrate(db)
  } else {
    db.pragma('busy_timeout = 5000')
  }
  return db
}

/** Fold the WAL back into the main file; called every ~10 min in tail. */
export function checkpoint(db: Db): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
}
