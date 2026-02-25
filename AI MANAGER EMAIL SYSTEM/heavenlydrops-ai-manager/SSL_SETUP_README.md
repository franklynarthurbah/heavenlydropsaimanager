# SSL Setup for Heavenly Drops AI Manager

## Quick Start

```bash
# 1. Make scripts executable
chmod +x scripts/setup-ssl.sh scripts/health-check.sh

# 2. Run SSL setup
sudo ./scripts/setup-ssl.sh heavenlydrops.access.ly admin@heavenlydrops.com
```

## What This Does

1. **Installs Certbot** and dependencies
2. **Validates DNS** configuration
3. **Generates dummy certificate** for initial Nginx startup
4. **Requests real certificate** from Let's Encrypt
5. **Configures Nginx** with SSL and security headers
6. **Sets up auto-renewal** (cron + systemd timer)
7. **Tests SSL configuration**

## Files Created

| File | Purpose |
|------|---------|
| `scripts/setup-ssl.sh` | Main SSL setup script |
| `scripts/health-check.sh` | Health monitoring |
| `data/certbot/conf/` | SSL certificates |
| `deployment/nginx/sites-enabled/heavenlydrops.conf` | Nginx SSL config |

## Auto-Renewal

- **Cron**: Runs twice daily at 3:00 AM and 3:00 PM
- **Systemd Timer**: Backup renewal method
- **Logs**: `/opt/heavenlydrops/logs/ssl-renewal.log`

## Verification

```bash
# Check certificate
openssl x509 -in data/certbot/conf/live/heavenlydrops.access.ly/fullchain.pem -noout -text

# Test HTTPS
curl -v https://heavenlydrops.access.ly/health

# Run health check
sudo ./scripts/health-check.sh
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| DNS not resolving | Ensure A record points to server IP |
| Certificate fails | Check domain ownership, try staging mode |
| Nginx won't start | Check config syntax: `nginx -t` |
| Renewal fails | Check logs: `tail -f logs/ssl-renewal.log` |

## Security Features

- ✅ TLS 1.2 & 1.3 only
- ✅ Strong cipher suites
- ✅ OCSP stapling
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ HTTP → HTTPS redirect
- ✅ Rate limiting
