# Architecture

```
Sky Mavis RPC ──▶ indexer (Node 22 + viem, systemd, SQLite) ──▶ /srv/axie/data/{dashboard,health}.json
Sky Mavis GraphQL (prices) ─┘                                       │
                                            Caddy ◀── serves ───────┘ + /srv/axie/web (static Vite SPA)
                                              ▲
                                  Cloudflare (proxy, Origin CA cert) ◀── browsers
```

One box, one long-running process, one static site. The chain is the source of truth; the SQLite
database is a re-indexable cache; `dashboard.json` is the only thing the web app reads.

## Indexer (`indexer/`)

Two legs share one loop (`tail`): catch up from the persisted cursor to `head − CONFIRMATIONS`,
then poll every 15 s. Every batch is committed in **one SQLite transaction** — rows, hourly rollups,
exact BigInt totals in `meta`, and `cursor = to + 1` — so a crash can never leave a half-written
batch with an advanced cursor.

**Treasury leg** — three RPC phases per block range:

1. *Discover*: two filtered `eth_getLogs` against `[AXS, WETH]` with `topics = [Transfer, *, treasury]`
   (inflows) and `[Transfer, treasury, *]` (outflows). Only treasury-touching ERC-20 transfers come
   back — the legacy sync pulled every log on the chain and filtered in JS, which is why it could
   only manage 3 blocks per 3 seconds.
2. *Enrich*: `eth_getTransactionReceipt` for each distinct hash, in JSON-RPC batches, to get every
   log in the transaction (NFT transfers, marker events) plus sender and entry-point contract.
3. *Timestamps*: `eth_getBlockByNumber(n, false)` only for blocks with qualifying transactions, or
   anchor blocks + linear interpolation during backfill when that is cheaper (`blocks.source`).

A free integrity check: every discovered `(hash, logIndex)` must appear in its receipt, otherwise a
lagging replica answered and the batch is retried instead of committed.

**Classification** (pure function over decoded logs): sum AXS/WETH in/out per token with BigInt;
marker events win (`PrayerCountSynced` → atiablessing, `AxieLevelAscended` → ascension,
`PartEvolutionCreated` → evolution, `AxieSpawn` → breeding), then the fee transfer's `from`
(marketplace → sale, portal → rc-mint), then inflow + NFT movement → sale, inflow → unknown,
otherwise outflow. One `nft_type` per transaction (`None` / the kind / `Mixed`).

**Bridge leg** — `eth_getLogs` on the Ronin Gateway for `Deposited` / `WithdrawalRequested`. Both
events carry the full receipt struct, so no other calls are needed. Powers the "Backed WETH" tile
(chain-wide WETH bridged in minus withdrawn).

**Snapshot** — built only from `rollups_hourly`, `meta`, and `bridge_events` (never a scan of
`transactions`), validated against the shared zod schema, written `tmp → fsync → rename`.

## Web (`web/`)

Static Vite + React SPA. One fetch of `/data/dashboard.json` on load, refetched every 60 s while
the tab is visible; range switching is local state. Nivo line + pie charts, SCSS modules, and the
PixiJS Axie terrarium loaded lazily after the charts paint (skipped under reduced motion).
No API keys, no server code.

## Shared (`shared/`)

Contract addresses and descriptors (public on-chain facts, checked in lowercase), ABIs as viem
`as const`, canonical ERC event ABIs, event selectors, UTC bucketing helpers, and the
`dashboard.json` zod schema both sides validate against.

## Ops

`deploy/` holds the Caddyfile, systemd unit, timers, and scripts. Health is a dead-man switch:
the box pings healthchecks.io every 5 minutes *only* when the indexer is active, the snapshot is
fresh, lag is small, and the disk has room.
