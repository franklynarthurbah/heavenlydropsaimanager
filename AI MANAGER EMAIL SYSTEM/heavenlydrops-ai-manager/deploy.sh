#!/bin/bash
# =============================================================================
# Heavenly Drops AI Manager - Master Deployment Script
# =============================================================================
# This script automates the entire deployment process on a fresh Ubuntu VPS
# Usage: ./deploy.sh [environment]
# Environments: development | production (default: production)
# =============================================================================

set -e

ENVIRONMENT=${1:-production}
DOMAIN="heavenlydrops.access.ly"
INSTALL_DIR="/opt/heavenlydrops"

log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
log_warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

install_dependencies() {
    log_info "Installing system dependencies..."
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release software-properties-common git nano ufw fail2ban htop net-tools jq openssl
    log_success "Dependencies installed"
}

install_docker() {
    log_info "Installing Docker..."
    if command -v docker &> /dev/null; then
        log_warn "Docker already installed"
        return
    fi
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl start docker
    systemctl enable docker
    log_success "Docker installed"
}

setup_firewall() {
    log_info "Configuring firewall..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    echo "y" | ufw enable
    log_success "Firewall configured"
}

setup_directories() {
    log_info "Setting up directories..."
    mkdir -p $INSTALL_DIR/{data/{postgres,redis,certbot/{conf,www}},logs,scripts,backups}
    log_success "Directories created"
}

generate_env() {
    log_info "Generating environment file..."
    JWT_SECRET=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -base64 24)
    REDIS_PASSWORD=$(openssl rand -base64 24)
    
    cat > $INSTALL_DIR/.env <<EOF
NODE_ENV=$ENVIRONMENT
PORT=3000
APP_URL=https://$DOMAIN
FRONTEND_URL=https://$DOMAIN

DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=heavenlydrops
DB_PASSWORD=$DB_PASSWORD
DB_NAME=heavenlydrops_db
DB_SSL=false

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
FALLBACK_PHONE_NUMBER=+901234567890

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Heavenly Drops <info@heavenlydrops.com>
TEAM_EMAIL=team@heavenlydrops.com

WHATSAPP_ACCESS_TOKEN=your-whatsapp-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_APP_SECRET=your-app-secret

INSTAGRAM_PAGE_ACCESS_TOKEN=your-page-access-token
INSTAGRAM_PAGE_ID=your-page-id
INSTAGRAM_VERIFY_TOKEN=your-verify-token
INSTAGRAM_APP_SECRET=your-app-secret

MS_TENANT_ID=your-tenant-id
MS_CLIENT_ID=your-client-id
MS_CLIENT_SECRET=your-client-secret
MS_REDIRECT_URI=https://$DOMAIN/api/auth/microsoft/callback

API_RATE_LIMIT=100
CORS_ORIGIN=https://$DOMAIN
EOF
    log_success "Environment file created"
}

create_scripts() {
    log_info "Creating management scripts..."
    
    cat > $INSTALL_DIR/scripts/status.sh <<'SCRIPT'
#!/bin/bash
cd /opt/heavenlydrops
docker-compose ps
SCRIPT
    chmod +x $INSTALL_DIR/scripts/status.sh
    
    cat > $INSTALL_DIR/scripts/logs.sh <<'SCRIPT'
#!/bin/bash
cd /opt/heavenlydrops
docker-compose logs -f ${1:-}
SCRIPT
    chmod +x $INSTALL_DIR/scripts/logs.sh
    
    cat > $INSTALL_DIR/scripts/backup.sh <<'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/heavenlydrops/backups"
mkdir -p $BACKUP_DIR
docker-compose exec -T postgres pg_dump -U heavenlydrops heavenlydrops_db > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql
echo "Backup saved to $BACKUP_DIR"
SCRIPT
    chmod +x $INSTALL_DIR/scripts/backup.sh
    
    cat > $INSTALL_DIR/scripts/update.sh <<'SCRIPT'
#!/bin/bash
cd /opt/heavenlydrops
docker-compose pull
docker-compose build --no-cache
docker-compose up -d
docker-compose exec backend npm run migration:run
SCRIPT
    chmod +x $INSTALL_DIR/scripts/update.sh
    
    log_success "Scripts created"
}

main() {
    echo "============================================================================="
    echo "  Heavenly Drops AI Manager - Deployment"
    echo "  Environment: $ENVIRONMENT"
    echo "============================================================================="
    
    check_root
    install_dependencies
    install_docker
    setup_firewall
    setup_directories
    generate_env
    create_scripts
    
    log_success "Base setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Copy your application files to $INSTALL_DIR"
    echo "2. Edit $INSTALL_DIR/.env with your API keys"
    echo "3. Run: cd $INSTALL_DIR && docker-compose up -d"
    echo "4. Setup SSL: ./scripts/setup-ssl.sh"
}

main "$@"
