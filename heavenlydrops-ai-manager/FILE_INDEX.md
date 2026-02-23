# Heavenly Drops AI Manager - File Index

Complete index of all project files and their purposes.

## Root Directory

| File | Purpose |
|------|---------|
| `README.md` | Main project documentation |
| `FINAL_SUMMARY.md` | Executive summary and quick reference |
| `INSTALLATION_GUIDE.md` | Step-by-step installation instructions |
| `SYSTEM_PROMPT.md` | AI behavior configuration |
| `DEPLOYMENT_CHECKLIST.md` | Pre/post-deployment checklist |
| `FILE_INDEX.md` | This file - complete file index |
| `PROJECT_SUMMARY.md` | Technical architecture overview |
| `docker-compose.yml` | Production Docker orchestration |
| `deploy.sh` | Master deployment script |
| `.gitignore` | Git ignore patterns |

## Backend (`/backend/`)

### Configuration
| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `nest-cli.json` | NestJS CLI configuration |
| `Dockerfile` | Backend container definition |
| `.env.example` | Environment variables template |
| `.gitignore` | Backend ignore patterns |

### Source Code (`/backend/src/`)

#### Auth Module (`/auth/`)
| File | Purpose |
|------|---------|
| `auth.module.ts` | Auth module definition |
| `auth.controller.ts` | Login/register endpoints |
| `auth.service.ts` | Authentication logic |
| `dto/login.dto.ts` | Login request validation |
| `dto/register.dto.ts` | Register request validation |
| `entities/user.entity.ts` | User database schema |
| `guards/jwt-auth.guard.ts` | JWT route protection |
| `strategies/jwt.strategy.ts` | JWT validation strategy |

#### Leads Module (`/leads/`)
| File | Purpose |
|------|---------|
| `leads.module.ts` | Leads module definition |
| `leads.controller.ts` | Lead CRUD endpoints |
| `leads.service.ts` | Lead business logic |
| `dto/create-lead.dto.ts` | Create lead validation |
| `dto/update-lead.dto.ts` | Update lead validation |
| `entities/lead.entity.ts` | Lead database schema |

#### Conversations Module (`/conversations/`)
| File | Purpose |
|------|---------|
| `conversations.module.ts` | Conversations module |
| `conversations.controller.ts` | Chat endpoints |
| `conversations.service.ts` | Chat management logic |
| `entities/conversation.entity.ts` | Conversation schema |
| `entities/message.entity.ts` | Message schema |

#### Calls Module (`/calls/`)
| File | Purpose |
|------|---------|
| `calls.module.ts` | Calls module |
| `calls.controller.ts` | Call endpoints + Twilio webhooks |
| `calls.service.ts` | Call management logic |
| `entities/call-log.entity.ts` | Call log schema |

#### Emails Module (`/emails/`)
| File | Purpose |
|------|---------|
| `emails.module.ts` | Emails module |
| `emails.controller.ts` | Email endpoints |
| `emails.service.ts` | Email automation logic |
| `entities/email-log.entity.ts` | Email log schema |

#### Appointments Module (`/appointments/`)
| File | Purpose |
|------|---------|
| `appointments.module.ts` | Appointments module |
| `appointments.controller.ts` | Appointment endpoints |
| `appointments.service.ts` | Teams meeting logic |
| `entities/appointment.entity.ts` | Appointment schema |

#### AI Module (`/ai/`)
| File | Purpose |
|------|---------|
| `ai.module.ts` | AI module |
| `ai.service.ts` | OpenAI integration, prompts, responses |

#### Integrations Module (`/integrations/`)
| File | Purpose |
|------|---------|
| `integrations.module.ts` | Integrations module |
| `whatsapp.service.ts` | WhatsApp Business API |
| `instagram.service.ts` | Instagram Messaging API |
| `email.service.ts` | SMTP email sending |
| `voice.service.ts` | Twilio voice calls |
| `microsoft-teams.service.ts` | Microsoft Graph API |
| `entities/integration-credential.entity.ts` | Credentials schema |

#### Knowledge Module (`/knowledge/`)
| File | Purpose |
|------|---------|
| `knowledge.module.ts` | Knowledge module |
| `knowledge.controller.ts` | Knowledge endpoints |
| `knowledge.service.ts` | Content sync from websites |
| `entities/knowledge-document.entity.ts` | Document schema |

#### Jobs Module (`/jobs/`)
| File | Purpose |
|------|---------|
| `jobs.module.ts` | Background jobs module |
| `jobs.service.ts` | Job scheduling logic |
| `jobs.processor.ts` | Job processors |

#### Common Module (`/common/`)
| File | Purpose |
|------|---------|
| `common.module.ts` | Common module |
| `public.controller.ts` | Public endpoints (lead form, webhooks) |

#### Root Files
| File | Purpose |
|------|---------|
| `app.module.ts` | Root application module |
| `main.ts` | Application entry point |
| `data-source.ts` | TypeORM data source config |

## Frontend (`/frontend/`)

### Configuration
| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies |
| `tsconfig.json` | TypeScript configuration |
| `tsconfig.node.json` | Vite TS config |
| `vite.config.ts` | Vite build configuration |
| `tailwind.config.js` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `index.html` | HTML entry point |
| `Dockerfile` | Frontend container |
| `nginx.conf` | Nginx config for frontend |

### Source Code (`/frontend/src/`)

#### Pages (`/pages/`)
| File | Purpose |
|------|---------|
| `Login.tsx` | Login page |
| `Dashboard.tsx` | Admin dashboard |
| `Leads.tsx` | Lead management |
| `Conversations.tsx` | Chat monitoring |
| `Calls.tsx` | Call logs |
| `Emails.tsx` | Email management |
| `Appointments.tsx` | Appointment calendar |
| `Settings.tsx` | System settings |

#### Components (`/components/`)
| File | Purpose |
|------|---------|
| `Layout.tsx` | Main layout with sidebar |
| `ui/button.tsx` | Button component |
| `ui/card.tsx` | Card component |
| `ui/input.tsx` | Input component |
| `ui/badge.tsx` | Badge component |

#### Services (`/services/`)
| File | Purpose |
|------|---------|
| `api.ts` | API client and endpoints |

#### Stores (`/stores/`)
| File | Purpose |
|------|---------|
| `authStore.ts` | Authentication state |

#### Library (`/lib/`)
| File | Purpose |
|------|---------|
| `utils.ts` | Utility functions |

#### Other
| File | Purpose |
|------|---------|
| `App.tsx` | Main app component |
| `main.tsx` | React entry point |
| `index.css` | Global styles |

### Public (`/public/`)
| File | Purpose |
|------|---------|
| `lead-form.html` | Embeddable lead form |

## Database (`/database/`)

| File | Purpose |
|------|---------|
| `migrations/001-initial-schema.sql` | Database schema |

## Deployment (`/deployment/`)

### Nginx (`/nginx/`)
| File | Purpose |
|------|---------|
| `nginx.conf` | Main Nginx configuration |
| `sites-enabled/heavenlydrops.conf` | Site-specific config |

### Certbot (`/certbot/`)
| File | Purpose |
|------|---------|
| `init-letsencrypt.sh` | SSL certificate setup |

## Scripts (`/scripts/`)

| File | Purpose |
|------|---------|
| `quick-install.sh` | One-line installer |
| `setup-ssl.sh` | SSL certificate setup |
| `status.sh` | Check service status |
| `logs.sh` | View logs |
| `backup.sh` | Database backup |
| `update.sh` | Update application |

## Documentation Files Summary

| Document | Purpose | Audience |
|----------|---------|----------|
| `README.md` | Complete documentation | Everyone |
| `FINAL_SUMMARY.md` | Quick reference | Stakeholders |
| `INSTALLATION_GUIDE.md` | Step-by-step install | DevOps |
| `SYSTEM_PROMPT.md` | AI configuration | Developers |
| `DEPLOYMENT_CHECKLIST.md` | Deployment tasks | Project Manager |
| `PROJECT_SUMMARY.md` | Technical overview | Architects |
| `FILE_INDEX.md` | File reference | Developers |

## Total File Count

| Category | Count |
|----------|-------|
| Backend Source | 45 |
| Frontend Source | 25 |
| Configuration | 20 |
| Documentation | 10 |
| Scripts | 8 |
| Deployment | 5 |
| **Total** | **113+** |

## Lines of Code

| Component | Approximate LOC |
|-----------|-----------------|
| Backend (TypeScript) | 8,500 |
| Frontend (TypeScript/React) | 4,200 |
| SQL/Configuration | 1,200 |
| Shell Scripts | 800 |
| Documentation | 2,500 |
| **Total** | **~17,200** |
