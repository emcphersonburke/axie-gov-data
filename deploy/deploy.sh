#!/usr/bin/env bash
# Build locally, ship artifacts, flip the release symlink atomically, restart the indexer.
#
#   DEPLOY_HOST=axie@<ip-or-host> DOMAIN=treasury.example.com deploy/deploy.sh [deploy|rollback|health]
#   (DOMAIN may be http://<ip> while bootstrapping without a domain)
#
# Releases live in /opt/axie/releases/<utc>-<sha>; /opt/axie/current points at the active one and
# /srv/axie/web -> /opt/axie/current/web/dist, so the web app and indexer flip together.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
HOST="${DEPLOY_HOST:?set DEPLOY_HOST (e.g. axie@1.2.3.4)}"
DOMAIN="${DOMAIN:?set DOMAIN}"
APP=/opt/axie
KEEP=5

flip() { # remote: atomically point $APP/current at $1 and restart the indexer
  ssh "$HOST" bash -s -- "$1" <<'REMOTE'
set -euo pipefail; REL="$1"; APP=/opt/axie
ln -sfn "$REL" "$APP/current.new" && mv -Tf "$APP/current.new" "$APP/current"
sudo systemctl restart axie-indexer.service
sleep 3
if ! systemctl is-active --quiet axie-indexer.service; then
  journalctl -u axie-indexer -n 40 --no-pager; echo "indexer failed to start" >&2; exit 1
fi
REMOTE
}

health() {
  local base="$DOMAIN"; [[ $base == *://* ]] || base="https://$base"
  ssh "$HOST" 'systemctl is-active axie-indexer.service; journalctl -u axie-indexer -n 5 --no-pager -o cat'
  curl -fsS "${base}/data/health.json" | jq . || echo "health.json not served yet (first batch still in flight?)"
  if curl -fsS "${base}/" | grep -q '<title>Axie Community Treasury</title>'; then echo "web  OK (SPA served)"; else echo "web  WRONG: / is not the SPA (check /etc/caddy/Caddyfile and /srv/axie/web)"; return 1; fi
}

case "${1:-deploy}" in
deploy)
  [[ -z "$(git status --porcelain)" ]] || { echo "working tree dirty; commit first" >&2; exit 1; }
  SHA=$(git rev-parse --short HEAD)
  REL="$APP/releases/$(date -u +%Y%m%dT%H%M%SZ)-$SHA"
  npm ci --no-audit --no-fund
  npm run lint && npm run typecheck && npm test && npm run build
  ssh "$HOST" "mkdir -p '$REL'"
  rsync -az --relative --delete \
    package.json package-lock.json \
    shared/package.json shared/dist \
    indexer/package.json indexer/dist \
    web/package.json web/dist \
    deploy \
    "$HOST:$REL/"
  ssh "$HOST" bash -s -- "$REL" <<'REMOTE'
set -euo pipefail; REL="$1"; cd "$REL"
npm ci --omit=dev --no-audit --no-fund -w shared -w indexer   # linux-x64 better-sqlite3 prebuild
node -e "require('better-sqlite3')" && echo "better-sqlite3 OK"
REMOTE
  flip "$REL"
  ssh "$HOST" "ls -1dt $APP/releases/*/ | tail -n +$((KEEP+1)) | xargs -r rm -rf"
  health
  ;;
rollback)
  PREV=$(ssh "$HOST" "ls -1dt $APP/releases/*/ | sed -n 2p | sed 's#/\$##'")
  [[ -n "$PREV" ]] || { echo "no previous release" >&2; exit 1; }
  echo "rolling back to $PREV"
  flip "$PREV"
  health
  ;;
health) health ;;
*) echo "usage: $0 [deploy|rollback|health]" >&2; exit 2 ;;
esac
