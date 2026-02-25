# Heavenly Drops AI Manager - Project Summary

## Overview

A production-ready, full-stack AI automation platform for Heavenly Drops - a "work and study abroad" consultancy business. The system manages WhatsApp/Instagram chatbots, AI voice calls, email automation, and Microsoft Teams appointment scheduling.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Website    │  │  Admin Panel │  │  WhatsApp   │  │  Instagram   │   │
│  │  Lead Form   │  │   (React)    │  │   Chatbot   │  │   Chatbot    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY (Nginx)                               │
│                    HTTPS / Rate Limiting / Static Files                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                  │
│                         NestJS Backend (Node.js)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   Auth   │ │  Leads   │ │  Chat    │ │  Calls   │ │  Emails  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │Appointments│ │   AI    │ │Knowledge │ │  Jobs   │                        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│  PostgreSQL  │            │    Redis     │            │  External APIs│
│  (Database)  │            │   (Queues)   │            │               │
└──────────────┘            └──────────────┘            │ • OpenAI     │
                                                        │ • Twilio     │
                                                        │ • WhatsApp   │
                                                        │ • Instagram  │
                                                        │ • MS Teams   │
                                                        │ • SMTP       │
                                                        └──────────────┘
```

## File Structure

```
heavenlydrops-ai-manager/
├── backend/                        # NestJS API (70+ files)
│   ├── src/
│   │   ├── auth/                  # JWT authentication
│   │   ├── leads/                 # Lead CRUD & management
│   │   ├── conversations/         # Chat management
│   │   ├── calls/                 # Voice call management
│   │   ├── emails/                # Email automation
│   │   ├── appointments/          # Teams meeting scheduling
│   │   ├── ai/                    # OpenAI integration
│   │   ├── integrations/          # External APIs
│   │   ├── knowledge/             # Content sync
│   │   ├── jobs/                  # Background processors
│   │   └── common/                # Public endpoints
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                       # React Admin Panel (40+ files)
│   ├── src/
│   │   ├── components/            # UI components
│   │   ├── pages/                 # Dashboard, Leads, etc.
│   │   ├── services/              # API clients
│   │   ├── stores/                # Zustand state
│   │   └── lib/                   # Utilities
│   ├── public/lead-form.html      # Embeddable lead form
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   └── migrations/001-initial-schema.sql
│
├── deployment/
│   ├── nginx/                     # Reverse proxy config
│   └── certbot/                   # SSL certificate setup
│
├── docker-compose.yml              # Production orchestration
└── README.md                       # Full documentation
```

## Key Features Implemented

### 1. Authentication & Security
- JWT-based authentication
- Role-based access control (Super Admin, Admin, Agent, Viewer)
- Password hashing with bcrypt
- Protected API routes

### 2. Lead Management
- Lead capture from web forms
- Lead status tracking (New → Contacted → Qualified → Converted)
- Assignment to agents
- Qualification data storage
- Search and filter capabilities

### 3. AI Chatbots (WhatsApp & Instagram)
- 24/7 automated responses
- Context-aware conversations using knowledge base
- Conversation history tracking
- Human handoff when needed
- Webhook integration for real-time messaging

### 4. AI Voice Calls (Twilio)
- Automated outbound calls after form submission
- AI-generated scripts based on lead interest
- Call recording and transcription
- Summary generation and email notification
- Retry logic for failed calls

### 5. Email Automation
- AI-generated email replies
- Template-based emails (welcome, appointment, call summary)
- Manual approval for low-confidence responses
- Email tracking (opens, clicks)

### 6. Appointment Scheduling (Microsoft Teams)
- Teams meeting creation via Graph API
- Calendar invitations to staff and customers
- Appointment reminders
- Reschedule/cancel functionality

### 7. Knowledge Management
- Automatic content sync from:
  - Study in Spain page
  - Work in Czech Republic page
  - About Us page
- Keyword extraction
- Usage tracking

### 8. Background Jobs (BullMQ + Redis)
- Scheduled call execution
- Email queue processing
- Daily knowledge sync
- Appointment reminders

## API Endpoints

### Public (No Auth)
- `POST /api/leads/public` - Submit lead form
- `GET/POST /api/webhooks/whatsapp` - WhatsApp webhook
- `GET/POST /api/webhooks/instagram` - Instagram webhook
- `POST /api/calls/status` - Twilio status callback

### Protected (JWT Required)
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get profile
- `GET /api/leads` - List leads
- `GET /api/conversations` - List conversations
- `GET /api/calls` - List calls
- `GET /api/emails` - List emails
- `GET /api/appointments` - List appointments
- `GET /api/knowledge/sync` - Sync knowledge

## Environment Variables

See `backend/.env.example` for full list. Key variables:

```env
# Core
NODE_ENV=production
APP_URL=https://heavenlydrops.access.ly

# Database
DB_HOST=postgres
DB_USERNAME=heavenlydrops
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=redis

# JWT
JWT_SECRET=your-secret-key

# OpenAI
OPENAI_API_KEY=sk-...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_USER=...
SMTP_PASS=...

# WhatsApp
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...

# Microsoft Teams
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
```

## Deployment

### Production Setup

1. **Provision VPS** (Ubuntu 22.04, 2GB RAM, 20GB storage)

2. **Install Docker**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
```

3. **Clone and Configure**
```bash
git clone <repo>
cd heavenlydrops-ai-manager
cp backend/.env.example .env
nano .env  # Edit configuration
```

4. **Deploy**
```bash
docker-compose up -d
docker-compose exec backend npm run migration:run
```

5. **Configure SSL**
```bash
chmod +x deployment/certbot/init-letsencrypt.sh
./deployment/certbot/init-letsencrypt.sh
```

6. **Configure DNS**
Point `heavenlydrops.access.ly` to VPS IP

## Integration Setup

### WhatsApp Business API
1. Create Meta Developer account
2. Set up WhatsApp Business App
3. Add phone number
4. Generate access token
5. Configure webhook: `https://heavenlydrops.access.ly/api/webhooks/whatsapp`

### Instagram Messaging
1. Connect Instagram to Facebook Page
2. Enable messaging
3. Configure webhook: `https://heavenlydrops.access.ly/api/webhooks/instagram`

### Twilio
1. Create account
2. Purchase phone number
3. Get Account SID and Auth Token
4. Configure webhook URLs

### Microsoft Teams
1. Register app in Azure AD
2. Add Graph API permissions
3. Get Tenant ID, Client ID, Client Secret

## Monitoring

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend

# Check queue status
docker-compose exec backend npm run queue:status
```

## File Count Summary

| Component | Files | Lines of Code |
|-----------|-------|---------------|
| Backend (NestJS) | 70+ | ~8,000 |
| Frontend (React) | 40+ | ~4,000 |
| Database | 1 | ~400 |
| Deployment | 4 | ~300 |
| Documentation | 2 | ~600 |
| **Total** | **117+** | **~13,300** |

## Next Steps for Production

1. **Security**
   - Change all default passwords
   - Generate strong JWT secret
   - Enable firewall (ufw)
   - Set up fail2ban

2. **Monitoring**
   - Install Prometheus + Grafana
   - Set up log aggregation (ELK/Loki)
   - Configure alerting

3. **Backups**
   - Schedule database backups
   - Set up offsite storage

4. **Scaling** (if needed)
   - Add load balancer
   - Scale backend horizontally
   - Use managed database

## Support

For questions or issues:
- Email: support@heavenlydrops.com
- Documentation: See README.md
