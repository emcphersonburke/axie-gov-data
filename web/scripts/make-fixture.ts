/**
 * Generates web/fixtures/dashboard.json — a realistic, deterministic synthetic
 * snapshot the dev server serves at /data/dashboard.json and the tests use.
 *
 *   npx tsx web/scripts/make-fixture.ts          (from the repo root)
 *
 * The numbers come from an hourly inflow model (daily rhythm × multi-year
 * decay × seeded noise) so every range's `baseline + Σ series` equals the
 * all-time totals by construction, and buckets come from the shared
 * rangeWindow/bucketStarts helpers exactly like the indexer's.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  DashboardSnapshot,
  NftType,
  RangeKey,
  RangeStats,
  TxType,
} from '@axie-gov/shared'
import {
  ADDRESSES,
  bucketStarts,
  dashboardSnapshotSchema,
  DEFAULT_CONFIRMATIONS,
  floorHour,
  HOUR,
  nextBucket,
  RANGE_KEYS,
  rangeWindow,
  STALE_LAG_BLOCKS,
  toIso,
} from '@axie-gov/shared'

// ---- fixed reference points -------------------------------------------------
const NOW_ISO = '2026-09-02T12:34:56Z'
const NOW = Math.floor(Date.parse(NOW_ISO) / 1000)
const FIRST_TX_ISO = '2022-10-11T08:17:23Z'
const FIRST_TX = Math.floor(Date.parse(FIRST_TX_ISO) / 1000)
const FIRST_TX_BLOCK = 17_349_945
const CHAIN_HEAD = 60_444_658
const BLOCK_SECONDS = 3

const TARGET_INFLOW = { axs: 24_312_884.5312, weth: 61_204.3318 }
const OUTFLOW_TOTAL = { axs: 1_250_000, weth: 2_400.5 }

// ---- deterministic randomness ----------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(0xa71e)
const round = (n: number, dp = 6) => Number(n.toFixed(dp))

// ---- hourly inflow model ----------------------------------------------------
interface Hourly {
  t: number
  axs: number
  weth: number
  tx: number
}

const firstHour = floorHour(FIRST_TX)
const lastHour = floorHour(NOW)
const hours: Hourly[] = []
for (let t = firstHour; t <= lastHour; t += HOUR) {
  const age = (t - firstHour) / (365 * 86_400) // years since launch
  const decay = Math.exp(-age / 2.2)
  const hourOfDay = new Date(t * 1000).getUTCHours()
  const daily = 1 + 0.35 * Math.sin(((hourOfDay - 6) / 24) * Math.PI * 2)
  const weekday = new Date(t * 1000).getUTCDay()
  const weekend = weekday === 0 || weekday === 6 ? 0.85 : 1
  const noise = 0.55 + rand() * 0.9
  const base = decay * daily * weekend * noise
  // Occasional bursts (mint waves) and quiet hours keep the charts lively.
  const burst = rand() < 0.02 ? 3 + rand() * 4 : 1
  const quiet = rand() < 0.05 ? 0 : 1
  hours.push({
    t,
    axs: base * burst * quiet,
    weth: base * (0.7 + rand() * 0.6) * quiet,
    tx: Math.round(base * burst * quiet * 210),
  })
}
// Scale to the target totals so the headline figures look like the real treasury.
const rawAxs = hours.reduce((s, h) => s + h.axs, 0)
const rawWeth = hours.reduce((s, h) => s + h.weth, 0)
for (const h of hours) {
  h.axs = round(h.axs * (TARGET_INFLOW.axs / rawAxs))
  h.weth = round(h.weth * (TARGET_INFLOW.weth / rawWeth))
}
const inflow = {
  axs: round(hours.reduce((s, h) => s + h.axs, 0)),
  weth: round(hours.reduce((s, h) => s + h.weth, 0)),
}
const txTotal = hours.reduce((s, h) => s + h.tx, 0)

/** Σ hourly over [from, to) — hours before the first tx contribute nothing. */
function sumHours(from: number, to: number) {
  let axs = 0
  let weth = 0
  let tx = 0
  for (const h of hours) {
    if (h.t < from) continue
    if (h.t >= to) break
    axs += h.axs
    weth += h.weth
    tx += h.tx
  }
  return { axs: round(axs), weth: round(weth), tx }
}

// ---- breakdown shares --------------------------------------------------------
interface Share {
  type: TxType
  nftType: NftType
  axs: number
  weth: number
  tx: number
}
// Fractions of the window inflow per (type × nftType) row. Each token column
// and the tx column sum to 1 across the inflow rows; outflow is handled apart.
const SHARES: Share[] = [
  { type: 'sale', nftType: 'Axie', axs: 0.1, weth: 0.55, tx: 0.3 },
  { type: 'sale', nftType: 'Land', axs: 0.01, weth: 0.12, tx: 0.01 },
  { type: 'sale', nftType: 'Land Item', axs: 0.005, weth: 0.04, tx: 0.01 },
  { type: 'sale', nftType: 'Rune', axs: 0.02, weth: 0.05, tx: 0.05 },
  { type: 'sale', nftType: 'Charm', axs: 0.02, weth: 0.05, tx: 0.05 },
  { type: 'sale', nftType: 'Material', axs: 0.01, weth: 0.04, tx: 0.04 },
  { type: 'sale', nftType: 'Accessory', axs: 0.005, weth: 0.03, tx: 0.02 },
  {
    type: 'sale',
    nftType: 'Consumable Item',
    axs: 0.005,
    weth: 0.03,
    tx: 0.03,
  },
  { type: 'sale', nftType: 'Mixed', axs: 0.005, weth: 0.05, tx: 0.01 },
  { type: 'rc-mint', nftType: 'Rune', axs: 0.2, weth: 0, tx: 0.12 },
  { type: 'rc-mint', nftType: 'Charm', axs: 0.24, weth: 0, tx: 0.14 },
  { type: 'ascension', nftType: 'None', axs: 0.1, weth: 0, tx: 0.04 },
  { type: 'breeding', nftType: 'None', axs: 0.2, weth: 0, tx: 0.12 },
  { type: 'evolution', nftType: 'None', axs: 0.05, weth: 0, tx: 0.03 },
  { type: 'atiablessing', nftType: 'None', axs: 0.02, weth: 0, tx: 0.02 },
  { type: 'unknown', nftType: 'None', axs: 0.008, weth: 0.03, tx: 0.008 },
  { type: 'unknown', nftType: 'Axie', axs: 0.002, weth: 0.01, tx: 0.002 },
]
for (const col of ['axs', 'weth', 'tx'] as const) {
  const total = SHARES.reduce((s, r) => s + r[col], 0)
  if (Math.abs(total - 1) > 1e-9)
    throw new Error(`${col} shares sum to ${total}`)
}

function largestRemainder(total: number, weights: number[]): number[] {
  const raw = weights.map((w) => total * w)
  const floored = raw.map(Math.floor)
  let remaining = total - floored.reduce((s, n) => s + n, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (remaining <= 0) break
    floored[i] = (floored[i] ?? 0) + 1
    remaining -= 1
  }
  return floored
}

function buildRange(key: RangeKey): RangeStats {
  const w = rangeWindow(key, NOW, FIRST_TX)
  const starts = bucketStarts(w)
  const series = starts.map((t) => {
    const end = Math.min(nextBucket(t, w.bucket), lastHour + HOUR)
    const s = sumHours(t, end)
    return { t, axs: s.axs, weth: s.weth, txCount: s.tx }
  })
  const before = sumHours(firstHour, w.windowStart)
  const windowInflow = {
    axs: round(series.reduce((s, p) => s + p.axs, 0)),
    weth: round(series.reduce((s, p) => s + p.weth, 0)),
    tx: series.reduce((s, p) => s + p.txCount, 0),
  }
  // Fix rounding so Σ series matches exactly what the hourly model says.
  const modelWindow = sumHours(w.windowStart, lastHour + HOUR)
  if (Math.abs(modelWindow.axs - windowInflow.axs) > 1e-3)
    throw new Error(
      `${key}: bucket sum drift ${modelWindow.axs} vs ${windowInflow.axs}`,
    )

  const txShares = largestRemainder(
    windowInflow.tx,
    SHARES.map((s) => s.tx),
  )
  const breakdown = SHARES.map((share, i) => ({
    type: share.type,
    nftType: share.nftType,
    axs: round(windowInflow.axs * share.axs),
    weth: round(windowInflow.weth * share.weth),
    txCount: txShares[i] ?? 0,
  }))
  // Outflow row: proportional slice of the all-time outflow for this window.
  const windowFraction = windowInflow.axs / inflow.axs
  const outflowTx = Math.max(1, Math.round(37 * windowFraction * 12))
  breakdown.push({
    type: 'outflow',
    nftType: 'None',
    axs: round(OUTFLOW_TOTAL.axs * windowFraction),
    weth: round(OUTFLOW_TOTAL.weth * windowFraction),
    txCount: outflowTx,
  })

  const groupBy = <K extends 'type' | 'nftType'>(field: K) => {
    const acc = new Map<
      string,
      { axs: number; weth: number; txCount: number }
    >()
    for (const row of breakdown) {
      const g = acc.get(row[field]) ?? { axs: 0, weth: 0, txCount: 0 }
      g.axs += row.axs
      g.weth += row.weth
      g.txCount += row.txCount
      acc.set(row[field], g)
    }
    return [...acc.entries()].map(([k, g]) => ({
      [field]: k,
      axs: round(g.axs),
      weth: round(g.weth),
      txCount: g.txCount,
    }))
  }

  return {
    bucket: w.bucket,
    windowStart: w.windowStart,
    windowEnd: w.windowEnd,
    baseline: { axs: before.axs, weth: before.weth },
    series,
    byType: groupBy('type') as RangeStats['byType'],
    byNftType: groupBy('nftType') as RangeStats['byNftType'],
    breakdown,
  }
}

// ---- assemble -----------------------------------------------------------------
const lastIndexedBlock = CHAIN_HEAD - DEFAULT_CONFIRMATIONS
const lagBlocks = CHAIN_HEAD - lastIndexedBlock
const toWei = (n: number) =>
  (BigInt(Math.round(n * 1e6)) * 10n ** 12n).toString()

const snapshot: DashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: NOW_ISO,
  treasury: ADDRESSES.TREASURY,
  chain: { id: 2020, head: CHAIN_HEAD, headAt: toIso(NOW - 4) },
  indexer: {
    status: lagBlocks > STALE_LAG_BLOCKS ? 'backfilling' : 'live',
    lastIndexedBlock,
    lastIndexedAt: toIso(NOW - lagBlocks * BLOCK_SECONDS - 4),
    lagBlocks,
    lagSeconds: lagBlocks * BLOCK_SECONDS,
    confirmations: DEFAULT_CONFIRMATIONS,
    bridgeLastIndexedBlock: lastIndexedBlock,
    firstTxBlock: FIRST_TX_BLOCK,
    firstTxAt: FIRST_TX_ISO,
    txCount: txTotal,
  },
  totals: {
    inflow,
    outflow: OUTFLOW_TOTAL,
    net: {
      axs: round(inflow.axs - OUTFLOW_TOTAL.axs),
      weth: round(inflow.weth - OUTFLOW_TOTAL.weth),
    },
    txCount: txTotal + 37,
    exact: {
      axsInWei: toWei(inflow.axs),
      wethInWei: toWei(inflow.weth),
      axsOutWei: toWei(OUTFLOW_TOTAL.axs),
      wethOutWei: toWei(OUTFLOW_TOTAL.weth),
    },
  },
  bridge: {
    token: ADDRESSES.WETH,
    all: {
      deposited: 1_184_220.4471,
      withdrawn: 1_180_308.0093,
      net: round(1_184_220.4471 - 1_180_308.0093),
    },
    treasury: { deposited: 0, withdrawn: 312.5, net: -312.5 },
    eventCount: 21_487,
    lastIndexedBlock,
  },
  rates: {
    axsUsd: 4.87,
    ethUsd: 3120.55,
    fetchedAt: toIso(NOW - 5 * 60),
    stale: false,
    source: 'skymavis-graphql',
  },
  ranges: Object.fromEntries(
    RANGE_KEYS.map((key) => [key, buildRange(key)]),
  ) as DashboardSnapshot['ranges'],
}

// ---- validate & write -------------------------------------------------------------
const parsed = dashboardSnapshotSchema.parse(snapshot)
for (const key of RANGE_KEYS) {
  const r = parsed.ranges[key]
  if (!r) throw new Error(`range ${key} missing`)
  for (const token of ['axs', 'weth'] as const) {
    const total = r.baseline[token] + r.series.reduce((s, p) => s + p[token], 0)
    const expected = parsed.totals.inflow[token]
    if (Math.abs(total - expected) > Math.max(1e-6 * expected, 1e-3))
      throw new Error(
        `${key}/${token}: baseline + Σ series = ${total}, totals.inflow = ${expected}`,
      )
  }
}

const json = JSON.stringify(parsed, null, 2) + '\n'
if (json.length >= 100_000)
  throw new Error(`fixture too large: ${json.length} bytes`)
const out = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../fixtures/dashboard.json',
)
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, json)
console.log(
  `wrote ${path.relative(process.cwd(), out)} (${json.length} bytes): ` +
    `${parsed.indexer.txCount.toLocaleString()} txs, ` +
    `${parsed.totals.inflow.axs.toLocaleString()} AXS / ${parsed.totals.inflow.weth.toLocaleString()} WETH inflow, ` +
    RANGE_KEYS.map(
      (k) => `${k}=${parsed.ranges[k]?.series.length ?? 0}pts`,
    ).join(' '),
)
