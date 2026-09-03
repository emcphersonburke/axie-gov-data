#!/usr/bin/env bash
# One-time (idempotent) provisioning of a fresh Ubuntu 24.04 box for the Axie treasury dashboard.
#
# Usage, from your laptop:
#   rsync -a deploy/ root@<ip>:/root/axie-deploy/
#   ssh root@<ip> 'AXIE_DOMAIN=treasury.example.com AXIE_ADMIN_PUBKEY="ssh-ed25519 AAAA... you@laptop" bash /root/axie-deploy/provision.sh'
# No domain yet? Pass AXIE_DOMAIN=http://<ip> to serve plain HTTP on the IP; re-run with the real
# domain later (the script is idempotent) to switch to TLS.
#
# Afterwards (manual, once):
#   1. Put the Sky Mavis key in /etc/axie-indexer.env
#   2. Install the Cloudflare Origin CA cert at /etc/caddy/certs/origin.{pem,key} (root:caddy 0640), then: systemctl reload caddy
#      (or delete the `tls` line in /etc/caddy/Caddyfile to let Caddy use Let's Encrypt directly)
#   3. Put healthchecks.io ping URLs in /etc/axie-healthcheck.url and /etc/axie-backup.url (0600 root / 0640 root:axie)
#   4. Run deploy/deploy.sh from your laptop
set -euo pipefail
: "${AXIE_DOMAIN:?set AXIE_DOMAIN}"
: "${AXIE_ADMIN_PUBKEY:?set AXIE_ADMIN_PUBKEY}"
HERE=$(cd "$(dirname "$0")" && pwd)
export DEBIAN_FRONTEND=noninteractive

log() { printf '\n==> %s\n' "$*"; }

log "base packages"
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg ufw unattended-upgrades sqlite3 zstd jq rsync git \
  build-essential python3 debian-keyring debian-archive-keyring apt-transport-https
timedatectl set-timezone UTC

log "Node 22 (NodeSource)"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node -v

log "Caddy (official repo)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

log "user + directories"
id axie >/dev/null 2>&1 || adduser --disabled-password --gecos '' axie
install -d -m 0700 -o axie -g axie /home/axie/.ssh
touch /home/axie/.ssh/authorized_keys
grep -qF "$AXIE_ADMIN_PUBKEY" /home/axie/.ssh/authorized_keys || echo "$AXIE_ADMIN_PUBKEY" >> /home/axie/.ssh/authorized_keys
chown axie:axie /home/axie/.ssh/authorized_keys && chmod 0600 /home/axie/.ssh/authorized_keys
usermod -aG systemd-journal axie                          # read journal without sudo
install -d -m 0755 -o axie -g axie /opt/axie /opt/axie/releases
install -d -m 0750 -o axie -g axie /var/lib/axie-indexer /var/lib/axie-indexer/backups
install -d -m 0755 -o root -g root /srv/axie
install -d -m 0755 -o axie -g axie /srv/axie/data           # indexer writes 0644 files (UMask=0022); caddy reads
[[ -L /srv/axie/web ]] || ln -sfn /opt/axie/current/web/dist /srv/axie/web

log "secrets file (template only)"
if [[ ! -f /etc/axie-indexer.env ]]; then
  install -m 0640 -o root -g axie "$HERE/axie-indexer.env.example" /etc/axie-indexer.env
  echo ">>> EDIT /etc/axie-indexer.env and set RONIN_API_KEY before starting the indexer"
fi

log "sudoers for deploys"
install -m 0440 "$HERE/sudoers.d-axie" /etc/sudoers.d/axie && visudo -cf /etc/sudoers.d/axie

log "systemd units + timers"
install -m 0644 "$HERE"/axie-*.service "$HERE"/axie-*.timer /etc/systemd/system/
install -m 0755 "$HERE/axie-healthcheck.sh" "$HERE/axie-backup.sh" /usr/local/bin/
systemctl daemon-reload
systemctl enable axie-indexer.service axie-healthcheck.timer axie-backup.timer
systemctl start axie-healthcheck.timer axie-backup.timer   # the indexer itself starts on first deploy

log "Caddy config"
install -d -m 0750 -o root -g caddy /etc/caddy/certs
install -d -m 0755 -o root -g root /etc/caddy/sites      # site blocks of other apps on this box (imported by the Caddyfile)
sed "s#treasury.example.com#${AXIE_DOMAIN}#g" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
if [[ "$AXIE_DOMAIN" == http://* ]]; then
  # Bootstrap mode (no domain yet): serve plain HTTP on the IP, no certificate. Re-run with the real
  # domain later and Caddy switches to TLS.
  sed -i '/^[[:space:]]*tls \/etc\/caddy\/certs/d; /Strict-Transport-Security/d' /etc/caddy/Caddyfile
  echo ">>> bootstrap mode: Caddy serves plain HTTP at ${AXIE_DOMAIN}"
fi
if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  systemctl enable caddy >/dev/null
  systemctl restart caddy          # restart, not reload: applies even on the first run after install
  curl -fsS -o /dev/null -w "caddy answering: HTTP %{http_code}\n" http://127.0.0.1/ || echo ">>> caddy is not answering on :80"
else
  echo ">>> Caddyfile did not validate yet (origin cert missing?). Install /etc/caddy/certs/origin.{pem,key} then: systemctl enable --now caddy"
fi

log "firewall + sshd + auto-updates"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
cat > /etc/ssh/sshd_config.d/50-axie.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
systemctl reload ssh || systemctl reload sshd || true
cat > /etc/apt/apt.conf.d/52axie-unattended.conf <<'APT'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
APT
dpkg-reconfigure -f noninteractive unattended-upgrades

log "journald cap + swap"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=persistent\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/axie.conf
systemctl restart systemd-journald
if [[ ! -f /swapfile ]] && (( $(awk '/MemTotal/{print $2}' /proc/meminfo) < 3900000 )); then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "done"
echo "Next: set RONIN_API_KEY in /etc/axie-indexer.env, install the origin cert, add healthcheck URLs, then run deploy/deploy.sh"
