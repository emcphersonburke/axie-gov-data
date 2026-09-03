import type {
  Bucket,
  DashboardSnapshot,
  HealthSnapshot,
  NftType,
  RangeKey,
  RangeStats,
  TxType,
} from '@axie-gov/shared'
import {
  ADDRESSES,
  bucketStart,
  bucketStarts,
  NFT_TYPES,
  RANGE_KEYS,
  rangeWindow,
  SNAPSHOT_SCHEMA_VERSION,
  STALE_LAG_BLOCKS,
  toIso,
  TX_TYPES,
} from '@axie-gov/shared'

import { weiToUnits } from '../classify/classify.js'
import type { Config } from '../config.js'
import type { Db } from '../db/open.js'
import {
  getMetaBigInt,
  getMetaInt,
  prepareStatements,
} from '../db/statements.js'
import type { RatesView } from './rates.js'

/** Ronin block time; used only to turn a block lag into seconds when no header is at hand. */
const BLOCK_SECONDS = 3

export interface BuildInputs {
  /** unix seconds */
  now: number
  head: number | null
  /** unix seconds of the head block, if known */
  headAt: number | null
  rates: RatesView
}

export interface SnapshotPair {
  dashboard: DashboardSnapshot
  health: HealthSnapshot
}

interface RollupRow {
  hour: number
  type: TxType
  nft_type: NftType
  axs_in: number
  weth_in: number
  tx_count: number
}

interface Acc {
  axs: number
  weth: number
  txCount: number
}

const zero = (): Acc => ({ axs: 0, weth: 0, txCount: 0 })
const add = (a: Acc, r: RollupRow): void => {
  a.axs += r.axs_in
  a.weth += r.weth_in
  a.txCount += r.tx_count
}

const TYPE_ORDER = new Map(TX_TYPES.map((t, i) => [t, i]))
const NFT_ORDER = new Map(NFT_TYPES.map((t, i) => [t, i]))

function buildRange(
  db: Db,
  key: RangeKey,
  now: number,
  firstTxTs: number,
): RangeStats {
  const w = rangeWindow(key, now, firstTxTs)
  const bucket: Bucket = w.bucket
  const starts = bucketStarts(w)
  const rows = db
    .prepare(
      'SELECT hour, type, nft_type, axs_in, weth_in, tx_count FROM rollups_hourly WHERE hour >= ? AND hour < ?',
    )
    .all(w.windowStart, w.windowEnd) as RollupRow[]
  const baseRow = db
    .prepare(
      'SELECT COALESCE(SUM(axs_in), 0) AS axs, COALESCE(SUM(weth_in), 0) AS weth FROM rollups_hourly WHERE hour < ?',
    )
    .get(w.windowStart) as { axs: number; weth: number }

  const series = new Map<number, Acc>(starts.map((t) => [t, zero()]))
  const byType = new Map<TxType, Acc>()
  const byNft = new Map<NftType, Acc>()
  const breakdown = new Map<string, Acc & { type: TxType; nftType: NftType }>()
  for (const r of rows) {
    const t = bucketStart(r.hour, bucket)
    let s = series.get(t)
    if (!s) {
      s = zero()
      series.set(t, s)
    }
    add(s, r)
    let bt = byType.get(r.type)
    if (!bt) byType.set(r.type, (bt = zero()))
    add(bt, r)
    let bn = byNft.get(r.nft_type)
    if (!bn) byNft.set(r.nft_type, (bn = zero()))
    add(bn, r)
    const k = `${r.type}|${r.nft_type}`
    let bd = breakdown.get(k)
    if (!bd)
      breakdown.set(k, (bd = { ...zero(), type: r.type, nftType: r.nft_type }))
    add(bd, r)
  }
  return {
    bucket,
    windowStart: w.windowStart,
    windowEnd: w.windowEnd,
    baseline: { axs: baseRow.axs, weth: baseRow.weth },
    series: [...series.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, a]) => ({ t, ...a })),
    byType: [...byType.entries()]
      .sort(
        (a, b) => (TYPE_ORDER.get(a[0]) ?? 99) - (TYPE_ORDER.get(b[0]) ?? 99),
      )
      .map(([type, a]) => ({ type, ...a })),
    byNftType: [...byNft.entries()]
      .sort((a, b) => (NFT_ORDER.get(a[0]) ?? 99) - (NFT_ORDER.get(b[0]) ?? 99))
      .map(([nftType, a]) => ({ nftType, ...a })),
    breakdown: [...breakdown.values()]
      .sort(
        (a, b) =>
          (TYPE_ORDER.get(a.type) ?? 99) - (TYPE_ORDER.get(b.type) ?? 99) ||
          (NFT_ORDER.get(a.nftType) ?? 99) - (NFT_ORDER.get(b.nftType) ?? 99),
      )
      .map(({ type, nftType, axs, weth, txCount }) => ({
        type,
        nftType,
        axs,
        weth,
        txCount,
      })),
  }
}

/**
 * Build `dashboard.json` + `health.json` from rollups, meta and bridge_events.
 * Never touches `transactions`, so it stays fast at any DB size.
 */
export function buildSnapshot(
  db: Db,
  config: Pick<Config, 'CONFIRMATIONS' | 'START_BLOCK' | 'BRIDGE_START_BLOCK'>,
  inputs: BuildInputs,
): SnapshotPair {
  const stmts = prepareStatements(db)
  const now = inputs.now
  const cursorTreasury =
    getMetaInt(stmts, 'cursor_treasury') ?? config.START_BLOCK
  const cursorBridge =
    getMetaInt(stmts, 'cursor_bridge') ?? config.BRIDGE_START_BLOCK
  const lastIndexedBlock = cursorTreasury - 1
  // An unknown head (RPC unreachable) must never read as "caught up": without it we cannot
  // compute lag, so the snapshot reports backfilling / not ok until the chain is reachable again.
  const headKnown = inputs.head !== null
  const head = inputs.head ?? lastIndexedBlock
  const lagBlocks = Math.max(0, head - lastIndexedBlock)

  const nearest = db
    .prepare(
      'SELECT number, ts FROM blocks WHERE number <= ? ORDER BY number DESC LIMIT 1',
    )
    .get(lastIndexedBlock) as { number: number; ts: number } | undefined
  let lastIndexedAt: number
  if (nearest)
    lastIndexedAt =
      nearest.ts + (lastIndexedBlock - nearest.number) * BLOCK_SECONDS
  else if (inputs.headAt !== null)
    lastIndexedAt = inputs.headAt - lagBlocks * BLOCK_SECONDS
  else lastIndexedAt = now - lagBlocks * BLOCK_SECONDS
  lastIndexedAt = Math.min(lastIndexedAt, now)
  const lagSeconds =
    inputs.headAt !== null
      ? Math.max(0, inputs.headAt - lastIndexedAt)
      : lagBlocks * BLOCK_SECONDS

  const firstTxBlock = getMetaInt(stmts, 'first_tx_block') ?? config.START_BLOCK
  const firstTxTs = getMetaInt(stmts, 'first_tx_ts') ?? now
  const txCountRow = db
    .prepare('SELECT COALESCE(SUM(tx_count), 0) AS n FROM rollups_hourly')
    .get() as { n: number }
  const txCount = Number(txCountRow.n)

  const exact = {
    axsInWei: getMetaBigInt(stmts, 'total_axs_in_wei'),
    wethInWei: getMetaBigInt(stmts, 'total_weth_in_wei'),
    axsOutWei: getMetaBigInt(stmts, 'total_axs_out_wei'),
    wethOutWei: getMetaBigInt(stmts, 'total_weth_out_wei'),
  }
  const inflow = {
    axs: weiToUnits(exact.axsInWei),
    weth: weiToUnits(exact.wethInWei),
  }
  const outflow = {
    axs: weiToUnits(exact.axsOutWei),
    weth: weiToUnits(exact.wethOutWei),
  }

  const bridgeSums = (where: string, params: unknown[]) => {
    const rows = db
      .prepare(
        `SELECT kind, COALESCE(SUM(amount), 0) AS total FROM bridge_events WHERE token = 'WETH' ${where} GROUP BY kind`,
      )
      .all(...params) as Array<{
      kind: 'deposit' | 'withdrawal'
      total: number
    }>
    const deposited = rows.find((r) => r.kind === 'deposit')?.total ?? 0
    const withdrawn = rows.find((r) => r.kind === 'withdrawal')?.total ?? 0
    return { deposited, withdrawn, net: deposited - withdrawn }
  }
  const bridgeCount = db
    .prepare('SELECT COUNT(*) AS n FROM bridge_events')
    .get() as { n: number }

  const ranges = Object.fromEntries(
    RANGE_KEYS.map((k) => [k, buildRange(db, k, now, firstTxTs)]),
  ) as Record<RangeKey, RangeStats>

  const status: 'backfilling' | 'live' =
    headKnown && lagBlocks <= STALE_LAG_BLOCKS ? 'live' : 'backfilling'
  const dashboard: DashboardSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: toIso(now),
    treasury: ADDRESSES.TREASURY,
    chain: {
      id: 2020,
      head,
      headAt: inputs.headAt === null ? null : toIso(inputs.headAt),
    },
    indexer: {
      status,
      lastIndexedBlock,
      lastIndexedAt: toIso(lastIndexedAt),
      lagBlocks,
      lagSeconds: Math.round(lagSeconds),
      confirmations: config.CONFIRMATIONS,
      bridgeLastIndexedBlock: cursorBridge - 1,
      firstTxBlock,
      firstTxAt: toIso(firstTxTs),
      txCount,
    },
    totals: {
      inflow,
      outflow,
      net: { axs: inflow.axs - outflow.axs, weth: inflow.weth - outflow.weth },
      txCount,
      exact: {
        axsInWei: exact.axsInWei.toString(),
        wethInWei: exact.wethInWei.toString(),
        axsOutWei: exact.axsOutWei.toString(),
        wethOutWei: exact.wethOutWei.toString(),
      },
    },
    bridge: {
      token: 'WETH',
      all: bridgeSums('', []),
      treasury: bridgeSums('AND address = ?', [ADDRESSES.TREASURY]),
      eventCount: Number(bridgeCount.n),
      lastIndexedBlock: cursorBridge - 1,
    },
    rates: {
      axsUsd: inputs.rates.axsUsd,
      ethUsd: inputs.rates.ethUsd,
      fetchedAt: inputs.rates.fetchedAt,
      stale: inputs.rates.stale,
      source: 'skymavis-graphql',
    },
    ranges,
  }
  const health: HealthSnapshot = {
    ok: headKnown && lagBlocks < STALE_LAG_BLOCKS,
    status,
    generatedAt: dashboard.generatedAt,
    lastIndexedBlock,
    chainHead: head,
    lagBlocks,
    ratesStale: inputs.rates.stale,
  }
  return { dashboard, health }
}
