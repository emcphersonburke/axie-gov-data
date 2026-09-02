# Runbook

Everything runs on one Ubuntu box as user `axie`. SSH in as `axie@<host>`.

## Where things are

| What | Where |
|---|---|
| Active release | `/opt/axie/current` → `/opt/axie/releases/<utc>-<sha>` (last 5 kept) |
| Indexer binary | `/opt/axie/current/indexer/dist/cli.js` |
| Web build | `/opt/axie/current/web/dist` (served via `/srv/axie/web` symlink) |
| SQLite DB | `/var/lib/axie-indexer/indexer.db` (+ `-wal`, `-shm`) |
| Backups | `/var/lib/axie-indexer/backups/indexer-<date>.db.zst` (3 kept) |
| Snapshots | `/srv/axie/data/dashboard.json`, `health.json` |
| Secrets | `/etc/axie-indexer.env` (root:axie 0640) |
| Caddy | `/etc/caddy/Caddyfile`, certs in `/etc/caddy/certs/` |
| Logs | `journalctl -u axie-indexer -f` (pino JSON; `-o cat | jq` to pretty-print) |

## Daily

```sh
systemctl status axie-indexer            # active? since when?
curl -s https://<domain>/data/health.json | jq
journalctl -u axie-indexer -n 50 -o cat | jq -r '[.time,.level,.msg] | @tsv'
```

`health.json`: `ok` is false when lag > 400 blocks (~20 min). While the first backfill runs the
status is `backfilling` and the web app shows a banner; the healthcheck ignores lag then but still
alerts on a stale snapshot (> 10 min without a write means the process is stuck).

## Deploy / rollback

From a clean checkout on your laptop:

```sh
DEPLOY_HOST=axie@<host> DOMAIN=<domain> deploy/deploy.sh            # build, ship, flip, restart, health
DEPLOY_HOST=axie@<host> DOMAIN=<domain> deploy/deploy.sh rollback   # flip to the previous release
DEPLOY_HOST=axie@<host> DOMAIN=<domain> deploy/deploy.sh health
```

Schema migrations are additive (`PRAGMA user_version`), so an older release runs against a newer
database. If a release changes the schema incompatibly, restore the last backup before rolling back.

## Restart / stop

```sh
sudo systemctl restart axie-indexer     # finishes the in-flight batch, then restarts
sudo systemctl stop axie-indexer
```

## Indexer commands

Run with the production env: `set -a; . /etc/axie-indexer.env; set +a; cd /opt/axie/current`.

| Command | Use |
|---|---|
| `node indexer/dist/cli.js verify` | Invariants: rollups == transactions, totals match, every tx block has a timestamp. |
| `… verify --checkpoint` | Cumulative inflow before 2025-02-04 vs the legacy 22,801,117.13 AXS / 58,668.91 WETH. |
| `… verify --spot 20` | Re-run discovery on 20 random windows and diff against the DB (finds silently missed ranges). |
| `… verify --tx 0x…` | Decode + classify one transaction live and print it. The day-to-day debugging tool. |
| `… snapshot` | Rebuild `dashboard.json` once. |
| `… rebuild-rollups` | Recompute hourly rollups and exact totals from raw rows (after a classifier change or rewind). |
| `… rewind --to <block>` | Delete everything from `<block>` on and reset cursors. Deep-reorg remedy; follow with `rebuild-rollups`. |
| `… backfill --leg treasury --from A --to B` | Bounded run into a scratch DB (`DB_PATH=/tmp/x.db`) for testing. |

## Backup / restore

Backups run nightly (03:30 UTC) via `axie-backup.timer`; `systemctl list-timers` shows the next run.

Restore:

```sh
sudo systemctl stop axie-indexer
zstd -d -o /var/lib/axie-indexer/indexer.db /var/lib/axie-indexer/backups/indexer-<date>.db.zst
rm -f /var/lib/axie-indexer/indexer.db-wal /var/lib/axie-indexer/indexer.db-shm
sudo systemctl start axie-indexer        # resumes from the restored cursor and re-tails the gap
```

Hetzner "Backups" (console toggle) image the whole box nightly as well — that covers the env file
and certs. The chain is the ultimate backup: a full re-index is always possible.

## Full re-index (fresh database, no downtime)

```sh
set -a; . /etc/axie-indexer.env; set +a
sudo -u axie DB_PATH=/var/lib/axie-indexer/reindex.db SNAPSHOT_DIR=/tmp/axie-snap \
  systemd-run --unit=axie-reindex --uid=axie --gid=axie -p WorkingDirectory=/opt/axie/current \
  /usr/bin/node indexer/dist/cli.js backfill
journalctl -u axie-reindex -f
# when it exits 0: stop the service, swap the DB files, start the service
```

## Rotate the Sky Mavis key

Edit `/etc/axie-indexer.env`, then `sudo systemctl restart axie-indexer`. Check the journal for
`401`/`403` in the first minute.

## Disk

~8 GB for the database at ~11M transactions, growing ~1–1.5 GB/year. The healthcheck alarms at
85 %. Free space: prune `/var/lib/axie-indexer/backups`, drop `/opt/axie/releases` beyond the
current, or `sqlite3 indexer.db 'PRAGMA wal_checkpoint(TRUNCATE)'`.

## TLS / DNS

Cloudflare proxies the domain (SSL mode Full (strict)); Caddy presents a Cloudflare Origin CA cert
from `/etc/caddy/certs/`. To drop Cloudflare: remove the `tls` line in the Caddyfile, `systemctl
reload caddy`, and Caddy issues a Let's Encrypt cert on its own. Origin CA certs last 15 years.

## Alerts

healthchecks.io: check `axie-indexer` (period 5 min, grace 10 min) and `axie-backup` (period 1 day,
grace 6 h). The box pings only on success, so silence means trouble — including a dead box.
Ping URLs live in `/etc/axie-healthcheck.url` and `/etc/axie-backup.url`.
