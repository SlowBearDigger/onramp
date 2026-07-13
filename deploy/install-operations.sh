#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root' >&2
  exit 1
fi

DEPLOY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
install -d -m 0755 /usr/local/libexec/onoff /var/www/onoff/releases /srv/onoff-app/releases
install -d -m 0750 -o root -g onramp /etc/onoff
install -d -m 0700 /var/backups/onoff
install -m 0755 "$DEPLOY_DIR/deploy-release.sh" /usr/local/libexec/onoff/deploy-release
install -m 0755 "$DEPLOY_DIR/rollback-release.sh" /usr/local/libexec/onoff/rollback-release
install -m 0755 "$DEPLOY_DIR/deploy-backend.sh" /usr/local/libexec/onoff/deploy-backend
install -m 0755 "$DEPLOY_DIR/rollback-backend.sh" /usr/local/libexec/onoff/rollback-backend
install -m 0755 "$DEPLOY_DIR/backup.sh" /usr/local/libexec/onoff/backup
install -m 0755 "$DEPLOY_DIR/healthcheck.sh" /usr/local/libexec/onoff/healthcheck
install -m 0644 "$DEPLOY_DIR/onoff-backup.service" /etc/systemd/system/onoff-backup.service
install -m 0644 "$DEPLOY_DIR/onoff-backup.timer" /etc/systemd/system/onoff-backup.timer
install -m 0644 "$DEPLOY_DIR/onoff-healthcheck.service" /etc/systemd/system/onoff-healthcheck.service
install -m 0644 "$DEPLOY_DIR/onoff-healthcheck.timer" /etc/systemd/system/onoff-healthcheck.timer
install -m 0644 "$DEPLOY_DIR/onramp-backend.service" /etc/systemd/system/onramp-backend.service

systemctl daemon-reload
systemctl enable onramp-backend.service
systemctl enable --now onoff-backup.timer onoff-healthcheck.timer
systemctl start onoff-backup.service
systemctl start onoff-healthcheck.service
echo 'OnOff operations installed'
