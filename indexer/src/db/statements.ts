import type { Statement } from 'better-sqlite3'

import type { Db } from './open.js'

export type MetaKey =
  | 'cursor_treasury'
  | 'cursor_bridge'
  | 'rollups_dirty'
  | 'total_axs_in_wei'
  | 'total_weth_in_wei'
  | 'total_axs_out_wei'
  | 'total_weth_out_wei'
  | 'rates_json'
  | 'rates_fetched_at'
  | 'first_tx_block'
  | 'first_tx_ts'
  | 'treasury_committed_at'
  | 'bridge_committed_at'
  | 'log_block_timestamp'

export interface TxInsertParams {
  hash: string
  block: number
  tx_index: number | null
  ts: number
  type: string
  nft_type: string
  nft_count: number
  from_address: string | null
  to_address: string | null
  axs_in_wei: string
  weth_in_wei: string
  axs_out_wei: string
  weth_out_wei: string
  axs_in: number
  weth_in: number
  axs_out: number
  weth_out: number
}

export interface RollupParams {
  hour: number
  type: string
  nft_type: string
  axs_in: number
  weth_in: number
  axs_out: number
  weth_out: number
  tx_count: number
}

export interface Statements {
  getMeta: Statement<[string], { value: string } | undefined>
  setMeta: Statement<[string, string]>
  insertBlock: Statement<[number, number, string]>
  insertTx: Statement<[TxInsertParams], { id: number } | undefined>
  insertTokenTransfer: Statement<
    [number, number, string, string, string, string, string, number]
  >
  insertNftTransfer: Statement<
    [number, number, number, string, string, string, string, string, string]
  >
  insertBridgeEvent: Statement<
    [
      string,
      number,
      number,
      number,
      string,
      string,
      string,
      number,
      string,
      string | null,
    ]
  >
  upsertRollup: Statement<[RollupParams]>
}

export function prepareStatements(db: Db): Statements {
  return {
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    // An exact timestamp replaces an interpolated one; nothing else changes an existing row.
    insertBlock: db.prepare(
      `INSERT INTO blocks (number, ts, source) VALUES (?, ?, ?)
       ON CONFLICT(number) DO UPDATE SET ts = excluded.ts, source = excluded.source
       WHERE blocks.source = 'interp' AND excluded.source = 'rpc'`,
    ),
    insertTx: db.prepare(
      `INSERT INTO transactions (hash, block, tx_index, ts, type, nft_type, nft_count, from_address, to_address,
         axs_in_wei, weth_in_wei, axs_out_wei, weth_out_wei, axs_in, weth_in, axs_out, weth_out)
       VALUES (@hash, @block, @tx_index, @ts, @type, @nft_type, @nft_count, @from_address, @to_address,
         @axs_in_wei, @weth_in_wei, @axs_out_wei, @weth_out_wei, @axs_in, @weth_in, @axs_out, @weth_out)
       ON CONFLICT(hash) DO NOTHING
       RETURNING id`,
    ),
    insertTokenTransfer: db.prepare(
      `INSERT OR IGNORE INTO token_transfers (tx_id, log_index, token, direction, from_address, to_address, amount_wei, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertNftTransfer: db.prepare(
      `INSERT OR IGNORE INTO nft_transfers (tx_id, log_index, sub_index, contract, nft_type, token_id, quantity, from_address, to_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertBridgeEvent: db.prepare(
      `INSERT OR IGNORE INTO bridge_events (tx_hash, log_index, block, ts, kind, token, amount_wei, amount, address, receipt_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    upsertRollup: db.prepare(
      `INSERT INTO rollups_hourly (hour, type, nft_type, axs_in, weth_in, axs_out, weth_out, tx_count)
       VALUES (@hour, @type, @nft_type, @axs_in, @weth_in, @axs_out, @weth_out, @tx_count)
       ON CONFLICT(hour, type, nft_type) DO UPDATE SET
         axs_in = rollups_hourly.axs_in + excluded.axs_in,
         weth_in = rollups_hourly.weth_in + excluded.weth_in,
         axs_out = rollups_hourly.axs_out + excluded.axs_out,
         weth_out = rollups_hourly.weth_out + excluded.weth_out,
         tx_count = rollups_hourly.tx_count + excluded.tx_count`,
    ),
  }
}

export function getMeta(stmts: Statements, key: MetaKey): string | undefined {
  return stmts.getMeta.get(key)?.value
}

export function setMeta(stmts: Statements, key: MetaKey, value: string): void {
  stmts.setMeta.run(key, value)
}

export function getMetaInt(
  stmts: Statements,
  key: MetaKey,
): number | undefined {
  const v = getMeta(stmts, key)
  return v === undefined ? undefined : Number(v)
}

export function getMetaBigInt(stmts: Statements, key: MetaKey): bigint {
  const v = getMeta(stmts, key)
  return v === undefined ? 0n : BigInt(v)
}

/**
 * Exact sum of a decimal-TEXT wei column without leaving SQLite: split each
 * value into (value div 1e9, value mod 1e9); both partial sums fit int64 for
 * any plausible treasury total, then recombine as BigInt.
 */
export function sumWeiColumn(
  db: Db,
  table: string,
  column: string,
  where = '1=1',
  params: unknown[] = [],
): bigint {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CAST(CASE WHEN length(${column}) > 9 THEN substr(${column}, 1, length(${column}) - 9) ELSE '0' END AS INTEGER)), 0) AS hi,
         COALESCE(SUM(CAST(substr(${column}, -9) AS INTEGER)), 0) AS lo
       FROM ${table} WHERE ${where}`,
    )
    .get(...params) as { hi: number | bigint; lo: number | bigint }
  return BigInt(row.hi) * 1_000_000_000n + BigInt(row.lo)
}
