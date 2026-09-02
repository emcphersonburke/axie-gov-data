# Data model

## SQLite (`indexer/src/db/migrations/0001_init.sql`)

Wei exceeds SQLite's 64-bit integer, so exact amounts are decimal **TEXT**; each also has a
**REAL** token-unit column for `SUM()` (SQLite ≥ 3.43 uses compensated summation, accurate far
beyond the four decimals displayed). Exact totals are additionally kept as BigInt strings in `meta`.
All addresses and hashes are lowercase hex. Timestamps are unix seconds UTC.

| Table | Key | Purpose |
|---|---|---|
| `meta` | `key` | `cursor_treasury`, `cursor_bridge` (next block to process), `total_{axs,weth}_{in,out}_wei`, `rates_json`, `rates_fetched_at`, `first_tx_block`, `first_tx_ts`, `rollups_dirty`. |
| `blocks` | `number` | `ts`, `source` (`rpc` exact or `interp` interpolated between anchors during backfill). |
| `transactions` | `id` (rowid), `hash` unique | `block`, `tx_index`, `ts`, `type`, `nft_type`, `nft_count`, `from_address`, `to_address`, `{axs,weth}_{in,out}_wei` (TEXT), `{axs,weth}_{in,out}` (REAL). |
| `token_transfers` | `(tx_id, log_index)` | Every AXS/WETH transfer touching the treasury: `token`, `direction`, `from_address`, `to_address`, `amount_wei`, `amount`. |
| `nft_transfers` | `(tx_id, log_index, sub_index)` | `contract`, `nft_type`, `token_id`, `quantity` (ERC-1155), `from_address`, `to_address`. `sub_index` expands `TransferBatch`. |
| `bridge_events` | `(tx_hash, log_index)` | Gateway `Deposited`/`WithdrawalRequested`: `block`, `ts`, `kind`, `token`, `amount_wei`, `amount` (18-dec tokens only), `address` (Ronin-side user), `receipt_id`. |
| `rollups_hourly` | `(hour, type, nft_type)` | Incremental hourly sums (`{axs,weth}_{in,out}`, `tx_count`). Every snapshot query reads this, never `transactions`. |

Indexes: `transactions(block)`, `transactions(ts)`, `transactions(type, ts)`, `blocks(ts)`,
`bridge_events(token, block)`.

### `type` vocabulary

`sale` · `rc-mint` · `ascension` · `breeding` · `evolution` · `atiablessing` · `outflow` (new: AXS/WETH
leaving the treasury) · `unknown`. Precedence when classifying: marker events → fee source contract →
inflow with NFT movement (`sale`) → inflow (`unknown`) → `outflow`.

### `nft_type` vocabulary

`Axie` · `Land` · `Land Item` · `Rune` · `Charm` · `Material` · `Accessory` · `Consumable Item` ·
`Mixed` (more than one kind in the tx) · `None`. One value per transaction — the legacy views
joined `nft_transfers` and counted a fee once per NFT moved.

## `dashboard.json` (`shared/src/snapshot.ts`)

Precomputed by the indexer, validated on write and on read with the shared zod schema. Amounts are
token units as JSON numbers; exact wei totals are decimal strings.

```
schemaVersion, generatedAt, treasury
chain      { id: 2020, head, headAt }
indexer    { status: backfilling|live, lastIndexedBlock, lastIndexedAt, lagBlocks, lagSeconds,
             confirmations, bridgeLastIndexedBlock, firstTxBlock, firstTxAt, txCount }
totals     { inflow{axs,weth}, outflow{axs,weth}, net{axs,weth}, txCount,
             exact{axsInWei, wethInWei, axsOutWei, wethOutWei} }
bridge     { token, all{deposited,withdrawn,net}, treasury{deposited,withdrawn,net}, eventCount, lastIndexedBlock }
rates      { axsUsd, ethUsd, fetchedAt, stale, source }
ranges[24h|7d|30d|6m|1y|all]
           { bucket: 1h|8h|1d|1w|1M, windowStart, windowEnd,
             baseline{axs,weth},                 -- cumulative inflow before windowStart
             series[{t, axs, weth, txCount}],    -- dense, ascending, bucket starts in unix seconds
             byType[], byNftType[], breakdown[{type, nftType, axs, weth, txCount}] }
```

Buckets are UTC and epoch-aligned: 24h/1h, 7d/8h (00/08/16), 30d/1d, 6m/1w (Monday), 1y/1M,
all/1M from the first transaction. Invariant per range: `baseline + Σ series ≈ totals.inflow`.

`health.json`: `{ ok, status, generatedAt, lastIndexedBlock, chainHead, lagBlocks, ratesStale }`,
`ok = lagBlocks < 400`.
