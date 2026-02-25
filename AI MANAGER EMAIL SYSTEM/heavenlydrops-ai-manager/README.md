# Heavenly Drops AI Manager

A production-ready, full-stack AI automation platform for Heavenly Drops - a "work and study abroad" consultancy business.

## Features

### Core AI Automation
- **WhatsApp & Instagram AI Chatbots** - 24/7 automated responses using OpenAI GPT
- **AI Voice Calls** - Automated outbound calls with female voice (Twilio integration)
- **Email Automation** - AI-generated replies with optional manual approval
- **Lead Management** - Complete lead lifecycle tracking
- **Appointment Scheduling** - Microsoft Teams meeting creation and calendar invites

### Knowledge Integration
- Automatic content sync from:
  - [Study in Spain](https://www.workandstudyabroad.com.tr/study-in-spain/)
  - [Work in Czech Republic](https://www.workandstudyabroad.com.tr/work-in-czech-republic/)
  - [About Us](https://www.workandstudyabroad.com.tr/about-us/)
- AI responses use contextual knowledge from these pages

### Admin Panel
- Dashboard with real-time statistics
- Lead management and assignment
- Conversation monitoring (WhatsApp/Instagram/Email)
- Call logs and recordings
- Appointment management with Teams integration
- Settings and configuration

## Tech Stack

### Backend
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL with TypeORM
- **Queue**: Redis + BullMQ
- **AI**: OpenAI GPT-4o/GPT-4o-mini
- **Integrations**:
  - WhatsApp Business API (Meta)
  - Instagram Messaging API
  - Twilio (Voice calls)
  - Microsoft Graph API (Teams)
  - Nodemailer (SMTP)

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: Zustand
- **Routing**: React Router

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **SSL**: Let's Encrypt
- **Deployment**: Single VPS (production hostname: `heavenlydrops.access.ly`)

## Project Structure

```
heavenlydrops-ai-manager/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # Authentication module
│   │   ├── leads/          # Lead management
│   │   ├── conversations/  # Chat management
│   │   ├── calls/          # Voice call management
│   │   ├── emails/         # Email automation
│   │   ├── appointments/   # Teams meeting scheduling
│   │   ├── ai/             # OpenAI integration
│   │   ├── integrations/   # External APIs (WhatsApp, Instagram, etc.)
│   │   ├── knowledge/      # Content sync from websites
│   │   ├── jobs/           # Background job processors
│   │   └── common/         # Public API endpoints
│   ├── Dockerfile
│   └── package.json
├── frontend/               # React admin panel
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── stores/         # State management
│   │   └── lib/            # Utilities
│   ├── Dockerfile
│   └── package.json
├── database/               # Database migrations
├── deployment/             # Deployment configs
│   ├── nginx/             # Nginx configuration
│   └── certbot/           # SSL certificate setup
├── docker-compose.yml      # Production orchestration
└── README.md
```

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for local development)
- A Linux VPS with public IP (for production)

### Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd heavenlydrops-ai-manager
```

2. **Set up environment variables**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration
```

3. **Start services with Docker Compose**
```bash
docker-compose up -d postgres redis
```

4. **Install backend dependencies**
```bash
cd backend
npm install
```

5. **Run database migrations**
```bash
npm run migration:run
```

6. **Start backend in development mode**
```bash
npm run start:dev
```

7. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

8. **Start frontend development server**
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api

### Production Deployment

#### 1. Server Setup

Provision a Linux VPS (Ubuntu 22.04 LTS recommended) with:
- At least 2GB RAM
- 20GB storage
- Public IP address

#### 2. Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

#### 3. Deploy Application

```bash
# Clone repository
git clone <repository-url>
cd heavenlydrops-ai-manager

# Create environment file
cp backend/.env.example .env
nano .env  # Edit with production values

# Build and start services
docker-compose up -d

# Run database migrations
docker-compose exec backend npm run migration:run
```

#### 4. Configure SSL (Let's Encrypt)

```bash
# Make script executable
chmod +x deployment/certbot/init-letsencrypt.sh

# Run initialization script
./deployment/certbot/init-letsencrypt.sh
```

#### 5. Configure DNS

Point your domain `heavenlydrops.access.ly` to your VPS IP address.

## Environment Variables

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://heavenlydrops.access.ly
FRONTEND_URL=https://heavenlydrops.access.ly

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=heavenlydrops
DB_PASSWORD=your_secure_password
DB_NAME=heavenlydrops_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Heavenly Drops <info@heavenlydrops.com>
TEAM_EMAIL=team@heavenlydrops.com

# WhatsApp
WHATSAPP_ACCESS_TOKEN=your-whatsapp-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token

# Instagram
INSTAGRAM_PAGE_ACCESS_TOKEN=your-page-access-token
INSTAGRAM_PAGE_ID=your-page-id
INSTAGRAM_VERIFY_TOKEN=your-webhook-verify-token

# Microsoft Teams
MS_TENANT_ID=your-tenant-id
MS_CLIENT_ID=your-client-id
MS_CLIENT_SECRET=your-client-secret
```

## API Endpoints

### Public Endpoints
- `POST /api/leads/public` - Submit lead from website form
- `GET/POST /api/webhooks/whatsapp` - WhatsApp webhook
- `GET/POST /api/webhooks/instagram` - Instagram webhook
- `GET/POST /api/calls/twiml` - Twilio voice webhook
- `POST /api/calls/status` - Twilio call status callback

### Protected Endpoints (Require JWT)
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get user profile
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `GET /api/conversations` - List conversations
- `GET /api/calls` - List calls
- `GET /api/emails` - List emails
- `GET /api/appointments` - List appointments
- `GET /api/knowledge/sync` - Sync knowledge documents

## Integration Setup

### WhatsApp Business API

1. Create a Meta Developer account
2. Set up a WhatsApp Business App
3. Add a phone number
4. Generate an access token
5. Configure webhook URL: `https://heavenlydrops.access.ly/api/webhooks/whatsapp`
6. Set verify token in environment variables

### Instagram Messaging API

1. Connect Instagram account to Facebook Page
2. Enable messaging in Instagram settings
3. Configure webhook URL: `https://heavenlydrops.access.ly/api/webhooks/instagram`
4. Subscribe to messaging events

### Twilio

1. Create a Twilio account
2. Purchase a phone number with voice capabilities
3. Get Account SID and Auth Token
4. Configure webhook URLs in Twilio console

### Microsoft Teams

1. Register an application in Azure AD
2. Add Microsoft Graph API permissions:
   - `Calendars.ReadWrite`
   - `OnlineMeetings.ReadWrite`
3. Configure redirect URI
4. Get Tenant ID, Client ID, and Client Secret

## Background Jobs

The system uses BullMQ with Redis for background processing:

- **Call Queue**: Outbound AI voice calls
- **Email Queue**: Automated email sending
- **Knowledge Queue**: Daily content sync from websites
- **Appointments Queue**: Reminder notifications

Scheduled tasks:
- Process scheduled calls (every minute)
- Send appointment reminders (every hour)
- Sync knowledge documents (daily at 2 AM)
- Data cleanup (weekly)

## Monitoring & Logs

View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f nginx
```

## Backup & Restore

### Database Backup
```bash
docker-compose exec postgres pg_dump -U heavenlydrops heavenlydrops_db > backup.sql
```

### Database Restore
```bash
docker-compose exec -T postgres psql -U heavenlydrops heavenlydrops_db < backup.sql
```

## Troubleshooting

### Common Issues

**1. Services not starting**
```bash
# Check logs
docker-compose logs

# Restart services
docker-compose restart
```

**2. Database connection errors**
- Verify DB_HOST is set to `postgres` (not localhost) in Docker
- Check credentials in .env file

**3. Webhook verification fails**
- Ensure webhook URLs are publicly accessible
- Verify verify tokens match between app and environment

**4. SSL certificate issues**
```bash
# Renew certificates manually
docker-compose exec certbot certbot renew

# Restart nginx
docker-compose restart nginx
```

## Security Considerations

1. **Change default passwords** - Update all default credentials
2. **Use strong JWT secret** - Generate a random 256-bit key
3. **Enable firewall** - Only expose ports 80, 443, and SSH
4. **Regular updates** - Keep Docker images and dependencies updated
5. **HTTPS only** - All traffic should go through HTTPS in production

## License

MIT License - See LICENSE file for details

## Support

For support and questions, contact:
- Email: support@heavenlydrops.com
- Website: https://heavenlydrops.access.ly
