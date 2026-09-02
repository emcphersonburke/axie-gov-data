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
- ◻ Push to `main` **only when you are ready for Vercel to redeploy** (it auto-deploys). Then verify
  Cron Jobs is empty in Vercel and the two routes 404.
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


1. ◻ Confirm the production domain (Vercel → Domains). Add it to Cloudflare (free plan) and switch
   Namecheap nameservers to Cloudflare's. Wait for propagation before issuing the Origin CA cert.
2. ◻ Hetzner CX23, Falkenstein or Helsinki, Ubuntu 24.04, your SSH key, Backups on.
   `deploy/provision.sh` (see `deploy/README.md`); set `RONIN_API_KEY`; install the origin cert;
   healthchecks.io URLs. Add `beta.<domain>` as a proxied A record → server IP.
3. ◻ `DEPLOY_HOST=axie@<ip> DOMAIN=beta.<domain> deploy/deploy.sh`. `tail` starts catching up from
   block 16,377,111.
4. ◻ First 30 min: `backfill --probe` into a scratch DB for the gateway's rate accounting; watch
   blocks/s and ETA in the journal. **No-go past here if ETA > 5 days** without tuning
   `RPC_MAX_RPS` / `RPC_BATCH_SIZE` / `RPC_CONCURRENCY` or adding `RPC_URLS`.
5. ◻ Reconcile: `verify --checkpoint` within **[−0.5 %, +3 %]** of legacy (higher is expected from
   the fee-summing fix and legacy gaps; lower means a missing contract, `TransferBatch`, a changed
   event signature, or the confirmations boundary). Per-month series vs
   `reference-figures/aggregated_fees_all.csv` within ±2 % for complete months. Spot-check 25
   legacy hashes with `verify --tx` and 10 new-only ones on the Ronin explorer.
6. ◻ `https://beta.<domain>` renders live; banner clears at `status: live`; healthchecks green 24 h.
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
   `bridge.all.net` is accurate up to the migration and frozen after it. A CCIP leg is a follow-up;
   until then the Backed WETH tile shows the pre-migration figure (tooltip should say so).

## D. DNS switch

- ◻ Add apex/www to the Caddyfile site block (and the origin cert if not wildcard), `systemctl reload caddy`.
- ◻ Cloudflare: proxied A records apex/www → server IP. Instant and reversible.
- ◻ Keep Vercel until `dig +short <domain>` from two networks resolves to the new origin and
  `curl -sI https://<domain>/data/dashboard.json` shows `cache-control: public, max-age=60`.

## E. Decommission (after 7 days green)

- ◻ Vercel: delete the project; downgrade the team from Pro before the next billing date.
- ◻ Supabase: pause → delete project → **downgrade the organization to Free** (the $25 is org-level).
  Only after the Step A dump has been re-read once.
- ◻ cPanel: remove the Node app, shred `../private_html/.env`, cancel hosting at renewal.
- ◻ Rotate the Sky Mavis API key (it lived in Vercel, cPanel, and two local env files); update
  `/etc/axie-indexer.env`; restart.
- ◻ Archive `emcphersonburke/axie-data-gov-sync` on GitHub (its README already points here);
  `git remote remove temp` in this repo.
