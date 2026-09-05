# Cutover: legacy (Vercel + Supabase + cPanel loop) → VPS

Status legend: ✅ done · ◻ pending. Nothing outward-facing (push, DNS, deploy) happens without the
owner's go-ahead.

## A. Preserve the legacy Supabase state

- ✅ Read-only capture over PostgREST committed to `docs/legacy-supabase/`: the 13 views, treasury
  totals and `get_cumulative_totals` at the checkpoint, `meta`/`blocks`/`gateway_transactions`,
  column types, fixture transaction ids.
- ◻ Schema DDL (view bodies, RPC bodies, indexes) via `supabase db dump` — needs Docker running and
  the personal Supabase login or the DB password. Steps in `docs/legacy-supabase/README.md`.
- ◻ `select * from cron.job` → `docs/legacy-supabase/cron-jobs.md`.
- ◻ Check grants on `execute_sql`; revoke from `anon`/`authenticated` if present.
- ◻ Optional full data dump to `~/Backups/axie-supabase/` (not committed).

**Go** when `treasury_totals.csv` matches 22,801,117.13 AXS / 58,668.91 WETH (it does).

## B. Close the unauthenticated write surface

- ✅ Local commit removes `vercel.json` (per-minute cron) and both `process-*-batch` routes.
- ◻ Vercel is being torn down (2026-09-03: the old domain lapsed, so nothing points at it and the
  site had been stale since 2025-02). Once the project is deleted, pushing `main` triggers no
  deploy. Downgrade the Vercel team from Pro afterwards; deleting the project alone keeps billing.
- ◻ cPanel: stop the Node app; check `crontab -l` for `@reboot`; leave `../private_html/.env` until E.

## C. Provision, deploy, backfill, reconcile

> **RPC provider is the gating item (measured 2026-09-02).** The Sky Mavis gateway
> (`api-gateway.skymavis.com/rpc` and `/rpc/archive`) accepts the key but answered every call with
> HTTP 503 `failure to get a peer from the ring-balancer` — check the app's enabled services in the
> Sky Mavis developer portal (Ronin RPC / archive), or open a ticket. The public
> `api.roninchain.com/rpc` works for tailing (200-block `eth_getLogs` cap, JSON-RPC batches ≤ 3,
> ~5 req/s) but returns `null` receipts older than roughly 2.5M blocks, so it **cannot backfill
> 2022–2025**. If the gateway stays down, an archive-capable provider with Ronin support (Alchemy,
> Chainstack, dRPC paid tier) goes in `RONIN_RPC_URL`; the indexer's endpoint pool (`RPC_URLS`)
> can split receipts across providers.
>
> **From the Hetzner box (2026-09-03):** `api.roninchain.com` blocks Hetzner's whole network
> (Cloudflare error 1005, ASN 24940 banned), so the public RPC is not an option there at all.
> dRPC's keyless public endpoint answers `eth_getLogs` only up to 200 blocks and returns
> "Temporary internal error" for `eth_getBlockByNumber`, so it cannot even drive a near-head tail.
> A keyed provider is required before the indexer runs.
>
> **Measured 2026-09-03 with keyed accounts:** Sky Mavis has sunset its RPC products (the console
> marks "Ronin Archive Node" deprecated), which is also the likely reason the legacy sync died in
> Feb 2025. **dRPC free**: `eth_getLogs`, `eth_getBlockReceipts` and full-block calls all fail with
> "Temporary internal error" — unusable. **Chainstack Developer (free)**: works, but only for the
> last ~128 blocks; everything older (blocks, logs, receipts by number) is gated as "Archive". The
> live tail runs on it today (`RONIN_RPC_BASIC_AUTH`, CONFIRMATIONS=30 leaves ~5 min of slack) but
> cannot recover from a longer outage, and the 2022–2025 backfill needs an archive plan:
> Chainstack Growth ($49/mo, 20M requests, cancel after the month) or Alchemy pay-as-you-go
> ($0.45 per 1M CU). Alchemy's free tier (tens of millions of CU/month, archive included) is the
> candidate for a robust free steady state; not yet tested from the box.


1. ◻ Domain: the previous one lapsed. Recover it from Namecheap's redemption window, re-register
   it, or pick a new name; then add it to Cloudflare (free) with Cloudflare's nameservers. Wait for
   propagation before issuing the Origin CA cert.
2. ✅ Hetzner CX23 in Helsinki (62.238.105.235, Ubuntu 26.04), provisioned 2026-09-03.
   `deploy/provision.sh` (see `deploy/README.md`); set `RONIN_API_KEY`; install the origin cert;
   healthchecks.io URLs. Add `beta.<domain>` as a proxied A record → server IP.
3. ✅ Deployed; the tail ran live from 2026-09-03 17:05 UTC on Chainstack.
4. ✅ Historical backfill 2026-09-03 → 2026-09-04 (~29 h wall clock incl. a reboot): 17,711,512
   transactions, 291,266 bridge events, 12.7 GB. Receipts on Chainstack Growth up to block 52.67M,
   then `LOG_FETCH_STRATEGY=range` (Alchemy sweeps) for the dense 2026 stretch; Chainstack stayed
   under 20M requests.
5. ✅ Reconciled 2026-09-04 (interim, while the backfill was still running past the checkpoint):
   cumulative inflow before 2025-02-04 = **22,818,618.07 AXS (+0.077 %) / 58,700.44 WETH (+0.054 %)**
   vs legacy 22,801,117.13 / 58,668.91. Monthly AXS matches the legacy views to the cent for
   Oct 2022 – Oct 2024; WETH runs 0–6 % higher in 2024 (fee summing); legacy Dec 2024 / Jan 2025
   were badly under-counted (stale materialized views before the sync died). Original criterion:
   `verify --checkpoint` within **[−0.5 %, +3 %]** of legacy (higher is expected from
   the fee-summing fix and legacy gaps; lower means a missing contract, `TransferBatch`, a changed
   event signature, or the confirmations boundary). Per-month series vs
   `reference-figures/aggregated_fees_all.csv` within ±2 % for complete months. Spot-check 25
   legacy hashes with `verify --tx` and 10 new-only ones on the Ronin explorer.
6. ✅ Database swapped under the tail 2026-09-04 19:27 UTC; dashboard serves the full history at
   http://62.238.105.235 (`status: live`, 24.10M AXS / 59,031 WETH cumulative). healthchecks.io
   URLs still to be added.
7. ◻ Contract drift since the legacy sync stopped (Feb 2025), seen while smoke-testing near head:
   marketplace fee transfers now come from `0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3` (not the
   old `MARKETPLACE` address) and AXS fees route via `0xb4c12d442fb0f90eba1fe5c63498aa91c02bc183`;
   no `rc-mint` or `breeding` transactions appeared in ~40k recent blocks. Sales still classify via
   the NFT fallback. During reconciliation compare per-type monthly counts against
   `reference-figures/aggregated_transactions_all.csv`; if a type vanished after Feb 2025, add the
   new contract to `shared/src/contracts.ts` and re-run `rebuild-rollups`.
8. ◻ **Bridge / Backed WETH:** the Ronin Gateway (`0x0cf8ff40…`) has emitted nothing recently —
   bridging moved to Chainlink CCIP (WETH now minted from
   `0x320a10449556388503fd71d74a16ab52e0bd1deb`). Historical gateway events decode correctly, so
   `bridge.all.net` is accurate up to the migration and frozen after it.
9. ✅ **"Backed WETH" resolved 2026-09-04.** It never meant bridge deposits minus withdrawals (that
   is −50,044 WETH chain-wide, a different quantity). Sky Mavis staff explained it in the Axie
   developer Discord on 2024-07-04: the March 2022 bridge hack took 173,600 ETH, Sky Mavis refunded
   117,600 ETH of user funds, and the remaining **56,000 ETH of shortfall was left against the
   community treasury**, so that much of the treasury's WETH is a claim on Sky Mavis rather than
   spendable. Backed WETH = treasury net WETH − 56,000 (`UNBACKED_WETH_FROM_HACK` in `shared/`).
   Both legacy hardcoded values reconcile to this: 2,087.9213 (Jul 2024) and 2,618.2305 (Dec 2024)
   are the treasury balance at the time minus ~56,000, the December figure to within 34 WETH.
   Today the tile reads ≈ 3,031 WETH.

## D. Go live

No overlap with Vercel to manage.

- ◻ Add apex/www to the Caddyfile site block (and the origin cert if not wildcard), `systemctl reload caddy`.
- ◻ Cloudflare: proxied A records apex/www → server IP.
- ◻ Confirm `dig +short <domain>` resolves to Cloudflare and
  `curl -sI https://<domain>/data/dashboard.json` shows `cache-control: public, max-age=60`.

## E. Decommission (after 7 days green)

- ◻ Vercel: delete the project (safe now, see B) and downgrade the team from Pro.
- ◻ Reclaim `axie-gov.vercel.app` as a redirect once the new domain is live: the Axie blog post
  announcing the hackathon win still links there and it currently 404s. See
  `deploy/vercel-redirect/`. Also worth asking Sky Mavis to update the link itself.
- ◻ Supabase: pause → delete project → **downgrade the organization to Free** (the $25 is org-level).
  Only after the Step A dump has been re-read once.
- ◻ cPanel: remove the Node app, shred `../private_html/.env`, cancel hosting at renewal.
- ◻ Rotate the Sky Mavis API key (it lived in Vercel, cPanel, and two local env files); update
  `/etc/axie-indexer.env`; restart.
- ◻ Archive `emcphersonburke/axie-data-gov-sync` on GitHub (its README already points here);
  `git remote remove temp` in this repo.
