#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
    printf '%s\n' 'Usage: sudo bash scripts/configure_https.sh --agree-tos --email ADDRESS [--password-stdin]' \
        'Installs Nginx/Certbot, enables protected arcane-path.eu HTTPS and automatic certificate renewal.' \
        'First run requires a preview password on stdin; never pass a password as a command argument.'
}

email=""
agree=false
password_stdin=false
while [ "$#" -gt 0 ]; do
    case "$1" in
        --agree-tos) agree=true; shift ;;
        --password-stdin) password_stdin=true; shift ;;
        --email)
            if [ "$#" -lt 2 ]; then usage >&2; exit 2; fi
            email="$2"; shift 2 ;;
        --help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done
if [ "$(id -u)" -ne 0 ] || [ "$agree" != true ] || [[ ! "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    usage >&2
    exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "$root/infra/nginx/preview.conf" ] || [ ! -f "$root/infra/nginx/bootstrap.conf" ]; then
    printf '%s\n' 'Missing tracked Nginx configuration beside script.' >&2
    exit 1
fi
if [ "$password_stdin" != true ] && [ ! -s /etc/nginx/arcane-preview.htpasswd ]; then
    printf '%s\n' 'First setup requires --password-stdin.' >&2
    exit 2
fi
password=""
if [ "$password_stdin" = true ]; then
    IFS= read -r password
    password_bytes="$(printf '%s' "$password" | LC_ALL=C wc -c)"
    if [ "$password_bytes" -lt 20 ] || [ "$password_bytes" -gt 72 ]; then
        printf '%s\n' 'Preview password must contain 20 to 72 bytes (bcrypt limit).' >&2
        exit 2
    fi
fi
if ! curl --fail --silent --show-error http://127.0.0.1:8766/api/travel >/dev/null; then
    printf '%s\n' 'The loopback game service must be healthy before publishing the preview.' >&2
    exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx certbot apache2-utils
install -d -m 0755 /var/www/arcane-acme/.well-known/acme-challenge
if [ "$password_stdin" = true ]; then
    printf '%s\n' "$password" | htpasswd -iBc /etc/nginx/arcane-preview.htpasswd preview
    unset password
fi
chown root:www-data /etc/nginx/arcane-preview.htpasswd
chmod 0640 /etc/nginx/arcane-preview.htpasswd

if [ -e /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi
if [ ! -f /etc/letsencrypt/live/arcane-path.eu/fullchain.pem ]; then
    install -m 0644 "$root/infra/nginx/bootstrap.conf" /etc/nginx/sites-available/arcane-path
else
    install -m 0644 "$root/infra/nginx/preview.conf" /etc/nginx/sites-available/arcane-path
fi
ln -sfn /etc/nginx/sites-available/arcane-path /etc/nginx/sites-enabled/arcane-path
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# This is a post-provisioning change: do not alter live Terraform cloud-init.
python3 - <<'PY'
from pathlib import Path
import subprocess
path = Path("/etc/nftables.conf")
original = path.read_text()
rule = "          tcp dport { 80, 443 } ct state new accept\n"
if "tcp dport { 80, 443 } ct state new accept" not in original:
    anchor = "ct state invalid drop\n"
    if original.count(anchor) != 1:
        raise SystemExit("Unexpected firewall configuration; refusing to replace SSH rules.")
    updated = original.replace(anchor, anchor + rule)
    candidate = path.with_name("nftables.arcane-candidate.conf")
    candidate.write_text(updated)
    candidate.chmod(0o600)
    try:
        subprocess.run(["nft", "--check", "--file", str(candidate)], check=True)
        backup = path.with_name("nftables.before-https.conf")
        if not backup.exists():
            backup.write_text(original)
            backup.chmod(0o600)
        candidate.replace(path)
        subprocess.run(["nft", "--file", str(path)], check=True)
    finally:
        candidate.unlink(missing_ok=True)
PY
certbot certonly --non-interactive --agree-tos --email "$email" \
    --webroot --webroot-path /var/www/arcane-acme \
    --cert-name arcane-path.eu --domain arcane-path.eu --keep-until-expiring
install -m 0644 "$root/infra/nginx/preview.conf" /etc/nginx/sites-available/arcane-path
nginx -t
systemctl reload nginx

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 "$root/scripts/renew_https_hook.sh" \
    /etc/letsencrypt/renewal-hooks/deploy/arcane-nginx
systemctl enable --now certbot.timer
printf '%s\n' 'Protected HTTPS configured: https://arcane-path.eu (user: preview).' \
    'Certificate renewal: certbot.timer; inspect with systemctl list-timers certbot.timer.' \
    'Validate renewal: sudo certbot renew --dry-run --run-deploy-hooks.'
