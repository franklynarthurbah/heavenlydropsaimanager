#!/bin/bash
# =============================================================
# Heavenly Drops – Mail Server Before/After Diagnostic Test
# =============================================================
# Runs a full suite, captures snapshot, applies a command,
# re-runs tests, and prints a human-readable diff report.
#
# Usage:
#   ./scripts/mail-diagnostics.sh snapshot              – save current state
#   ./scripts/mail-diagnostics.sh report [snapshot.json] – compare with saved
#   ./scripts/mail-diagnostics.sh auto "docker compose restart postfix" – full cycle
# =============================================================

set -euo pipefail

REPORT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/diagnostics"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' BLUE='\033[0;34m' NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
head() { echo -e "\n${BLUE}══ $* ══${NC}"; }

# ── Single check functions ──────────────────────────────────

check_port() {
  local port=$1 name=$2
  if timeout 5 nc -z localhost "$port" 2>/dev/null; then
    echo "\"${name}\":\"ok\""
  else
    echo "\"${name}\":\"error\""
  fi
}

check_http() {
  local url=$1 name=$2
  local code
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" --max-time 8 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "\"${name}\":\"ok\""
  else
    echo "\"${name}\":\"error:$code\""
  fi
}

check_ssl_days() {
  local host=$1 port=${2:-443}
  local expiry days
  expiry=$(echo | timeout 5 openssl s_client -connect "$host:$port" -servername "$host" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$expiry" ]]; then
    days=$(( ( $(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
    echo "\"ssl_days\":$days"
  else
    echo "\"ssl_days\":null"
  fi
}

check_postfix_queue() {
  local depth
  depth=$(docker compose -f "$(dirname "$0")/../email-server/docker-compose.mail.yml" \
    exec -T postfix postqueue -p 2>/dev/null | grep -c '^[0-9A-Z]' 2>/dev/null || echo 0)
  echo "\"postfix_queue\":$depth"
}

# ── Take a full snapshot ─────────────────────────────────────

take_snapshot() {
  local out_file="${1:-$REPORT_DIR/snapshot_$TIMESTAMP.json}"
  echo "{"
  check_port 25 "smtp_25"
  echo ","
  check_port 587 "smtp_587"
  echo ","
  check_port 993 "imap_993"
  echo ","
  check_port 143 "imap_143"
  echo ","
  check_http "http://localhost:8080" "roundcube"
  echo ","
  check_ssl_days "mail.workandstudyabroad.com.tr" "993"
  echo ","
  check_postfix_queue
  echo ","
  echo "\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
  echo "}" | tee "$out_file"
  echo -e "\n${GREEN}Snapshot saved to $out_file${NC}" >&2
}

# ── Compare two snapshots ─────────────────────────────────────

compare_snapshots() {
  local before_file=$1 after_file=$2

  head "BEFORE / AFTER DIAGNOSTIC REPORT"
  echo "Before: $before_file"
  echo "After:  $after_file"
  echo ""
  echo "Generated: $(date)"
  echo ""

  # Parse with python (available on most servers) or jq
  if command -v python3 &>/dev/null; then
    python3 - "$before_file" "$after_file" << 'PYEOF'
import json, sys

with open(sys.argv[1]) as f: before = json.load(f)
with open(sys.argv[2]) as f: after  = json.load(f)

keys = [k for k in set(list(before.keys()) + list(after.keys())) if k != 'timestamp']
keys.sort()

GREEN  = '\033[0;32m'
YELLOW = '\033[1;33m'
RED    = '\033[0;31m'
BLUE   = '\033[0;34m'
NC     = '\033[0m'

changes = 0
for k in keys:
    b = before.get(k, 'N/A')
    a = after.get(k, 'N/A')
    if b == a:
        status = f'{GREEN}UNCHANGED{NC}'
        indicator = '='
    elif 'error' in str(b) and 'ok' == str(a):
        status = f'{GREEN}FIXED ✓{NC}'
        indicator = '↑'
        changes += 1
    elif 'ok' == str(b) and 'error' in str(a):
        status = f'{RED}DEGRADED ✗{NC}'
        indicator = '↓'
        changes += 1
    else:
        status = f'{YELLOW}CHANGED{NC}'
        indicator = '~'
        changes += 1
    print(f'  [{indicator}] {k:<20} {str(b):<20} → {str(a):<20}  {status}')

print()
if changes == 0:
    print(f'{GREEN}No changes detected. System is stable.{NC}')
else:
    print(f'{YELLOW}{changes} change(s) detected.{NC}')
PYEOF
  else
    warn "python3 not found. Printing raw snapshots:"
    echo "BEFORE:"; cat "$before_file"; echo ""
    echo "AFTER:";  cat "$after_file";  echo ""
  fi
}

# ── Auto mode: snapshot → run command → snapshot → compare ────

auto_cycle() {
  local cmd="${*:-echo 'no command'}"
  local before="$REPORT_DIR/before_$TIMESTAMP.json"
  local after="$REPORT_DIR/after_$TIMESTAMP.json"

  head "RUNNING BEFORE SNAPSHOT"
  take_snapshot "$before" > /dev/null

  head "APPLYING COMMAND: $cmd"
  eval "$cmd"
  sleep 5

  head "RUNNING AFTER SNAPSHOT"
  take_snapshot "$after" > /dev/null

  compare_snapshots "$before" "$after"
}

# ── Main ──────────────────────────────────────────────────────

CMD="${1:-snapshot}"
shift 2>/dev/null || true

case "$CMD" in
  snapshot)  take_snapshot "$@" ;;
  report)    compare_snapshots "${1:?Usage: report <before.json> <after.json>}" "${2:?}" ;;
  auto)      auto_cycle "$@" ;;
  *)
    echo "Usage: $0 {snapshot|report <before> <after>|auto <command>}"
    exit 1
    ;;
esac
