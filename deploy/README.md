# deploy/

Everything needed to run the dashboard on one Ubuntu 24.04 box (Hetzner CX23 in an EU location,
about €6/mo after the June-2026 price rise, IPv4 included). No control plane: these files are the whole ops surface.

| File | Purpose |
|---|---|
| `provision.sh` | One-time, idempotent box setup as root: Node 22, Caddy, user `axie`, directories, units, firewall, sshd hardening, unattended upgrades, journald cap, swap. |
| `deploy.sh` | From your laptop: lint/typecheck/test/build, rsync a release to `/opt/axie/releases/<utc>-<sha>`, `npm ci --omit=dev` there (native `better-sqlite3` prebuild), atomic `current` symlink flip, indexer restart, health check. `rollback` flips back; `health` just checks. |
| `Caddyfile` | Serves `/data/*` (snapshots, 60 s cache) and the SPA (immutable `/assets/*`), security headers, Cloudflare Origin CA cert. |
| `axie-indexer.service` | The indexer as a hardened systemd service (`tail` = catch-up then follow). |
| `axie-healthcheck.{sh,service,timer}` | Every 5 min: pings healthchecks.io only if the unit is active, the snapshot is < 10 min old, lag ≤ 400 blocks (unless backfilling), disk < 85 %, and the public URL answers. |
| `axie-backup.{sh,service,timer}` | 03:30 UTC: `sqlite3 .backup` + zstd, keep 3. |
| `vercel-redirect/` | Two-file Vercel project that reclaims `axie-gov.vercel.app` and forwards it to the live site, so the Axie blog post's link to the hackathon entry keeps working. Deploy it once, separately from this repo. |
| `axie-env` | Runs a command with an env file loaded literally (`axie-env /etc/axie-indexer.env node …`); never `source` these files, `RPC_URLS` contains `\|` and `;`. |
| `sudoers.d-axie` | Lets `axie` restart the indexer / reload Caddy for deploys. |
| `axie-indexer.env.example` | Template for `/etc/axie-indexer.env` (root:axie 0640). The Sky Mavis key is the only secret. |

## First deploy

```sh
# 1. box: Ubuntu 24.04, your SSH key, Hetzner Backups enabled
rsync -a deploy/ root@<ip>:/root/axie-deploy/
ssh root@<ip> 'AXIE_DOMAIN=<domain> AXIE_ADMIN_PUBKEY="<your pubkey>" bash /root/axie-deploy/provision.sh'
# 2. secrets + cert + alert URLs (see the notes provision.sh prints)
# 3. from the repo root, on a clean tree:
DEPLOY_HOST=axie@<ip> DOMAIN=<domain> deploy/deploy.sh
```

Operations day to day are in [`docs/runbook.md`](../docs/runbook.md).
