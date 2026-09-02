#!/usr/bin/env bash
# Dead-man switch: pings healthchecks.io ONLY when the indexer is healthy, so a stalled indexer,
# a stale snapshot, a full disk, or a dead box all end in an alert. Runs every 5 min as root.
set -euo pipefail
ENV_FILE=/etc/axie-indexer.env
SNAP_DIR=$(sed -n 's/^SNAPSHOT_DIR=//p' "$ENV_FILE" | tail -1); SNAP_DIR=${SNAP_DIR:-/srv/axie/data}
HEALTH="$SNAP_DIR/health.json"
URL_FILE=/etc/axie-healthcheck.url
DOMAIN=$(sed -n 's/^AXIE_DOMAIN=//p' /etc/axie-healthcheck.conf 2>/dev/null || true)
MAX_LAG_BLOCKS=400   # ~20 min of 3 s blocks
MAX_AGE_SEC=600

URL=""; [[ -r $URL_FILE ]] && URL=$(<"$URL_FILE")
fail() {
  echo "healthcheck FAIL: $1" >&2
  [[ -n $URL ]] && curl -fsS -m 10 --retry 2 "$URL/fail" --data-raw "$1" >/dev/null || true
  exit 1
}

systemctl is-active --quiet axie-indexer.service || fail "axie-indexer inactive"
[[ -s $HEALTH ]] || fail "health.json missing"
status=$(jq -r .status "$HEALTH"); lag=$(jq -r .lagBlocks "$HEALTH"); gen=$(jq -r .generatedAt "$HEALTH")
age=$(( $(date +%s) - $(date -d "$gen" +%s) ))
(( age <= MAX_AGE_SEC )) || fail "snapshot stale ${age}s"
[[ $status == backfilling ]] || (( lag <= MAX_LAG_BLOCKS )) || fail "lag ${lag} blocks"
pct=$(df --output=pcent /var/lib/axie-indexer | tail -1 | tr -dc 0-9); (( pct < 85 )) || fail "disk ${pct}% full"
if [[ -n $DOMAIN ]]; then
  curl -fsS -m 10 -o /dev/null "https://${DOMAIN}/data/health.json" || fail "public fetch of health.json failed"
fi
[[ -n $URL ]] && curl -fsS -m 10 --retry 2 "$URL" >/dev/null || true
echo "ok: status=$status lag=$lag age=${age}s disk=${pct}%"
