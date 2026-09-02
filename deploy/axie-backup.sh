#!/usr/bin/env bash
# Nightly online backup of the indexer SQLite database (runs as user axie via axie-backup.timer).
set -euo pipefail
ENV_FILE=/etc/axie-indexer.env
DB=$(sed -n 's/^DB_PATH=//p' "$ENV_FILE" | tail -1); DB=${DB:-/var/lib/axie-indexer/indexer.db}
OUT=/var/lib/axie-indexer/backups
KEEP=3
mkdir -p "$OUT"
f="$OUT/indexer-$(date -u +%F).db"
sqlite3 "$DB" ".backup '$f'"          # online backup API: safe while the indexer is writing
zstd -q --rm -T0 -3 "$f"
ls -1t "$OUT"/*.zst | tail -n +$((KEEP+1)) | xargs -r rm -f
echo "backup written: $f.zst ($(du -h "$f.zst" | cut -f1))"
if [[ -r /etc/axie-backup.url ]]; then curl -fsS -m 10 --retry 2 "$(</etc/axie-backup.url)" >/dev/null || true; fi
