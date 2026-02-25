#!/bin/bash
# =============================================================
# Heavenly Drops – Mail Server Setup & Management
# =============================================================
# Usage:
#   ./scripts/mail-setup.sh install   – full first-time install
#   ./scripts/mail-setup.sh start     – start mail server
#   ./scripts/mail-setup.sh stop      – stop mail server
#   ./scripts/mail-setup.sh status    – show health summary
#   ./scripts/mail-setup.sh ssl       – issue/renew SSL certs
#   ./scripts/mail-setup.sh adduser   – add a mail user
#   ./scripts/mail-setup.sh passwd    – change mail user password
#   ./scripts/mail-setup.sh logs      – tail recent logs
#   ./scripts/mail-setup.sh diagnose  – run full diagnostic check
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MAIL_DIR="$ROOT_DIR/email-server"
COMPOSE_FILE="$MAIL_DIR/docker-compose.mail.yml"
DOMAIN="workandstudyabroad.com.tr"
MAIL_DOMAIN="mail.$DOMAIN"
CERTS_DIR="$MAIL_DIR/data/certs"

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Helpers ──────────────────────────────────────────────────

require_root() {
  [[ $EUID -eq 0 ]] || error "This command must be run as root or with sudo."
}

docker_compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# ── Commands ─────────────────────────────────────────────────

cmd_install() {
  require_root
  info "Installing Heavenly Drops Mail Server…"

  # 1. Create required directories
  info "Creating data directories…"
  mkdir -p \
    "$MAIL_DIR/data/certs" \
    "$MAIL_DIR/data/mailboxes" \
    "$MAIL_DIR/data/postfix/queue" \
    "$MAIL_DIR/data/postfix/config" \
    "$MAIL_DIR/data/dovecot/users" \
    "$MAIL_DIR/data/opendkim/keys" \
    "$MAIL_DIR/data/certbot-webroot"

  # 2. Generate Dovecot users file (empty – users added with adduser cmd)
  touch "$MAIL_DIR/data/dovecot/users"
  chmod 600 "$MAIL_DIR/data/dovecot/users"

  # 3. Set up DKIM
  info "Generating DKIM keys for $DOMAIN…"
  if ! command -v opendkim-genkey &>/dev/null; then
    apt-get install -y opendkim-tools 2>/dev/null || true
  fi

  if command -v opendkim-genkey &>/dev/null; then
    opendkim-genkey -b 2048 -d "$DOMAIN" -D "$MAIL_DIR/data/opendkim/keys" -s mail -v 2>/dev/null || true
    chown -R 101:101 "$MAIL_DIR/data/opendkim/keys" 2>/dev/null || true
    info "DKIM private key generated. Add the following DNS TXT record:"
    cat "$MAIL_DIR/data/opendkim/keys/mail.txt" 2>/dev/null || true
  else
    warn "opendkim-tools not found – DKIM key generation skipped. Install manually."
  fi

  # 4. Pull Docker images
  info "Pulling Docker images…"
  docker_compose pull

  # 5. Issue SSL certificates
  info "Issuing Let's Encrypt certificates…"
  cmd_ssl || warn "SSL certificate issuance failed – start nginx first, then re-run: ./mail-setup.sh ssl"

  # 6. Start services
  info "Starting mail server containers…"
  docker_compose up -d

  # 7. Wait for health
  info "Waiting for services to become healthy…"
  sleep 10
  cmd_status

  # 8. Create default mail accounts
  info "Creating default mail accounts…"
  local default_pass
  default_pass=$(openssl rand -base64 16)
  echo "info:$default_pass" >> "$MAIL_DIR/data/dovecot/users.tmp"
  for addr in info support sales admin; do
    local pass
    pass=$(openssl rand -base64 16)
    echo "$addr@$DOMAIN:{SHA512-CRYPT}$(openssl passwd -6 "$pass")" >> "$MAIL_DIR/data/dovecot/users"
    echo "  $addr@$DOMAIN  →  $pass" >> "$MAIL_DIR/initial-passwords.txt"
  done
  info "Initial passwords saved to $MAIL_DIR/initial-passwords.txt"
  warn "CHANGE ALL PASSWORDS IMMEDIATELY via webmail Settings → Password."

  info "✅ Mail server installation complete!"
  info "Webmail:  https://webmail.$DOMAIN"
  info "SMTP:     $MAIL_DOMAIN:587 (STARTTLS)"
  info "IMAP:     $MAIL_DOMAIN:993 (SSL)"
}

cmd_ssl() {
  info "Requesting Let's Encrypt certificates for $MAIL_DOMAIN and webmail.$DOMAIN…"
  docker compose -f "$COMPOSE_FILE" run --rm certbot-mail || true

  info "Setting up auto-renewal cron job…"
  (crontab -l 2>/dev/null; echo "0 3 * * * docker compose -f $COMPOSE_FILE run --rm certbot-mail && docker_compose exec postfix postfix reload && docker_compose exec dovecot doveadm reload") | sort -u | crontab -
  info "Auto-renewal cron installed (runs daily at 03:00)."
}

cmd_start() {
  info "Starting mail server…"
  docker_compose up -d
  cmd_status
}

cmd_stop() {
  warn "Stopping mail server…"
  docker_compose down
}

cmd_status() {
  info "Mail Server Status:"
  docker_compose ps
  echo ""
  info "Port checks:"
  for port in 25 587 465 143 993; do
    if nc -z localhost "$port" 2>/dev/null; then
      echo -e "  Port $port: ${GREEN}OPEN${NC}"
    else
      echo -e "  Port $port: ${RED}CLOSED${NC}"
    fi
  done
  echo ""
  info "Container health:"
  for svc in postfix dovecot roundcube; do
    local health
    health=$(docker inspect "heavenlydrops-$svc" --format '{{.State.Health.Status}}' 2>/dev/null || echo "not running")
    local color=$GREEN
    [[ "$health" == "unhealthy" ]] && color=$RED
    [[ "$health" == "starting" ]] && color=$YELLOW
    echo -e "  $svc: ${color}${health}${NC}"
  done
}

cmd_adduser() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    read -rp "Enter email address (e.g. jane@$DOMAIN): " email
  fi

  [[ "$email" == *"@$DOMAIN" ]] || error "Email must end with @$DOMAIN"

  local password
  read -rsp "Enter password: " password; echo
  local hash
  hash=$(docker_compose exec -T dovecot doveadm pw -s SHA512-CRYPT -p "$password" 2>/dev/null || \
         openssl passwd -6 "$password")

  echo "${email%%@*}@$DOMAIN:$hash" >> "$MAIL_DIR/data/dovecot/users"

  # Add to virtual_mailbox
  echo "${email%%@*}@$DOMAIN  $DOMAIN/${email%%@*}/" >> "$MAIL_DIR/postfix/virtual_mailbox"
  docker_compose exec -T postfix postmap /etc/postfix/virtual_mailbox 2>/dev/null || true
  docker_compose exec -T postfix postfix reload 2>/dev/null || true

  info "User $email created successfully."
}

cmd_passwd() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    read -rp "Enter email address: " email
  fi
  local password
  read -rsp "New password: " password; echo
  local hash
  hash=$(openssl passwd -6 "$password")
  sed -i "s|^${email%%@*}@$DOMAIN:.*|${email%%@*}@$DOMAIN:$hash|" "$MAIL_DIR/data/dovecot/users"
  info "Password updated for $email."
}

cmd_logs() {
  docker_compose logs --tail=100 -f
}

cmd_diagnose() {
  info "Running mail server diagnostics…"
  echo ""

  # SMTP test
  info "Testing SMTP connection (port 587)…"
  if timeout 5 nc -z localhost 587; then
    echo -e "  SMTP 587: ${GREEN}OK${NC}"
  else
    echo -e "  SMTP 587: ${RED}FAILED${NC}"
  fi

  # IMAP test
  info "Testing IMAP connection (port 993)…"
  if timeout 5 nc -z localhost 993; then
    echo -e "  IMAP 993: ${GREEN}OK${NC}"
  else
    echo -e "  IMAP 993: ${RED}FAILED${NC}"
  fi

  # SSL cert check
  info "Checking SSL certificate expiry…"
  local expiry
  expiry=$(echo | timeout 5 openssl s_client -connect "$MAIL_DOMAIN:993" -servername "$MAIL_DOMAIN" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "unable to check")
  echo "  SSL expiry: $expiry"

  # Postfix queue
  info "Checking Postfix queue depth…"
  local queue_depth
  queue_depth=$(docker_compose exec -T postfix postqueue -p 2>/dev/null | grep -c '^[0-9A-Z]' || echo 0)
  echo "  Queue depth: $queue_depth messages"

  # Roundcube health
  info "Checking Roundcube webmail…"
  if curl -sf http://localhost:8080 -o /dev/null; then
    echo -e "  Roundcube: ${GREEN}OK${NC}"
  else
    echo -e "  Roundcube: ${RED}FAILED${NC}"
  fi

  echo ""
  info "Diagnostics complete."
}

# ── Main ──────────────────────────────────────────────────────

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  install)  cmd_install ;;
  start)    cmd_start ;;
  stop)     cmd_stop ;;
  status)   cmd_status ;;
  ssl)      cmd_ssl ;;
  adduser)  cmd_adduser "$@" ;;
  passwd)   cmd_passwd "$@" ;;
  logs)     cmd_logs ;;
  diagnose) cmd_diagnose ;;
  *)
    echo "Usage: $0 {install|start|stop|status|ssl|adduser|passwd|logs|diagnose}"
    exit 1
    ;;
esac
