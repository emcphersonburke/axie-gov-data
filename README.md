# Axie Community Treasury Dashboard

Live view of the [Axie Infinity](https://axieinfinity.com) Community Treasury on Ronin: cumulative
AXS and WETH inflow, breakdowns by transaction type and NFT type, bridge-backed WETH, and USD
prices — indexed from chain, served as a static site.

```
Sky Mavis RPC ──▶ indexer (Node 22 + viem, systemd, SQLite) ──▶ dashboard.json + health.json
Sky Mavis GraphQL (prices) ─┘                                       │
                                            Caddy ◀── serves ───────┘ + web/dist (static Vite SPA)
                                              ▲
                                  Cloudflare (proxy) ◀── browsers
```

The chain is the source of truth. The indexer keeps a re-indexable SQLite database and precomputes
one small JSON snapshot; the web app fetches that file and nothing else. One ~€5/month VPS runs it
all. Details: [`docs/architecture.md`](docs/architecture.md), [`docs/data-model.md`](docs/data-model.md).

## Repository layout

| Path | What |
|---|---|
| `shared/` | `@axie-gov/shared`: contract addresses and descriptors, viem ABIs, event selectors, UTC bucketing helpers, the `dashboard.json` zod schema. |
| `indexer/` | `@axie-gov/indexer`: the Ronin indexer CLI (`tail`, `backfill`, `snapshot`, `verify`, `rebuild-rollups`, `rewind`, `fixture`). |
| `web/` | `@axie-gov/web`: the Vite + React dashboard (Nivo charts, SCSS modules, lazy PixiJS Axie terrarium). |
| `deploy/` | Caddyfile, systemd unit and timers, provision/deploy/backup/healthcheck scripts. |
| `docs/` | Architecture, data model, runbook, cutover checklist, and the captured legacy Supabase figures. |

## Local development

Requires Node 22 (`.nvmrc`).

```sh
npm install
npm run build -w shared          # web and indexer import the built package

# web: serves web/fixtures/dashboard.json at /data/dashboard.json
npm run dev -w web
# …or against the production snapshot (proxies /data, no CORS fuss)
DEV_DATA_PROXY=https://<domain> npm run dev -w web

# indexer: copy indexer/.env.example to indexer/.env, set RONIN_API_KEY, then
npm run dev -w indexer                                             # tail from the configured start block
npx tsx indexer/src/cli.ts verify --tx 0x<hash>                    # decode + classify one transaction
DB_PATH=/tmp/x.db SNAPSHOT_DIR=/tmp/snap npx tsx indexer/src/cli.ts backfill --leg treasury --from 42206600 --to 42206700
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (CI runs the same).
Live-RPC integration tests: `npm run test:integration -w indexer`.

## Configuration

Contract addresses, start blocks, and the chain id are constants in `shared/src/contracts.ts` —
they are public facts, and env-var addresses were a source of case-sensitivity bugs in the old sync.
The only secret is the Sky Mavis API key. Indexer env vars are documented in
[`indexer/.env.example`](indexer/.env.example); the web app has none at runtime.

## Deploy and operate

First-time setup and day-to-day operations are in [`deploy/README.md`](deploy/README.md) and
[`docs/runbook.md`](docs/runbook.md). The migration from the previous Vercel + Supabase setup is
tracked in [`docs/cutover.md`](docs/cutover.md).

## License

[MIT](LICENSE).
