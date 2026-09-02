# Legacy Supabase snapshot (read-only capture, 2026-09-02)

The original dashboard stored everything in a hosted Supabase project whose schema was never
committed. This directory preserves what could be pulled **read-only over PostgREST** with the
service key before the project is retired, plus a checklist for the parts that need `pg_dump`.

## What is here

| Path | Contents |
|---|---|
| `schema-from-openapi.json` | Column names/types for every table and view, and the RPC list, as PostgREST advertised them. Not DDL — no indexes, constraints, or view bodies. |
| `reference-figures/aggregated_*.csv` | Full contents of the 13 materialized views the dashboard read (tiny; ≤ 30 rows each). These are the **legacy chart figures** to compare the rebuilt indexer against. |
| `reference-figures/treasury_totals.csv` | Legacy cumulative inflow: **22,801,117.13 AXS / 58,668.91 WETH** as of the last indexed block (2025-02-03). |
| `reference-figures/get_cumulative_totals_*.csv` | The `get_cumulative_totals(end_date)` RPC at the checkpoint dates. |
| `reference-figures/gateway_transactions_totals.csv` | Legacy bridge totals by type (bridge leg stalled at block 23.3M, so these are partial). |
| `reference-figures/fixture-candidates.json` | A few legacy `transaction_id`s per `type`, used to capture receipt fixtures for the new classifier tests. |
| `small-tables/{meta,blocks,gateway_transactions}.csv` | Complete exports of the three small tables. `meta` holds the dead cursors (`last_processed_block` = 42238965). |
| `refresh_views.ts` | The Deno edge function that refreshed the materialized views (moved from `supabase/functions/refresh_views/index.ts`). |

`transactions` (~7.4M rows) and `nft_transfers` (~7.9M rows) were **not** exported — the chain is
the source of truth and the rebuild re-indexes from block 16,377,111.

## Still to capture (needs the DB password or the owning Supabase account)

The CLI on this machine is logged into a different organization, Docker was not running, and the
`execute_sql` RPC returns void, so the following could not be pulled automatically:

1. Start Docker Desktop. `supabase login` with the **personal** account that owns the project (or
   grab the DB password from Dashboard → Project Settings → Database; resetting it is safe, nothing
   live connects directly).
2. Schema (tables, indexes, the 13 view bodies, `treasury_totals`, both RPC bodies):
   ```sh
   supabase db dump --linked -p "$DB_PASSWORD" -f docs/legacy-supabase/schema.sql
   grep -c 'CREATE MATERIALIZED VIEW' docs/legacy-supabase/schema.sql   # expect 12
   grep -E 'FUNCTION public\.(get_cumulative_totals|execute_sql)' docs/legacy-supabase/schema.sql
   ```
3. Cron jobs (what triggered `refresh_views`): in Studio → SQL editor, `select * from cron.job;`
   → paste into `cron-jobs.md`.
4. Grants on the arbitrary-SQL RPC — if `anon` or `authenticated` can execute it, revoke now:
   ```sql
   select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'execute_sql';
   revoke execute on function public.execute_sql(text) from anon, authenticated;
   ```
5. Optional one-time full data dump (1–3 GB, keep outside git):
   ```sh
   supabase db dump --linked -p "$DB_PASSWORD" --data-only --use-copy -f ~/Backups/axie-supabase/data-$(date +%F).sql
   ```
