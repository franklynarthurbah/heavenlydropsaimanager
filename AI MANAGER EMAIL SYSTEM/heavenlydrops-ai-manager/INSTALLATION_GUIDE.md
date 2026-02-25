# Heavenly Drops AI Manager - Installation Guide

## Quick Start (One Command)

```bash
# On a fresh Ubuntu 22.04 VPS, run:
curl -sSL https://raw.githubusercontent.com/yourusername/heavenlydrops-ai-manager/main/scripts/quick-install.sh | sudo bash
```

Or manually:

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/heavenlydrops-ai-manager.git
cd heavenlydrops-ai-manager

# 2. Run the deployment script
sudo ./deploy.sh production

# 3. Edit environment variables
sudo nano /opt/heavenlydrops/.env

# 4. Start services
cd /opt/heavenlydrops && sudo docker-compose up -d

# 5. Setup SSL
sudo ./scripts/setup-ssl.sh
```

## System Requirements

- **OS**: Ubuntu 20.04 LTS or 22.04 LTS (recommended)
- **RAM**: Minimum 2GB (4GB recommended)
- **Storage**: Minimum 20GB SSD
- **Network**: Public IP address
- **Domain**: A domain name pointing to your server

## Step-by-Step Installation

### Step 1: Provision Your Server

1. Create a VPS with your preferred provider (DigitalOcean, AWS, Linode, etc.)
2. Choose Ubuntu 22.04 LTS
3. Select at least 2GB RAM and 20GB storage
4. Note your server's public IP address

### Step 2: Configure DNS

Point your domain to your server's IP:

```
Type: A
Name: @
Value: YOUR_SERVER_IP
TTL: 3600
```

Also add a wildcard or www record if needed:

```
Type: A
Name: www
Value: YOUR_SERVER_IP
TTL: 3600
```

### Step 3: Connect to Your Server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 4: Run the Installation

```bash
# Download and run the installer
curl -sSL https://raw.githubusercontent.com/yourusername/heavenlydrops-ai-manager/main/scripts/quick-install.sh | sudo bash
```

This will:
- Update system packages
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Create application directories
- Generate secure environment variables
- Start PostgreSQL and Redis services

### Step 5: Configure Environment Variables

Edit the environment file:

```bash
sudo nano /opt/heavenlydrops/.env
```

**Required variables to set:**

```env
# OpenAI (Get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-actual-openai-key

# Twilio (Get from https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# SMTP (Gmail example - use App Password)
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# WhatsApp Business (Get from Meta Developer Console)
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-verify-token

# Instagram (Get from Facebook Developer Console)
INSTAGRAM_PAGE_ACCESS_TOKEN=your-instagram-token
INSTAGRAM_PAGE_ID=your-page-id

# Microsoft Teams (Get from Azure Portal)
MS_TENANT_ID=your-tenant-id
MS_CLIENT_ID=your-client-id
MS_CLIENT_SECRET=your-client-secret
```

### Step 6: Build and Start Application

```bash
cd /opt/heavenlydrops

# Build all services
sudo docker-compose build --no-cache

# Start all services
sudo docker-compose up -d

# Run database migrations
sudo docker-compose exec backend npm run migration:run

# Create initial admin user
sudo docker-compose exec backend node -e "
const { DataSource } = require('typeorm');
const { User } = require('./dist/auth/entities/user.entity');
const bcrypt = require('bcryptjs');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'postgres',
  port: 5432,
  username: 'heavenlydrops',
  password: process.env.DB_PASSWORD,
  database: 'heavenlydrops_db',
  entities: [User],
});

async function createAdmin() {
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);
  
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = userRepo.create({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@heavenlydrops.com',
    password: hashedPassword,
    role: 'super_admin',
    isActive: true,
  });
  
  await userRepo.save(admin);
  console.log('Admin user created: admin@heavenlydrops.com / admin123');
  await dataSource.destroy();
}

createAdmin().catch(console.error);
"
```

### Step 7: Setup SSL Certificate

```bash
cd /opt/heavenlydrops
sudo ./scripts/setup-ssl.sh
```

This will:
- Request a Let's Encrypt SSL certificate
- Configure Nginx for HTTPS
- Set up auto-renewal

### Step 8: Verify Installation

Check service status:

```bash
cd /opt/heavenlydrops
sudo docker-compose ps
```

View logs:

```bash
# All services
sudo docker-compose logs -f

# Specific service
sudo docker-compose logs -f backend
```

Access your application:
- Admin Panel: https://heavenlydrops.access.ly
- Default login: admin@heavenlydrops.com / admin123

## Post-Installation Configuration

### 1. Configure WhatsApp Webhook

In Meta Developer Console:
- Webhook URL: `https://heavenlydrops.access.ly/api/webhooks/whatsapp`
- Verify Token: (from your .env file)
- Subscribe to: messages, message_deliveries, message_reads

### 2. Configure Instagram Webhook

In Facebook Developer Console:
- Webhook URL: `https://heavenlydrops.access.ly/api/webhooks/instagram`
- Verify Token: (from your .env file)
- Subscribe to: messages, messaging_postbacks

### 3. Configure Twilio Webhook

In Twilio Console:
- Voice Webhook: `https://heavenlydrops.access.ly/api/calls/twiml`
- Status Callback: `https://heavenlydrops.access.ly/api/calls/status`

### 4. Sync Knowledge Documents

```bash
curl -X GET https://heavenlydrops.access.ly/api/knowledge/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Management Commands

### View Status
```bash
sudo /opt/heavenlydrops/scripts/status.sh
```

### View Logs
```bash
# All services
sudo /opt/heavenlydrops/scripts/logs.sh

# Specific service
sudo /opt/heavenlydrops/scripts/logs.sh backend
```

### Backup Database
```bash
sudo /opt/heavenlydrops/scripts/backup.sh
```

### Update Application
```bash
sudo /opt/heavenlydrops/scripts/update.sh
```

### Restart Services
```bash
cd /opt/heavenlydrops
sudo docker-compose restart
```

### Stop Services
```bash
cd /opt/heavenlydrops
sudo docker-compose down
```

## Troubleshooting

### Services won't start
```bash
# Check logs
sudo docker-compose logs

# Check disk space
df -h

# Check memory
free -h
```

### Database connection errors
```bash
# Check if PostgreSQL is running
sudo docker-compose ps postgres

# Check database logs
sudo docker-compose logs postgres
```

### SSL certificate issues
```bash
# Renew certificate manually
cd /opt/heavenlydrops
docker-compose run --rm certbot certbot renew

# Reload nginx
docker-compose exec nginx nginx -s reload
```

### Reset admin password
```bash
cd /opt/heavenlydrops
sudo docker-compose exec backend node -e "
const bcrypt = require('bcryptjs');
console.log(await bcrypt.hash('newpassword', 10));
"
# Then update in database
```

## Security Checklist

- [ ] Changed default admin password
- [ ] Generated strong JWT secret
- [ ] Set strong database password
- [ ] Configured firewall (UFW)
- [ ] Enabled fail2ban
- [ ] Using HTTPS only
- [ ] API keys are secure
- [ ] Regular backups configured
- [ ] Server updates applied

## Support

For issues and questions:
- Email: support@heavenlydrops.com
- Documentation: https://docs.heavenlydrops.access.ly
- Issues: https://github.com/yourusername/heavenlydrops-ai-manager/issues
