import { z } from 'zod'

import { NFT_TYPES, TX_TYPES } from './contracts.js'
import { BUCKETS, RANGE_KEYS } from './time.js'

/**
 * The JSON contract between the indexer (writer) and the web app (reader).
 * `dashboard.json` is precomputed by the indexer and served as a static file;
 * the web app never touches a database. Amounts are token units (not wei) as
 * JSON numbers; exact wei totals ride along as decimal strings.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const

const amountPair = z.object({ axs: z.number(), weth: z.number() })
const bridgeTotals = z.object({
  deposited: z.number(),
  withdrawn: z.number(),
  net: z.number(),
})

export const txTypeSchema = z.enum(TX_TYPES)
export const nftTypeSchema = z.enum(NFT_TYPES)

export const seriesPointSchema = z.object({
  /** bucket start, unix seconds UTC */
  t: z.number().int(),
  axs: z.number(),
  weth: z.number(),
  txCount: z.number().int(),
})

export const rangeStatsSchema = z.object({
  bucket: z.enum(BUCKETS),
  windowStart: z.number().int(),
  windowEnd: z.number().int(),
  /** cumulative inflow strictly before windowStart (line-chart y0) */
  baseline: amountPair,
  /** inflow per bucket, dense (zero-filled), ascending */
  series: z.array(seriesPointSchema),
  byType: z.array(
    z.object({
      type: txTypeSchema,
      axs: z.number(),
      weth: z.number(),
      txCount: z.number().int(),
    }),
  ),
  byNftType: z.array(
    z.object({
      nftType: nftTypeSchema,
      axs: z.number(),
      weth: z.number(),
      txCount: z.number().int(),
    }),
  ),
  /** the (type, nftType) matrix; drives the rc-mint -> Rune Mint / Charm Mint split */
  breakdown: z.array(
    z.object({
      type: txTypeSchema,
      nftType: nftTypeSchema,
      axs: z.number(),
      weth: z.number(),
      txCount: z.number().int(),
    }),
  ),
})

export const dashboardSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  generatedAt: z.string(),
  treasury: z.string(),
  chain: z.object({
    id: z.literal(2020),
    head: z.number().int(),
    headAt: z.string().nullable(),
  }),
  indexer: z.object({
    status: z.enum(['backfilling', 'live']),
    lastIndexedBlock: z.number().int(),
    lastIndexedAt: z.string(),
    lagBlocks: z.number().int(),
    lagSeconds: z.number().int(),
    confirmations: z.number().int(),
    bridgeLastIndexedBlock: z.number().int(),
    firstTxBlock: z.number().int(),
    firstTxAt: z.string(),
    txCount: z.number().int(),
  }),
  totals: z.object({
    inflow: amountPair,
    outflow: amountPair,
    net: amountPair,
    txCount: z.number().int(),
    exact: z.object({
      axsInWei: z.string(),
      wethInWei: z.string(),
      axsOutWei: z.string(),
      wethOutWei: z.string(),
    }),
  }),
  bridge: z.object({
    token: z.string(),
    /** chain-wide net WETH bridged onto Ronin — what the "Backed WETH" tile shows */
    all: bridgeTotals,
    /** only events whose Ronin-side address is the treasury */
    treasury: bridgeTotals,
    eventCount: z.number().int(),
    lastIndexedBlock: z.number().int(),
  }),
  rates: z.object({
    axsUsd: z.number().nullable(),
    ethUsd: z.number().nullable(),
    fetchedAt: z.string().nullable(),
    stale: z.boolean(),
    source: z.literal('skymavis-graphql'),
  }),
  ranges: z.record(z.enum(RANGE_KEYS), rangeStatsSchema),
})

export const healthSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['backfilling', 'live']),
  generatedAt: z.string(),
  lastIndexedBlock: z.number().int(),
  chainHead: z.number().int(),
  lagBlocks: z.number().int(),
  ratesStale: z.boolean(),
})

export type SeriesPoint = z.infer<typeof seriesPointSchema>
export type RangeStats = z.infer<typeof rangeStatsSchema>
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>
export type HealthSnapshot = z.infer<typeof healthSchema>
export type BreakdownRow = RangeStats['breakdown'][number]

/** Lag above which the indexer reports `backfilling` and the web shows a stale banner (~20 min of 3 s blocks). */
export const STALE_LAG_BLOCKS = 400
