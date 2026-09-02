import type { Hex, RpcTransactionReceipt } from 'viem'

import type { ClassifiedTx } from '../classify/classify.js'
import { classifyTx, weiToUnits } from '../classify/classify.js'
import { getMetaBigInt, getMetaInt, sumWeiColumn } from '../db/statements.js'
import { decodeLogs } from '../decode/decodeLog.js'
import { discoverTreasuryLogsAdaptive } from '../legs/treasury.js'
import type { AppContext } from '../pipeline/context.js'
import { normalizeReceipt } from '../rpc/methods.js'
import { classifyError } from '../rpc/retry.js'

export interface VerifyOptions {
  checkpoint?: boolean
  spot?: number
  tx?: Hex
  full?: boolean
}

export interface Check {
  name: string
  ok: boolean
  detail: string
}

/** Legacy Supabase cumulative inflow strictly before 2025-02-04T00:00Z. */
export const LEGACY_CHECKPOINT = {
  beforeTs: Date.UTC(2025, 1, 4) / 1000,
  axs: 22_801_117.12622,
  weth: 58_668.908258881,
  /** relative tolerance: the legacy pipeline dropped second fee transfers and duplicated others */
  tolerance: 0.005,
}

const rel = (a: number, b: number): number =>
  b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b)
const close = (a: number, b: number, tol = 1e-6): boolean => rel(a, b) <= tol

export function invariantChecks(ctx: AppContext, full: boolean): Check[] {
  const { db, stmts } = ctx
  const checks: Check[] = []

  const orphan = db
    .prepare(
      'SELECT COUNT(*) AS n FROM transactions t LEFT JOIN blocks b ON b.number = t.block WHERE b.number IS NULL',
    )
    .get() as { n: number }
  checks.push({
    name: 'every tx block has a blocks row',
    ok: orphan.n === 0,
    detail: `${orphan.n} orphan tx rows`,
  })

  const tsMismatch = db
    .prepare(
      'SELECT COUNT(*) AS n FROM transactions t JOIN blocks b ON b.number = t.block WHERE b.ts <> t.ts',
    )
    .get() as { n: number }
  checks.push({
    name: 'tx.ts equals its block ts',
    ok: tsMismatch.n === 0,
    detail: `${tsMismatch.n} mismatches`,
  })

  const t = db
    .prepare(
      'SELECT COUNT(*) AS n, COALESCE(SUM(axs_in),0) AS axs_in, COALESCE(SUM(weth_in),0) AS weth_in, COALESCE(SUM(axs_out),0) AS axs_out, COALESCE(SUM(weth_out),0) AS weth_out FROM transactions',
    )
    .get() as {
    n: number
    axs_in: number
    weth_in: number
    axs_out: number
    weth_out: number
  }
  const r = db
    .prepare(
      'SELECT COALESCE(SUM(tx_count),0) AS n, COALESCE(SUM(axs_in),0) AS axs_in, COALESCE(SUM(weth_in),0) AS weth_in, COALESCE(SUM(axs_out),0) AS axs_out, COALESCE(SUM(weth_out),0) AS weth_out FROM rollups_hourly',
    )
    .get() as typeof t
  const sumsOk =
    Number(t.n) === Number(r.n) &&
    close(t.axs_in, r.axs_in) &&
    close(t.weth_in, r.weth_in) &&
    close(t.axs_out, r.axs_out) &&
    close(t.weth_out, r.weth_out)
  checks.push({
    name: 'rollup sums equal transaction sums',
    ok: sumsOk,
    detail: `tx: n=${t.n} axs_in=${t.axs_in} weth_in=${t.weth_in}; rollups: n=${r.n} axs_in=${r.axs_in} weth_in=${r.weth_in}`,
  })

  if (full) {
    const groupsBad = db
      .prepare(
        `WITH tx AS (SELECT (ts/3600)*3600 AS hour, type, nft_type, SUM(axs_in) axs_in, SUM(weth_in) weth_in, SUM(axs_out) axs_out, SUM(weth_out) weth_out, COUNT(*) n FROM transactions GROUP BY 1,2,3)
         SELECT COUNT(*) AS n FROM tx LEFT JOIN rollups_hourly r USING (hour, type, nft_type)
         WHERE r.hour IS NULL OR r.tx_count <> tx.n OR abs(r.axs_in - tx.axs_in) > 1e-9 * max(1, abs(tx.axs_in)) OR abs(r.weth_in - tx.weth_in) > 1e-9 * max(1, abs(tx.weth_in))
            OR abs(r.axs_out - tx.axs_out) > 1e-9 * max(1, abs(tx.axs_out)) OR abs(r.weth_out - tx.weth_out) > 1e-9 * max(1, abs(tx.weth_out))`,
      )
      .get() as { n: number }
    const extra = db
      .prepare(
        `SELECT COUNT(*) AS n FROM rollups_hourly r LEFT JOIN (SELECT DISTINCT (ts/3600)*3600 AS hour, type, nft_type FROM transactions) tx USING (hour, type, nft_type) WHERE tx.hour IS NULL`,
      )
      .get() as { n: number }
    checks.push({
      name: 'every (hour,type,nft_type) rollup matches transactions',
      ok: groupsBad.n === 0 && extra.n === 0,
      detail: `${groupsBad.n} mismatched, ${extra.n} extra rollup rows`,
    })
  }

  const totals = [
    ['total_axs_in_wei', 'axs_in_wei'],
    ['total_weth_in_wei', 'weth_in_wei'],
    ['total_axs_out_wei', 'axs_out_wei'],
    ['total_weth_out_wei', 'weth_out_wei'],
  ] as const
  for (const [key, col] of totals) {
    const meta = getMetaBigInt(stmts, key)
    const fromTx = sumWeiColumn(db, 'transactions', col)
    const detailParts = [`meta=${meta}`, `transactions=${fromTx}`]
    let ok = meta === fromTx
    if (full) {
      const [token, direction] = col.startsWith('axs')
        ? ['AXS', col.includes('_in_') ? 'in' : 'out']
        : ['WETH', col.includes('_in_') ? 'in' : 'out']
      const fromTransfers = sumWeiColumn(
        db,
        'token_transfers',
        'amount_wei',
        'token = ? AND direction = ?',
        [token, direction],
      )
      detailParts.push(`token_transfers=${fromTransfers}`)
      ok = ok && fromTransfers === fromTx
    }
    checks.push({
      name: `BigInt total ${key} matches`,
      ok,
      detail: detailParts.join(' '),
    })
  }

  const cursor = getMetaInt(stmts, 'cursor_treasury')
  const maxBlock = (
    db.prepare('SELECT MAX(block) AS b FROM transactions').get() as {
      b: number | null
    }
  ).b
  checks.push({
    name: 'no transaction beyond the cursor',
    ok:
      cursor === undefined
        ? maxBlock === null
        : maxBlock === null || maxBlock < cursor,
    detail: `cursor=${cursor ?? 'unset'} maxBlock=${maxBlock ?? 'none'}`,
  })
  return checks
}

export function checkpointCheck(ctx: AppContext): Check[] {
  const { db, stmts } = ctx
  const cursor = getMetaInt(stmts, 'cursor_treasury') ?? ctx.config.START_BLOCK
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(axs_in),0) AS axs, COALESCE(SUM(weth_in),0) AS weth, COUNT(*) AS n FROM transactions WHERE ts < ?',
    )
    .get(LEGACY_CHECKPOINT.beforeTs) as { axs: number; weth: number; n: number }
  const covered = db
    .prepare('SELECT MIN(block) AS lo, MAX(ts) AS ts FROM transactions')
    .get() as { lo: number | null; ts: number | null }
  // first fee tx is at block 17,349,945; the legacy cursor died at 42,238,965
  const coversCheckpoint =
    (covered.ts ?? 0) >= LEGACY_CHECKPOINT.beforeTs &&
    (covered.lo ?? Number.POSITIVE_INFINITY) <= 17_349_945 &&
    cursor > 42_238_965
  const axsRel = rel(row.axs, LEGACY_CHECKPOINT.axs)
  const wethRel = rel(row.weth, LEGACY_CHECKPOINT.weth)
  return [
    {
      name: 'DB covers the whole history up to the checkpoint',
      ok: coversCheckpoint,
      detail: coversCheckpoint
        ? 'yes'
        : `no (blocks from ${covered.lo ?? 'none'}, cursor=${cursor}); the comparison below is partial`,
    },
    {
      name: `cumulative AXS inflow before 2025-02-04 vs legacy ${LEGACY_CHECKPOINT.axs.toFixed(3)}`,
      ok: axsRel <= LEGACY_CHECKPOINT.tolerance,
      detail: `db=${row.axs.toFixed(3)} diff=${(row.axs - LEGACY_CHECKPOINT.axs).toFixed(3)} (${(axsRel * 100).toFixed(4)}%) over ${row.n} txs`,
    },
    {
      name: `cumulative WETH inflow before 2025-02-04 vs legacy ${LEGACY_CHECKPOINT.weth.toFixed(3)}`,
      ok: wethRel <= LEGACY_CHECKPOINT.tolerance,
      detail: `db=${row.weth.toFixed(3)} diff=${(row.weth - LEGACY_CHECKPOINT.weth).toFixed(3)} (${(wethRel * 100).toFixed(4)}%)`,
    },
  ]
}

/** Re-run phase-1 discovery on N random 500-block windows inside the indexed span and diff the hash sets against the DB. */
export async function spotCheck(
  ctx: AppContext,
  windows: number,
  random = Math.random,
): Promise<Check[]> {
  const cursor = getMetaInt(ctx.stmts, 'cursor_treasury')
  if (cursor === undefined)
    return [{ name: 'spot check', ok: false, detail: 'nothing indexed yet' }]
  // A `--from` run may not start at START_BLOCK; only sample what this DB actually covers.
  const first = (
    ctx.db.prepare('SELECT MIN(block) AS b FROM transactions').get() as {
      b: number | null
    }
  ).b
  const lo = Math.max(ctx.config.START_BLOCK, first ?? ctx.config.START_BLOCK)
  const hi = cursor - 1
  if (hi - lo < 500)
    return [
      {
        name: 'spot check',
        ok: false,
        detail: `indexed span ${lo}-${hi} is shorter than one 500-block window`,
      },
    ]
  const checks: Check[] = []
  const q = ctx.db.prepare(
    'SELECT hash FROM transactions WHERE block BETWEEN ? AND ?',
  )
  for (let i = 0; i < windows; i++) {
    const from = lo + Math.floor(random() * (hi - lo - 499))
    const to = from + 499
    try {
      const logs = await discoverTreasuryLogsAdaptive(ctx, from, to)
      const live = new Set(logs.map((l) => l.transactionHash))
      const stored = new Set(
        (q.all(from, to) as Array<{ hash: Hex }>).map((r) => r.hash),
      )
      const missing = [...live].filter((h) => !stored.has(h))
      const extra = [...stored].filter((h) => !live.has(h))
      checks.push({
        name: `spot ${from}-${to}`,
        ok: missing.length === 0 && extra.length === 0,
        detail: `live=${live.size} db=${stored.size} missing=${missing.length} extra=${extra.length}${missing.length ? ` first missing ${missing[0]}` : ''}${extra.length ? ` first extra ${extra[0]}` : ''}`,
      })
    } catch (err) {
      checks.push({
        name: `spot ${from}-${to}`,
        ok: false,
        detail: `discovery failed: ${classifyError(err).message.split('\n')[0]}`,
      })
    }
  }
  return checks
}

export interface TxVerification {
  live: Omit<ClassifiedTx, 'tokenTransfers' | 'nftTransfers'> & {
    axsIn: number
    wethIn: number
    axsOut: number
    wethOut: number
    tokenTransfers: Array<Record<string, string | number>>
    nftTransfers: Array<Record<string, string | number>>
    logsDecoded: number
    logsTotal: number
  }
  db: Record<string, unknown> | null
  matches: boolean | null
}

/** Decode + classify one tx live and compare with the stored row, if any. */
export async function verifyTx(
  ctx: AppContext,
  hash: Hex,
): Promise<TxVerification> {
  const raw = await ctx.rpc.request<RpcTransactionReceipt | null>(
    'eth_getTransactionReceipt',
    [hash],
  )
  if (!raw) throw new Error(`no receipt for ${hash}`)
  const receipt = normalizeReceipt(raw)
  const decoded = decodeLogs(receipt.logs, ctx.log)
  const c = classifyTx({
    hash,
    block: receipt.blockNumber,
    txIndex: receipt.transactionIndex,
    from: receipt.from,
    to: receipt.to,
    logs: decoded,
  })
  const stored = ctx.db
    .prepare('SELECT * FROM transactions WHERE hash = ?')
    .get(hash) as Record<string, unknown> | undefined
  const str = (v: unknown): string | number =>
    typeof v === 'bigint' ? v.toString() : (v as string | number)
  const live = {
    ...c,
    axsIn: weiToUnits(c.axsInWei),
    wethIn: weiToUnits(c.wethInWei),
    axsOut: weiToUnits(c.axsOutWei),
    wethOut: weiToUnits(c.wethOutWei),
    tokenTransfers: c.tokenTransfers.map((t) =>
      Object.fromEntries(Object.entries(t).map(([k, v]) => [k, str(v)])),
    ),
    nftTransfers: c.nftTransfers.map((t) =>
      Object.fromEntries(Object.entries(t).map(([k, v]) => [k, str(v)])),
    ),
    logsDecoded: decoded.length,
    logsTotal: receipt.logs.length,
  }
  const matches = stored
    ? stored.type === c.type &&
      stored.nft_type === c.nftType &&
      stored.axs_in_wei === c.axsInWei.toString() &&
      stored.weth_in_wei === c.wethInWei.toString() &&
      stored.axs_out_wei === c.axsOutWei.toString() &&
      stored.weth_out_wei === c.wethOutWei.toString()
    : null
  return { live, db: stored ?? null, matches }
}

export function serializeBigInt(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  )
}

/** Runs the requested checks, prints them, returns false if any failed. */
export async function verify(
  ctx: AppContext,
  opts: VerifyOptions,
  out: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
): Promise<boolean> {
  const checks: Check[] = []
  if (opts.tx) {
    const v = await verifyTx(ctx, opts.tx)
    out(JSON.stringify(serializeBigInt(v), null, 2))
    if (v.matches !== null)
      checks.push({
        name: `stored row for ${opts.tx} matches live classification`,
        ok: v.matches,
        detail: v.matches ? 'match' : 'MISMATCH (see above)',
      })
  }
  if (!opts.tx || opts.full || opts.checkpoint || opts.spot) {
    if (!opts.tx || opts.full)
      checks.push(...invariantChecks(ctx, Boolean(opts.full)))
    if (opts.checkpoint) checks.push(...checkpointCheck(ctx))
    if (opts.spot) checks.push(...(await spotCheck(ctx, opts.spot)))
  }
  let allOk = true
  for (const c of checks) {
    if (!c.ok) allOk = false
    out(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`)
  }
  return allOk
}
