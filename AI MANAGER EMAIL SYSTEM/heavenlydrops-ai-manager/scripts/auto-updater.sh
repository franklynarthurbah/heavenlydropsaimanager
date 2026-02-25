#!/bin/bash
# =============================================================
# Heavenly Drops – Auto-Updater Script
# =============================================================
# Checks for and installs updates for:
#   - Roundcube (Docker image)
#   - WhatsApp API npm package
#   - Instagram API npm package
#   - NestJS backend packages
#
# Lifecycle:
#   1. Check for updates
#   2. Enter maintenance mode (show loading screen)
#   3. Pause queues / background workers
#   4. Apply updates
#   5. Restart affected services
#   6. Run diagnostics (before/after)
#   7. Auto-repair if needed
#   8. Resume all services
# =============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIL_DIR="$ROOT_DIR/email-server"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_FILE="$ROOT_DIR/data/update-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$ROOT_DIR/data"

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' BLUE='\033[0;34m' NC='\033[0m'
info()  { echo -e "${GREEN}[$(date +%H:%M:%S)] INFO${NC}  $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN${NC}  $*" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date +%H:%M:%S)] ERROR${NC} $*" | tee -a "$LOG_FILE"; }
head()  { echo -e "\n${BLUE}══════ $* ══════${NC}" | tee -a "$LOG_FILE"; }

MAINTENANCE_MODE=false
UPDATE_RESULTS=()

# ── Maintenance mode ─────────────────────────────────────────

enter_maintenance() {
  MAINTENANCE_MODE=true
  info "⏸  Entering maintenance mode…"
  # Signal the NestJS backend via its API (if running)
  curl -sf -X POST http://localhost:3000/api/emails/updater/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_JWT:-}" \
    --max-time 5 2>/dev/null || true

  # Pause Docker containers for non-critical services
  docker pause heavenlydrops-backend 2>/dev/null || true
}

exit_maintenance() {
  info "▶  Exiting maintenance mode…"
  docker unpause heavenlydrops-backend 2>/dev/null || true
  MAINTENANCE_MODE=false
}

cleanup() {
  if $MAINTENANCE_MODE; then
    warn "Updater exited unexpectedly – restoring services…"
    exit_maintenance
  fi
}
trap cleanup EXIT

# ── Loading screen ────────────────────────────────────────────

show_loading() {
  local msg="$1" pct="$2"
  local bar_width=40
  local filled=$(( pct * bar_width / 100 ))
  local empty=$(( bar_width - filled ))
  local bar
  bar=$(printf '%0.s█' $(seq 1 "$filled"))$(printf '%0.s░' $(seq 1 "$empty"))
  echo -e "\r  ${BLUE}[$bar]${NC} ${pct}%  $msg                    \c"
}

# ── Version check helpers ─────────────────────────────────────

get_roundcube_current() {
  docker inspect heavenlydrops-roundcube --format '{{.Config.Image}}' 2>/dev/null \
    | grep -oP '(?<=:)\S+' || echo "unknown"
}

get_roundcube_latest() {
  curl -sf "https://hub.docker.com/v2/repositories/roundcube/roundcubemail/tags?page_size=10" \
    | python3 -c "
import json,sys
data=json.load(sys.stdin)
tags=[t['name'] for t in data.get('results',[]) if t['name'].endswith('-apache')]
print(tags[0] if tags else 'unknown')
" 2>/dev/null || echo "unknown"
}

get_npm_current() {
  local pkg="$1"
  node -e "try{console.log(require('$ROOT_DIR/backend/node_modules/$pkg/package.json').version)}catch{console.log('not_installed')}" 2>/dev/null || echo "not_installed"
}

get_npm_latest() {
  local pkg="$1"
  curl -sf "https://registry.npmjs.org/${pkg}/latest" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown"
}

# ── Individual updaters ───────────────────────────────────────

update_roundcube() {
  local current latest
  current=$(get_roundcube_current)
  latest=$(get_roundcube_latest)

  info "Roundcube: current=$current, latest=$latest"
  if [[ "$current" == "$latest" || "$latest" == "unknown" ]]; then
    info "Roundcube is up to date."
    UPDATE_RESULTS+=("roundcube: up-to-date ($current)")
    return 0
  fi

  info "Updating Roundcube $current → $latest…"
  docker pull "roundcube/roundcubemail:$latest" 2>&1 | tee -a "$LOG_FILE"
  docker compose -f "$MAIL_DIR/docker-compose.mail.yml" up -d roundcube 2>&1 | tee -a "$LOG_FILE"
  UPDATE_RESULTS+=("roundcube: $current → $latest ✓")
  info "Roundcube updated."
}

update_npm_package() {
  local pkg="$1" label="$2"
  local current latest
  current=$(get_npm_current "$pkg")
  latest=$(get_npm_latest "$pkg")

  info "$label: current=$current, latest=$latest"
  if [[ "$current" == "$latest" || "$latest" == "unknown" || "$current" == "not_installed" ]]; then
    info "$label is up to date."
    UPDATE_RESULTS+=("$label: up-to-date ($current)")
    return 0
  fi

  info "Updating $label $current → $latest…"
  npm install --prefix "$BACKEND_DIR" "${pkg}@${latest}" --save 2>&1 | tee -a "$LOG_FILE"
  UPDATE_RESULTS+=("$label: $current → $latest ✓")
  info "$label updated."
}

# ── Diagnostics ───────────────────────────────────────────────

run_diagnostics_and_repair() {
  local attempts=0
  while [[ $attempts -lt 3 ]]; do
    info "Running diagnostics (attempt $((attempts+1))/3)…"
    "$ROOT_DIR/scripts/mail-diagnostics.sh" auto "sleep 1" && return 0
    attempts=$((attempts + 1))
    warn "Diagnostics failed – waiting 10s before retry…"
    sleep 10
  done
  error "Diagnostics failed after 3 attempts – manual intervention required."
  return 1
}

# ── Main ──────────────────────────────────────────────────────

head "HEAVENLY DROPS AUTO-UPDATER"
info "Log: $LOG_FILE"
echo ""

# ── Phase 1: Check ────────────────────────────────────────────
head "PHASE 1: CHECKING FOR UPDATES"
show_loading "Checking Roundcube…" 5

ROUNDCUBE_CURRENT=$(get_roundcube_current)
ROUNDCUBE_LATEST=$(get_roundcube_latest)
WA_CURRENT=$(get_npm_current "@whiskeysockets/baileys")
WA_LATEST=$(get_npm_latest "@whiskeysockets/baileys")
IG_CURRENT=$(get_npm_current "instagram-private-api")
IG_LATEST=$(get_npm_latest "instagram-private-api")
show_loading "Check complete." 10
echo ""

UPDATE_NEEDED=false
[[ "$ROUNDCUBE_CURRENT" != "$ROUNDCUBE_LATEST" && "$ROUNDCUBE_LATEST" != "unknown" ]] && UPDATE_NEEDED=true
[[ "$WA_CURRENT" != "$WA_LATEST" && "$WA_LATEST" != "unknown" && "$WA_CURRENT" != "not_installed" ]] && UPDATE_NEEDED=true
[[ "$IG_CURRENT" != "$IG_LATEST" && "$IG_LATEST" != "unknown" && "$IG_CURRENT" != "not_installed" ]] && UPDATE_NEEDED=true

if ! $UPDATE_NEEDED; then
  info "✅ All components are up to date. No updates required."
  exit 0
fi

# ── Phase 2: Maintenance mode ─────────────────────────────────
head "PHASE 2: ENTERING MAINTENANCE MODE"
show_loading "Pausing background services…" 15
enter_maintenance
show_loading "Maintenance mode active." 20
echo ""

# ── Phase 3: Take BEFORE snapshot ─────────────────────────────
head "PHASE 3: BEFORE SNAPSHOT"
BEFORE_SNAP="$ROOT_DIR/data/before_update_$(date +%Y%m%d_%H%M%S).json"
"$ROOT_DIR/scripts/mail-diagnostics.sh" snapshot "$BEFORE_SNAP" | tee -a "$LOG_FILE"
show_loading "Before snapshot taken." 25; echo ""

# ── Phase 4: Install updates ───────────────────────────────────
head "PHASE 4: INSTALLING UPDATES"
show_loading "Updating Roundcube…" 30
update_roundcube
show_loading "Updating WhatsApp API…" 50
update_npm_package "@whiskeysockets/baileys" "WhatsApp API"
show_loading "Updating Instagram API…" 65
update_npm_package "instagram-private-api" "Instagram API"
show_loading "Updates applied." 75; echo ""

# ── Phase 5: Exit maintenance, restart backend ────────────────
head "PHASE 5: RESTARTING SERVICES"
show_loading "Restarting NestJS backend…" 80
exit_maintenance
docker compose -f "$ROOT_DIR/docker-compose.yml" restart backend 2>&1 | tee -a "$LOG_FILE"
sleep 8
show_loading "Services resumed." 85; echo ""

# ── Phase 6: AFTER snapshot + compare ────────────────────────
head "PHASE 6: AFTER SNAPSHOT & COMPARISON"
AFTER_SNAP="$ROOT_DIR/data/after_update_$(date +%Y%m%d_%H%M%S).json"
"$ROOT_DIR/scripts/mail-diagnostics.sh" snapshot "$AFTER_SNAP" | tee -a "$LOG_FILE"
echo ""
"$ROOT_DIR/scripts/mail-diagnostics.sh" report "$BEFORE_SNAP" "$AFTER_SNAP" | tee -a "$LOG_FILE"
show_loading "Diagnostics complete." 95; echo ""

# ── Phase 7: Summary ──────────────────────────────────────────
head "UPDATE SUMMARY"
for r in "${UPDATE_RESULTS[@]}"; do
  info "  $r"
done
info "Log saved to: $LOG_FILE"
show_loading "Done." 100; echo ""
echo ""
info "✅ Auto-updater completed successfully."
