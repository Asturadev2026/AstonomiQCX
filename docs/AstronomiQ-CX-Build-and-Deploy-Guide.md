# AstronomiQ CX — Master Build & Deploy Guide
### The single source of truth to build, deploy, test and maintain the platform

**Version 1.0 · Audience: engineering team · Region: India (AWS Mumbai `ap-south-1`)**

---

## 0. How to use this document

This is the only document the engineering team needs to build AstronomiQ CX from zero to a live, multi-tenant, cloud-hosted SaaS. Read it top to bottom once, then use it as a reference.

**What is in here:** every architecture and product decision (already made — do not re-ask), the full database schema, working reference code for every subsystem (auth, multi-tenancy, tickets, SLA engine, WhatsApp, cloud telephony, AI chatbot, escalation worker), the deployment setup (Docker, Kubernetes, cloud, CI/CD), the test plan, and step-by-step runbooks to add, delete or change any module, field, API or screen.

**About the code:** A production CX platform with 25 modules is a repo of tens of thousands of lines — that repo is *created by following this document*. So the document gives (a) the complete data model and API contract for **all** modules, and (b) **fully working reference implementations** for the hard/representative parts. Every other module is built by copying the **worked "Tickets" example** in §10, which is deliberately shown end to end (DB → service → API → tests → UI). The pattern is identical for Contacts, Conversations, Campaigns, KB, Surveys, Departments, etc. Nothing about *how* to build any module is left ambiguous.

**The UI** is the prototype file `AstronomiQ-CX.html` (already delivered). It is the pixel reference and the interaction spec. §16 explains how to port it into React components. Keep it open next to this document.

**Definition of done:** a client can be onboarded, their team logs in with issued IDs, WhatsApp/voice/social channels are connected, the bot auto-replies, SLAs and escalations run, agents handle tickets, and everything is observable and backed up — on cloud infrastructure in India.

---

## 1. Product scope — the 25 modules

The platform is these modules (all present in the prototype). Each maps to backend tables + APIs + a frontend route.

| # | Module | Core tables | Key job |
|---|--------|-------------|---------|
| 1 | Command Centre | (aggregates) | Live KPIs & activity feed |
| 2 | Omni Inbox | conversations, messages | Unified threaded inbox |
| 3 | Conversation Hub | social_mentions | Meta/LinkedIn/Google listening → bot reply → escalate → ticket |
| 4 | Tickets Board | tickets | Case lifecycle (Kanban) |
| 5 | AI Chatbot | kb_articles, embeddings | RAG self-serve bot (Astra) |
| 6 | WhatsApp Bot | channels, messages | WhatsApp Business API flows |
| 7 | Voice AI | calls, transcripts | Voice bot + live transcription |
| 8 | Agent Builder | agent_flows | No-code conversational flow builder |
| 9 | Automations | rules | Trigger→condition→action engine |
| 10 | Knowledge Base | kb_articles | Help content (agent + customer) |
| 11 | Macros | macros | Canned responses |
| 12 | SLA & Escalation | sla_policies, sla_events, escalation_rules | Targets, timers, auto-escalation |
| 13 | Departments | departments, teams | Org hierarchy |
| 14 | Workforce (WFM) | agent_status, shifts | Presence, roster, forecast |
| 15 | Contact Centre | calls, queues | IVR/ACD/monitoring dashboards |
| 16 | Cloud Telephony | numbers, calls, cdr | DID, IVR, masking, dialer, CDR |
| 17 | Field Service | service_visits | On-site visits & technicians |
| 18 | Priority Matrix | (config on sla) | Urgency × impact → P1–P4 |
| 19 | Campaigns | campaigns | WhatsApp broadcasts |
| 20 | Surveys & VoC | surveys | CSAT/NPS/CES |
| 21 | Customer Journey | (aggregates) | Lifecycle map |
| 22 | Customer 360 | contacts, orders | Unified customer profile |
| 23 | Self-Service Portal | kb_articles, tickets | Customer-facing help centre |
| 24 | Auto QA | qa_audits | 100% interaction scoring |
| 25 | Analytics / Audit / Billing / Settings | reports, audit_logs, subscriptions, users, roles | Admin & insights |

---

## 2. Architecture

Multi-tenant SaaS. One codebase, many client companies (tenants), each fully isolated.

```
                       ┌─────────────────────────────────────────────┐
   Customers           │                 EDGE / CDN                   │
   WhatsApp ─┐         │      CloudFront + WAF + TLS (ACM)            │
   Voice ────┤         └───────────────┬─────────────────────────────┘
   Web chat ─┤                         │
   IG/FB/X ──┤            ┌────────────▼────────────┐   ┌──────────────┐
   Google ───┘            │   API Gateway / ALB     │   │  React SPA   │
                          └───────┬─────────┬───────┘   │ (S3+CDN)     │
                                  │         │           └──────────────┘
              ┌───────────────────▼──┐   ┌──▼──────────────────┐
              │  Core API (NestJS)   │   │  Channel Gateways    │
              │  auth, tenants,      │   │  whatsapp / telephony│
              │  tickets, sla, etc.  │   │  meta / email        │
              └───┬───────┬──────────┘   └──────┬──────────────┘
                  │       │                     │
         ┌────────▼─┐ ┌───▼────┐        ┌───────▼────────┐
         │ Postgres │ │ Redis  │        │ Message bus     │
         │ (RLS)    │ │ cache/ │        │ (Redis streams  │
         │ +pgvector│ │ queue  │        │  or SQS)        │
         └──────────┘ └────────┘        └───────┬────────┘
                                                │
                            ┌───────────────────▼───────────────────┐
                            │  Workers (BullMQ): SLA timers,         │
                            │  escalations, campaigns, QA scoring,   │
                            │  embeddings, webhooks retry            │
                            └───────────────────┬───────────────────┘
                                                │
                            ┌───────────────────▼───────────────────┐
                            │  AI services: RAG bot, STT/TTS,        │
                            │  sentiment, summarise (LLM providers)  │
                            └────────────────────────────────────────┘
   Object storage: S3 (recordings, media, exports)   Secrets: AWS Secrets Manager
```

**Principles.** Stateless API pods (scale horizontally). Postgres is the single source of truth with **Row-Level Security** as the tenant safety net. Redis for cache + queues. Long/async work (send message, SLA check, QA scoring, embeddings) always runs in **workers**, never in the request path. Every external channel comes in through a **channel gateway** that normalises messages to one internal shape.

---

## 3. Technology stack (pinned)

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Language (backend) | Node.js + TypeScript | Node 20 LTS, TS 5.x | one language across API + workers |
| Backend framework | NestJS | 10.x | modular, DI, guards for RBAC |
| Frontend | React + TypeScript + Vite | React 18, Vite 5 | port from prototype |
| Styling | Tailwind CSS | 3.x | tokens in §16 |
| DB | PostgreSQL | 16 | RLS + JSONB |
| Vector | pgvector | 0.7+ | KB embeddings (RAG) |
| Cache/queue | Redis | 7.x | + BullMQ 5 for jobs |
| ORM/migrations | Prisma | 5.x | typed models + migrate |
| Auth | Keycloak (self-host) *or* Auth0 | latest | OIDC; do not hand-roll |
| Object storage | AWS S3 | — | recordings, media |
| Container | Docker | 24+ | |
| Orchestration | Kubernetes (EKS) *or* ECS Fargate | 1.29 | start ECS, grow to EKS |
| IaC | Terraform | 1.7+ | all cloud resources |
| CI/CD | GitHub Actions | — | build→test→deploy |
| Observability | OpenTelemetry + Grafana/Loki/Tempo, or Datadog | — | logs, metrics, traces |
| LLM | Anthropic Claude / Azure OpenAI (via Bedrock/Azure India) | — | RAG + summarise |
| STT/TTS (Indian langs) | Sarvam AI / Google STT / Deepgram + ElevenLabs | — | Hindi + regional |
| WhatsApp | Meta Cloud API (direct) or BSP (Gupshup/AiSensy) | — | §13.1 |
| Telephony | Exotel / Ozonetel (SIP+API) | — | §13.2 |
| Email | AWS SES (in) + IMAP/SES (out) | — | |

> **Alternative:** if the team is Python-first, swap NestJS→FastAPI and Prisma→SQLAlchemy+Alembic. Everything else is identical. Pick one and do not mix.

---

## 4. Repository layout (monorepo)

```
astronomiq-cx/
├── apps/
│   ├── api/                 # NestJS core API
│   ├── workers/             # BullMQ job processors
│   ├── gateways/            # channel webhook receivers (whatsapp, telephony, meta, email)
│   └── web/                 # React SPA (the UI)
├── packages/
│   ├── db/                  # Prisma schema, migrations, seed
│   ├── shared/              # types, DTOs, constants (shared FE+BE)
│   └── config/              # env schema, eslint, tsconfig base
├── infra/
│   ├── terraform/           # all AWS resources
│   ├── k8s/                 # manifests / helm
│   └── docker/              # Dockerfiles, docker-compose.yml
├── docs/                    # this guide + ADRs
├── .github/workflows/       # CI/CD
├── package.json             # pnpm workspaces
└── turbo.json               # Turborepo pipeline
```

Use **pnpm workspaces + Turborepo**. One `pnpm install` at root. Shared types live in `packages/shared` and are imported by both `web` and `api` so the frontend and backend never drift.

---

## 5. Environment & secrets

Every service reads config from env. Never commit secrets — use `.env` locally and **AWS Secrets Manager** in cloud. Validate env at boot (fail fast).

`.env` reference (see full list in Appendix A):

```bash
# core
NODE_ENV=production
API_PORT=4000
APP_URL=https://app.astronomiq.in
# database
DATABASE_URL=postgresql://aq:PASS@db-host:5432/astronomiq?schema=public
# redis
REDIS_URL=redis://redis-host:6379
# auth (keycloak/oidc)
OIDC_ISSUER=https://auth.astronomiq.in/realms/astronomiq
OIDC_CLIENT_ID=aq-api
OIDC_CLIENT_SECRET=xxxxx
JWT_SECRET=change-me-32bytes-min
# storage
S3_BUCKET=astronomiq-media-apsouth1
AWS_REGION=ap-south-1
# whatsapp (meta cloud api)
WA_PHONE_NUMBER_ID=xxxx
WA_ACCESS_TOKEN=xxxx
WA_VERIFY_TOKEN=aq-verify-xyz
WA_APP_SECRET=xxxx
# telephony (exotel)
EXOTEL_SID=shopnova1
EXOTEL_API_KEY=xxxx
EXOTEL_API_TOKEN=xxxx
EXOTEL_SUBDOMAIN=api.exotel.com
# llm
ANTHROPIC_API_KEY=xxxx      # or AZURE_OPENAI_*
# stt/tts
SARVAM_API_KEY=xxxx
```

Env validation (NestJS, `apps/api/src/config/env.ts`):

```ts
import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  S3_BUCKET: z.string(),
  AWS_REGION: z.string().default('ap-south-1'),
  WA_ACCESS_TOKEN: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env); // throws on boot if invalid
```

---

## 6. Database schema (PostgreSQL) — complete DDL

Every business table carries `tenant_id uuid not null`. This is non-negotiable. Below is the core schema as raw SQL; the Prisma equivalent lives in `packages/db/schema.prisma` (same fields).

```sql
-- extensions
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ============ IDENTITY & TENANCY ============
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  subdomain text unique not null,
  plan text not null default 'business',
  status text not null default 'active',       -- active | suspended
  data_region text not null default 'ap-south-1',
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,                            -- Admin, Manager, TeamLead, Agent, QA, Viewer
  permissions jsonb not null default '[]',       -- ['ticket.view.all','refund.approve',...]
  unique(tenant_id, name)
);

create table departments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  head_user_id uuid
);

create table teams (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  department_id uuid references departments(id),
  name text not null,
  lead_user_id uuid
);

create table users (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text not null,
  oidc_subject text,                             -- id from Keycloak/Auth0 (no local password)
  role_id uuid references roles(id),
  department_id uuid references departments(id),
  team_id uuid references teams(id),
  status text not null default 'active',
  last_login timestamptz,
  unique(tenant_id, email)
);

-- ============ CUSTOMERS & CONVERSATIONS ============
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text, phone text, email text,
  language text default 'en',
  loyalty_tier text, lifetime_value numeric default 0,
  segment text,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id),
  ext_ref text,               -- ZK-483920
  description text, amount numeric, status text,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id),
  channel text not null,      -- whatsapp|chat|email|voice|instagram|facebook|x
  status text not null default 'open',
  sentiment text,             -- pos|neu|neg
  assigned_user_id uuid references users(id),
  department_id uuid references departments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on conversations(tenant_id, status);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null,  -- customer|bot|agent
  sender_id uuid,
  body text, media_url text,
  created_at timestamptz not null default now()
);
create index on messages(conversation_id, created_at);

-- ============ TICKETS ============
create table tickets (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ext_ref text,               -- ZK-T-4821 (human id)
  contact_id uuid references contacts(id),
  conversation_id uuid references conversations(id),
  subject text not null,
  description text,
  priority text not null default 'p3',   -- p1|p2|p3|p4
  category text,
  status text not null default 'new',    -- new|in_progress|waiting|resolved|closed
  assigned_user_id uuid references users(id),
  department_id uuid references departments(id),
  sla_policy_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tickets(tenant_id, status);

-- ============ SLA & ESCALATION ============
create table business_hours (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  weekly jsonb not null,      -- {"mon":["09:00","21:00"], ...}
  holidays jsonb not null default '[]'
);

create table sla_policies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  priority text, channel text, segment text,
  department_id uuid references departments(id),
  first_response_mins int not null,
  resolution_mins int not null,
  business_hours_id uuid references business_hours(id)
);

create table sla_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  kind text not null,         -- first_response | resolution
  target_at timestamptz not null,
  met_at timestamptz,
  breached boolean not null default false
);
create index on sla_events(tenant_id, target_at) where met_at is null;

create table escalation_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  level int not null,         -- 1..4
  trigger_after_mins int not null,
  escalate_to_role text,      -- 'manager' | 'dept_head' | 'regional_lead'
  department_id uuid references departments(id)
);

create table escalations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  level int not null,
  escalated_to_user_id uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);

-- ============ AI / KNOWLEDGE ============
create table kb_articles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category text, title text not null, body text not null,
  language text default 'en', status text default 'published', version int default 1,
  created_at timestamptz not null default now()
);

create table kb_embeddings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  article_id uuid not null references kb_articles(id) on delete cascade,
  chunk text not null,
  embedding vector(1536)
);
create index on kb_embeddings using ivfflat (embedding vector_cosine_ops);

create table macros (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text, category text, body text, uses int default 0
);

create table agent_flows (   -- no-code bot flows
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text, definition jsonb not null, status text default 'draft'
);

create table rules (         -- automations
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text, enabled boolean default true,
  trigger text, conditions jsonb, actions jsonb, runs int default 0
);

-- ============ CHANNELS & TELEPHONY ============
create table channels (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,         -- whatsapp|instagram|email|voice|...
  config jsonb not null,      -- encrypted credentials ref
  status text default 'connected'
);

create table numbers (       -- telephony DIDs
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number text not null, type text, mapped_to text, status text default 'active'
);

create table calls (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  direction text, from_num text, to_num text, virtual_num text,
  agent_id uuid references users(id), contact_id uuid references contacts(id),
  duration_s int, disposition text, recording_url text,
  transcript text, sentiment text,
  ticket_id uuid references tickets(id),
  created_at timestamptz not null default now()
);

-- ============ ENGAGE / VoC / OPS ============
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text, segment text, template text, status text,
  sent int default 0, delivered int default 0, read int default 0, replied int default 0
);

create table surveys (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ticket_id uuid references tickets(id),
  type text,                  -- csat|nps|ces
  score numeric, comment text, created_at timestamptz default now()
);

create table service_visits (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id),
  kind text, address text, slot timestamptz,
  technician text, status text
);

create table qa_audits (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid, call_id uuid,
  score int, breakdown jsonb, flagged boolean default false
);

-- ============ GOVERNANCE ============
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid, action text, entity text, details jsonb,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan text, seats int, usage jsonb, cycle_start date, cycle_end date
);
```

---

## 7. Multi-tenancy & Row-Level Security (the safety net)

Every request resolves a tenant, then sets it on the DB session. RLS makes Postgres itself refuse cross-tenant reads even if application code has a bug.

**Enable RLS on every business table** (repeat for each):

```sql
alter table tickets enable row level security;
create policy tenant_isolation on tickets
  using (tenant_id = current_setting('app.tenant', true)::uuid)
  with check (tenant_id = current_setting('app.tenant', true)::uuid);
-- ...repeat for conversations, messages, contacts, sla_events, etc.
```

**Resolve tenant from subdomain** (NestJS middleware, runs first):

```ts
// apps/api/src/tenancy/tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}
  async use(req: Request, _res: Response, next: NextFunction) {
    const host = req.headers['x-forwarded-host'] as string || req.hostname;
    const sub = host.split('.')[0];              // shopnova.app.astronomiq.in -> shopnova
    const tenant = await this.prisma.tenant.findUnique({ where: { subdomain: sub }});
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Workspace not found');
    (req as any).tenantId = tenant.id;
    next();
  }
}
```

**Set the tenant on every DB connection** (Prisma middleware wrapping each query in a transaction that sets `app.tenant`):

```ts
// apps/api/src/prisma/tenant-scope.ts
export async function withTenant<T>(prisma: PrismaClient, tenantId: string, fn: (tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant = '${tenantId}'`);
    return fn(tx);
  });
}
```

Call `withTenant(prisma, req.tenantId, tx => tx.ticket.findMany())` in services. RLS does the rest. **Test it:** a request scoped to tenant A can never read tenant B's rows — this is a mandatory integration test (§22).

---

## 8. Authentication, login IDs & RBAC

Do **not** build your own password store. Use **Keycloak** (self-hosted, one realm) or Auth0. AstronomiQ stores only the OIDC `subject` on `users`.

**The login-ID chain**
1. Super-Admin (you) creates a tenant + one Client-Admin user (§23 runbook).
2. Client-Admin invites teammates by email → an invite record + a Keycloak user with a one-time password-set link. The person sets their own password.
3. On login, Keycloak issues a JWT (access + refresh). API validates it and loads the local `users` row (role, department).

**JWT guard + RBAC** (NestJS):

```ts
// apps/api/src/auth/jwt.guard.ts  — validates OIDC token, attaches req.user
// apps/api/src/auth/permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>('perms', ctx.getHandler()) || [];
    const user = ctx.switchToHttp().getRequest().user; // {roleId, permissions:[]}
    return required.every(p => user.permissions.includes(p));
  }
}
// usage:
@Perms('ticket.assign') @Patch(':id/assign') assign() {...}
```

**Default roles & permissions** (seeded per tenant): `Admin` (all), `Manager` (dept scope + approvals), `TeamLead` (team queue + monitor), `Agent` (assigned work + Customer 360), `QA` (read + audits), `Viewer` (read dashboards). Permissions are strings like `ticket.view.all`, `refund.approve`, `sla.edit`, `user.invite`, `channel.connect`. Store on `roles.permissions` (JSONB) so clients can make custom roles with zero code change.

**2FA & SSO:** enable OTP in Keycloak for Admins; enable SAML/Google/Microsoft for enterprise tenants via Keycloak identity providers.

---

## 9. Realtime (WebSocket)

The inbox, live console and Command Centre need push updates. Use a WebSocket gateway backed by Redis pub/sub so it scales across pods.

```ts
// apps/api/src/realtime/rt.gateway.ts (NestJS + socket.io + redis adapter)
@WebSocketGateway({ cors: true })
export class RtGateway {
  @WebSocketServer() server: Server;
  emitToTenant(tenantId: string, event: string, payload: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
// on new message: rt.emitToTenant(tenantId, 'message.created', msg)
// frontend subscribes to rooms `tenant:{id}` after auth
```

---

## 10. Backend API — the worked example (Tickets), then the map

Build **every** module exactly like this Tickets example. It shows the full stack: DTO → service (tenant-scoped) → controller → test. Copy the shape for Contacts, Conversations, Campaigns, KB, Surveys, Departments, Numbers, etc.

**DTOs** (`packages/shared/dto/ticket.ts`):

```ts
export interface CreateTicketDto {
  subject: string; description?: string;
  contactId?: string; priority?: 'p1'|'p2'|'p3'|'p4';
  category?: string; departmentId?: string;
}
export interface MoveTicketDto { status: 'new'|'in_progress'|'waiting'|'resolved'|'closed'; }
```

**Service** (`apps/api/src/tickets/tickets.service.ts`):

```ts
@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService, private sla: SlaService,
              private audit: AuditService, private rt: RtGateway) {}

  async create(tenantId: string, userId: string, dto: CreateTicketDto) {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const ext = await nextRef(tx, tenantId, 'ZK-T-');       // human id
      const priority = dto.priority ?? await priorityFromMatrix(dto);
      const t = await tx.ticket.create({ data: {
        tenantId, extRef: ext, subject: dto.subject, description: dto.description,
        contactId: dto.contactId, priority, category: dto.category,
        departmentId: dto.departmentId, status: 'new',
      }});
      await this.sla.startTimers(tx, tenantId, t);             // creates sla_events
      await this.audit.log(tenantId, userId, 'ticket.create', 'ticket', { id: t.id });
      this.rt.emitToTenant(tenantId, 'ticket.created', t);
      return t;
    });
  }

  async move(tenantId: string, userId: string, id: string, dto: MoveTicketDto) {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const t = await tx.ticket.update({ where: { id }, data: { status: dto.status, updatedAt: new Date() }});
      if (dto.status === 'resolved') await this.sla.markResolved(tx, tenantId, id);
      await this.audit.log(tenantId, userId, 'ticket.move', 'ticket', { id, status: dto.status });
      this.rt.emitToTenant(tenantId, 'ticket.updated', t);
      return t;
    });
  }

  list(tenantId: string, filter: any) {
    return withTenant(this.prisma, tenantId, tx =>
      tx.ticket.findMany({ where: filter, orderBy: { createdAt: 'desc' } }));
  }
}
```

**Controller** (`apps/api/src/tickets/tickets.controller.ts`):

```ts
@Controller('tickets')
@UseGuards(JwtGuard, PermissionsGuard)
export class TicketsController {
  constructor(private svc: TicketsService) {}
  @Perms('ticket.view.all') @Get() list(@Req() r) { return this.svc.list(r.tenantId, r.query.filter ?? {}); }
  @Perms('ticket.create')  @Post() create(@Req() r, @Body() dto: CreateTicketDto) { return this.svc.create(r.tenantId, r.user.id, dto); }
  @Perms('ticket.move')    @Patch(':id/move') move(@Req() r, @Param('id') id, @Body() dto: MoveTicketDto) { return this.svc.move(r.tenantId, r.user.id, id, dto); }
}
```

**REST conventions (apply to all modules):** `GET /resource` (list, filterable), `GET /resource/:id`, `POST /resource`, `PATCH /resource/:id`, `DELETE /resource/:id` (soft delete → set `status='archived'`, never hard-delete customer data). All under `/api/v1`. All return `{ data, meta }`. All protected by `JwtGuard + PermissionsGuard`. All tenant-scoped via `withTenant`.

**Endpoint map (build each like Tickets):**

| Module | Base route | Extra endpoints |
|---|---|---|
| Conversations | `/conversations` | `POST /:id/reply`, `PATCH /:id/assign`, `PATCH /:id/resolve` |
| Contacts (C360) | `/contacts` | `GET /:id/orders`, `GET /:id/tickets`, `GET /:id/timeline` |
| SLA | `/sla/policies` | `GET /sla/scorecard?by=exec|dept`, `GET /sla/breaches` |
| Departments | `/departments`, `/teams` | `GET /:id/executives` |
| Automations | `/rules` | `PATCH /:id/toggle` |
| KB | `/kb/articles` | `POST /kb/search` (RAG) |
| Macros | `/macros` | — |
| Campaigns | `/campaigns` | `POST /:id/send` |
| Surveys | `/surveys` | `GET /surveys/summary` |
| Telephony | `/telephony/numbers`, `/telephony/calls` | `POST /telephony/click-to-call`, `POST /telephony/mask` |
| Social | `/mentions` | `POST /:id/reply`, `POST /:id/escalate`, `POST /:id/ticket` |
| WFM | `/agents/status`, `/shifts` | `PATCH /agents/:id/status` |
| Field Service | `/service-visits` | `PATCH /:id/status` |
| QA | `/qa/audits` | — |
| Billing | `/billing/usage`, `/billing/invoices`, `/plans` | — |
| Audit | `/audit` | (read-only) |

---

## 11. AI layer

### 11.1 RAG chatbot (Astra)

Answers customers from the tenant's KB. Flow: embed KB on save → at query time, embed the question, vector-search top chunks, ask the LLM with those chunks as context, return answer + decide escalate.

**Embed on article save** (worker job):

```ts
// apps/workers/src/jobs/embed-article.ts
export async function embedArticle(tenantId: string, articleId: string) {
  const article = await getArticle(tenantId, articleId);
  const chunks = chunkText(article.body, 500);         // ~500 token chunks
  for (const chunk of chunks) {
    const [emb] = await embed([chunk]);                // provider embeddings API
    await withTenant(prisma, tenantId, tx => tx.$executeRawUnsafe(
      `insert into kb_embeddings (tenant_id, article_id, chunk, embedding)
       values ($1,$2,$3,$4)`, tenantId, articleId, chunk, toVector(emb)));
  }
}
```

**Answer a question** (`apps/api/src/ai/rag.service.ts`):

```ts
async answer(tenantId: string, question: string, lang = 'en') {
  const [q] = await embed([question]);
  const ctx = await withTenant(this.prisma, tenantId, tx => tx.$queryRawUnsafe(
    `select chunk from kb_embeddings
     where tenant_id=$1 order by embedding <=> $2 limit 5`, tenantId, toVector(q)));
  const prompt = `You are Astra, ShopNova's support assistant. Answer ONLY from the context.
If unsure or the issue needs a human, reply exactly "ESCALATE". Reply in ${lang}.
Context:\n${ctx.map(c=>c.chunk).join('\n---\n')}\n\nQuestion: ${question}`;
  const out = await llm.complete(prompt);              // Claude/Azure OpenAI
  const escalate = out.trim() === 'ESCALATE';
  return { answer: escalate ? null : out, escalate };
}
```

**Escalation → ticket:** if `escalate`, create a conversation assigned to a human and (for tough/negative) auto-create a ticket — exactly the Conversation-Hub flow in the prototype.

### 11.2 Voice bot pipeline

`Telephony (SIP/stream) → STT (Sarvam/Google, Indian langs) → RAG/LLM → TTS (ElevenLabs/Sarvam) → back to caller`. Barge-in supported. Store transcript + sentiment on `calls`. Latency budget: keep round-trip < 1.2s; the telephony leg quality matters most (use Exotel/Ozonetel SIP or a streaming-capable provider).

### 11.3 Sentiment, summary, auto-QA, translation

Small LLM calls in workers after each conversation/call closes: `summarise`, `sentiment (pos/neu/neg)`, `qa_score (0–100 against a rubric)`, `translate` for Hindi/regional. Persist to the relevant table. Never block the customer on these.

### 11.4 Indian languages

Detect language on first message (Sarvam/`franc`); route through a model strong on Hindi/Hinglish and regional (Sarvam AI for Indian languages, or LLM with the language pinned in the prompt). Store `contacts.language` and reply in kind.

---

_(Part 2 continues: channel integrations, SLA engine code, automations engine, frontend build, deployment, CI/CD, testing, runbooks, cost, appendices.)_

---

## 12. SLA & Escalation engine (full)

The SLA engine is the piece that must be exactly right. Two parts: (a) start timers when a ticket is created, honouring business hours; (b) a worker that ticks and fires escalations on breach.

**Start timers** (`apps/api/src/sla/sla.service.ts`):

```ts
async startTimers(tx, tenantId: string, ticket) {
  const policy = await pickPolicy(tx, tenantId, ticket);        // match by priority/channel/segment/dept
  const bh = await tx.businessHours.findUnique({ where: { id: policy.businessHoursId }});
  const frAt  = addBusinessMinutes(new Date(), policy.firstResponseMins, bh);
  const resAt = addBusinessMinutes(new Date(), policy.resolutionMins, bh);
  await tx.ticket.update({ where: { id: ticket.id }, data: { slaPolicyId: policy.id }});
  await tx.slaEvent.createMany({ data: [
    { tenantId, ticketId: ticket.id, kind: 'first_response', targetAt: frAt },
    { tenantId, ticketId: ticket.id, kind: 'resolution',     targetAt: resAt },
  ]});
}
```

`addBusinessMinutes` walks the `weekly` schedule + `holidays`, skipping non-working time (use `luxon` in `Asia/Kolkata`). When a ticket goes to `waiting` (on customer), pause: store elapsed and recompute `targetAt` on resume.

**Breach + escalation worker** (runs every 60s, `apps/workers/src/jobs/sla-sweep.ts`):

```ts
export async function slaSweep() {
  const tenants = await allActiveTenants();
  for (const t of tenants) {
    await withTenant(prisma, t.id, async (tx) => {
      const now = new Date();
      // 1) mark breaches
      const due = await tx.slaEvent.findMany({ where: { metAt: null, breached: false, targetAt: { lt: now }}});
      for (const e of due) {
        await tx.slaEvent.update({ where: { id: e.id }, data: { breached: true }});
        await runEscalation(tx, t.id, e.ticketId, 'sla_breach');
        rt.emitToTenant(t.id, 'sla.breached', { ticketId: e.ticketId });
      }
      // 2) time-based escalation levels (L1..L4)
      const rules = await tx.escalationRule.findMany({ orderBy: { level: 'asc' }});
      const open = await tx.ticket.findMany({ where: { status: { in: ['new','in_progress'] }}});
      for (const tk of open) {
        const ageMin = (now.getTime() - tk.createdAt.getTime()) / 60000;
        for (const r of rules) {
          if (ageMin >= r.triggerAfterMins && !(await alreadyEscalated(tx, tk.id, r.level)))
            await escalateTo(tx, t.id, tk, r);   // find target user by role/dept, notify, write escalations row
        }
      }
    });
  }
}
```

**Escalation matrix** = the ordered `escalation_rules` (L1 assignee → L2 reporting manager → L3 department head → L4 escalations desk/regional lead), each with `triggerAfterMins`. Functional escalation = route to another `department_id`; hierarchical = route up by role. Notifications go via email + WhatsApp + in-app (WebSocket).

**Scorecards** (`GET /sla/scorecard?by=exec|dept`): aggregate `sla_events` grouped by `assigned_user_id` or `department_id`: assigned, met (`met_at not null`), breached, at-risk (`target_at within 2h`, not met), adherence = met/assigned. This is exactly the prototype's SLA scorecard.

---

## 13. Channel integrations

Each channel is a **gateway** service that (1) verifies the provider's webhook, (2) normalises the payload into an internal `messages`/`calls` record, (3) drops it on the bus. Outbound goes the reverse way through a provider client.

### 13.1 WhatsApp (Meta Cloud API)

**India facts your dev must know (2026):** billing is **per delivered template message** (from Jul 2025), India billed in **INR** from Jan 2026 — roughly **₹1.09 marketing, ₹0.145 utility/authentication per message**; **service messages (customer-initiated, inside the 24-hour window) are free**; **18% GST** on top; **no DLT registration** needed for WhatsApp (unlike SMS). Design flows so the customer messages first (keeps the 24h service window free).

**Webhook verify + receive** (`apps/gateways/src/whatsapp/wa.controller.ts`):

```ts
@Get('webhook')  // Meta verification handshake
verify(@Query() q, @Res() res) {
  if (q['hub.mode']==='subscribe' && q['hub.verify_token']===env.WA_VERIFY_TOKEN)
    return res.send(q['hub.challenge']);
  return res.status(403).send();
}

@Post('webhook')
async receive(@Req() req, @Res() res) {
  verifySignature(req.rawBody, req.headers['x-hub-signature-256'], env.WA_APP_SECRET); // HMAC
  const change = req.body.entry?.[0]?.changes?.[0]?.value;
  const msg = change?.messages?.[0];
  if (msg) {
    const tenantId = await tenantForWaNumber(change.metadata.phone_number_id);
    await ingestInbound(tenantId, {
      channel: 'whatsapp', from: msg.from, body: msg.text?.body, mediaUrl: mediaOf(msg),
    });                                  // → creates conversation+message, triggers bot
  }
  res.sendStatus(200);                   // ALWAYS 200 fast; process async
}
```

**Send** (client): `POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages` with the access token; free-form inside the 24h window, template outside it. Store the message + delivery status callbacks.

**BSP option:** if you prefer not to manage Meta directly, use a BSP (Gupshup/AiSensy/Wati) — same gateway shape, their webhook + send API. Their platform fee sits on top of Meta's per-message cost.

### 13.2 Cloud Telephony (Exotel / Ozonetel)

**Inbound call flow:** caller dials a virtual **DID** → provider hits your **webhook** → you return the next IVR step (or connect to a queue) → provider streams audio to your **WebSocket** for Voice AI → on hangup you get a **status callback** with the CDR → store `calls` row + recording URL + auto-create ticket.

**Exotel inbound webhook** (`apps/gateways/src/telephony/exotel.controller.ts`):

```ts
@Post('exotel/incoming')          // configured as the DID's "call flow" applet passthru
async incoming(@Body() b) {
  const tenantId = await tenantForNumber(b.To);          // the virtual number
  const contact  = await matchContact(tenantId, b.CallFrom);
  // decide routing: IVR digit, business hours, sticky agent
  const agent = await stickyAgentFor(tenantId, contact) ?? await acdPick(tenantId, deptFromDigit(b.digits));
  return exotelResponse({ connectTo: agent?.exotelSip, record: true, streamUrl: env.WA_... });
}

@Post('exotel/status')            // fired at call end
async status(@Body() b) {
  const tenantId = await tenantForNumber(b.To);
  await withTenant(prisma, tenantId, tx => tx.call.create({ data: {
    tenantId, direction: b.Direction, fromNum: b.CallFrom, toNum: b.To, virtualNum: b.To,
    durationS: +b.CallDuration, recordingUrl: b.RecordingUrl, disposition: b.Status,
  }}));
}
```

**Number masking** (two-party bridge — big for delivery/marketplaces): call the provider's Click-to-Call/Connect API with A-party + B-party + your virtual number; it rings A, then bridges B; **both parties see only the virtual number**; the CDR stores both real legs securely.

```ts
async mask(tenantId, aNum, bNum) {
  const vn = await maskingNumber(tenantId);
  return exotel.post('/Calls/connect', { From: aNum, To: bNum, CallerId: vn, Record: true });
}
```

**Outbound dialer:** preview / progressive / predictive modes drive a worker that calls Click-to-Call per contact in a campaign (respect DND / DLT for SMS legs). **Click-to-call** (`POST /telephony/click-to-call`) connects agent then customer, shows the virtual number.

**Providers:** Exotel and Ozonetel are the India defaults (mature IVR, masking, DLT handling, CRM connectors); Plivo/Twilio for engineering-led/global; all fit the same gateway shape.

### 13.3 Email, Meta (IG/FB), Social listening, Web chat

- **Email:** inbound via AWS SES → SNS → gateway (parse, thread by `In-Reply-To`); outbound via SES.
- **Instagram/Facebook:** Meta Graph webhooks (comments, DMs, mentions) → same `ingestInbound`. **Conversation Hub** subscribes to comments/mentions, runs the bot to auto-reply, escalates negative ones, auto-creates tickets on tough issues (prototype behaviour).
- **Google:** Business Profile reviews via the Google Business Profile API (poll or Pub/Sub) → mentions.
- **X (Twitter):** filtered stream / mentions API → mentions.
- **Web chat widget:** a small embeddable JS widget (`apps/web/widget`) opening a WebSocket to the RT gateway; same conversation model.

Each new mention row carries `source`, `sentiment`, `stage` (detected→bot_replied→escalated→ticket) — this powers the Conversation Hub pipeline exactly as in the prototype.

---

## 14. Automations (business-rules engine)

A generic trigger→condition→action evaluator, run on ticket/conversation events.

```ts
// apps/workers/src/rules/engine.ts
export async function runRules(tenantId, event) {         // event: {type:'ticket.created', ticket}
  const rules = await enabledRules(tenantId, event.type);
  for (const r of rules) {
    if (matchConditions(r.conditions, event)) {           // e.g. {field:'segment',op:'eq',value:'gold'}
      for (const a of r.actions) await applyAction(tenantId, a, event); // setPriority, assignDept, escalate, sendSms, addTag
      await incrementRuns(tenantId, r.id);
    }
  }
}
```

Conditions/actions are JSON (stored on `rules`), so the no-code builder in the UI writes rules with no deploy. Examples ship as seeds: *VIP fast-track*, *payment failure → P1*, *negative social → escalate*, *auto-close resolved*, *delivery delay → proactive SMS*.

---

## 15. Background jobs (BullMQ)

Queues (`apps/workers`): `sla-sweep` (cron 60s), `escalations`, `embeddings`, `send-message`, `campaign-blast`, `qa-scoring`, `webhook-retry`, `usage-metering`. Each is idempotent and retried with backoff. Run workers as a **separate deployment** from the API so heavy jobs never slow requests.

---

## 16. Frontend — building the UI from the prototype

**The prototype `AstronomiQ-CX.html` is the exact UI.** Port it to React (Vite + TS + Tailwind). Approach:

1. **Design tokens** → `tailwind.config.js` from the prototype's CSS vars:
   ```js
   theme:{extend:{colors:{
     bg:'#EEF3FB', card:'#FFFFFF', line:'#E3EAF4',
     blue:'#2563EB', sky:'#0EA5E9', indigo:'#4F46E5',
     green:'#16A34A', amber:'#E08A00', red:'#E23A3A', pink:'#DB2777',
     text:'#15213B', muted:'#5C6B87',
   }, fontFamily:{ disp:['Space Grotesk'], sans:['Inter'], mono:['Space Mono'] }}}
   ```
2. **Routing** (React Router): one route per module — `/overview`, `/inbox`, `/conversations`, `/tickets`, `/sla`, `/telephony`, `/departments`, `/workforce`, … matching the prototype's `data-view` names. Auth-guarded layout with the sidebar.
3. **Component structure:** `AppShell` (sidebar + topbar), then a folder per module: `modules/tickets/{TicketsBoard.tsx, useTickets.ts, api.ts}`. Each prototype view = one page component; each render function = a child component.
4. **Data layer:** **TanStack Query** for server state (`useQuery`/`useMutation` against `/api/v1/...`), **socket.io-client** for realtime (subscribe to `tenant:{id}` room, invalidate queries on `ticket.updated` etc.). Replace the prototype's dummy arrays with these hooks — the JSX stays almost identical.
5. **Forms:** react-hook-form + zod (reuse the DTOs from `packages/shared`).
6. **Charts:** the prototype hand-draws SVG; keep them, or swap to Recharts.
7. **Self-service portal & chat widget** are separate small React bundles (public, unauthenticated) reading the same public APIs.

Rule of thumb: **one prototype `render*()` function → one React component; one dummy array → one API hook.** The visual output must match the prototype exactly.

---

## 17. Local development

`infra/docker/docker-compose.yml`:

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment: { POSTGRES_USER: aq, POSTGRES_PASSWORD: aq, POSTGRES_DB: astronomiq }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev
    environment: { KEYCLOAK_ADMIN: admin, KEYCLOAK_ADMIN_PASSWORD: admin }
    ports: ["8080:8080"]
  api:
    build: { context: ../.., dockerfile: infra/docker/api.Dockerfile }
    env_file: ../../.env
    depends_on: [db, redis]
    ports: ["4000:4000"]
  workers:
    build: { context: ../.., dockerfile: infra/docker/workers.Dockerfile }
    env_file: ../../.env
    depends_on: [db, redis]
  web:
    build: { context: ../.., dockerfile: infra/docker/web.Dockerfile }
    ports: ["3000:3000"]
volumes: { pgdata: {} }
```

Bring-up: `pnpm install` → `docker compose up -d db redis keycloak` → `pnpm --filter db migrate:dev` → `pnpm --filter db seed` → `pnpm --filter api dev` + `pnpm --filter workers dev` + `pnpm --filter web dev`. App at `http://localhost:3000`.

**API Dockerfile** (`infra/docker/api.Dockerfile`):

```dockerfile
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile && pnpm --filter api build
EXPOSE 4000
CMD ["node","apps/api/dist/main.js"]
```

---

## 18. Cloud deployment (AWS Mumbai, `ap-south-1`)

Host in India for DPDP data residency. Two options — start with **A (ECS Fargate)**, move to **B (EKS)** at scale.

**Managed building blocks (create with Terraform in `infra/terraform`):**
- **RDS PostgreSQL 16** (Multi-AZ, `pgvector` via parameter group), automated backups + PITR.
- **ElastiCache Redis** (cluster mode).
- **S3** buckets: `media` (recordings/attachments), `exports`. Block public access; server-side encryption (SSE-KMS).
- **ECR** for images.
- **Secrets Manager** for all secrets (referenced by task defs).
- **ACM** cert + **Route 53** (`*.app.astronomiq.in` wildcard for tenant subdomains).
- **CloudFront + WAF** in front of the SPA and API.
- **SES** (email), **KMS** (encryption keys).

**Option A — ECS Fargate (recommended start):**
- Services: `api`, `workers`, `gateways` (each a Fargate service, auto-scaled on CPU/RPS), behind an **ALB**. The **web** SPA is static → S3 + CloudFront.
- Terraform sketch:
  ```hcl
  resource "aws_ecs_cluster" "aq" { name = "astronomiq" }
  resource "aws_ecs_service" "api" {
    name = "api"; cluster = aws_ecs_cluster.aq.id
    task_definition = aws_ecs_task_definition.api.arn
    desired_count = 2
    load_balancer { target_group_arn = aws_lb_target_group.api.arn; container_name="api"; container_port=4000 }
    network_configuration { subnets = var.private_subnets; security_groups=[aws_security_group.api.id] }
  }
  # + task_definition pulling image from ECR, secrets from Secrets Manager, RDS/Redis endpoints as env
  ```

**Option B — EKS (Kubernetes)** at scale. `infra/k8s`:
```yaml
# api-deployment.yaml (excerpt)
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  replicas: 3
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      containers:
      - name: api
        image: <acct>.dkr.ecr.ap-south-1.amazonaws.com/aq-api:latest
        ports: [{ containerPort: 4000 }]
        envFrom: [{ secretRef: { name: aq-secrets } }]
        readinessProbe: { httpGet: { path: /health, port: 4000 }, initialDelaySeconds: 10 }
        resources: { requests: { cpu: 250m, memory: 512Mi }, limits: { cpu: "1", memory: 1Gi } }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api-hpa }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 3; maxReplicas: 20
  metrics: [{ type: Resource, resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 }}}]
```
Ingress via AWS Load Balancer Controller + ACM; secrets via External Secrets Operator → Secrets Manager.

**Migrations on deploy:** run `prisma migrate deploy` as a one-off ECS task / k8s Job before rolling out new app versions.

**DNS & tenant subdomains:** wildcard `*.app.astronomiq.in` → CloudFront/ALB. New tenant = new DB row; no DNS change needed (wildcard covers it).

---

## 19. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:

```yaml
name: build-test-deploy
on: { push: { branches: [main] } }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4 with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck
      - run: pnpm test            # unit + integration (spins ephemeral pg/redis)
      - run: pnpm build
  deploy:
    needs: ci
    runs-on: ubuntu-latest
    permissions: { id-token: write }   # OIDC to AWS, no static keys
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: arn:aws:iam::ACCT:role/gha-deploy, aws-region: ap-south-1 }
      - run: |
          docker build -t $ECR/aq-api:$GITHUB_SHA -f infra/docker/api.Dockerfile .
          docker push $ECR/aq-api:$GITHUB_SHA
      - run: aws ecs run-task ... prisma migrate deploy   # migrations
      - run: aws ecs update-service --cluster astronomiq --service api --force-new-deployment
      # web: build & sync to S3 + CloudFront invalidation
```

Branch strategy: `main` → production (auto), `develop` → staging. PRs run `ci` only. Every deploy is a new immutable image tagged by SHA; rollback = redeploy previous SHA.

---

## 20. Observability

- **Logs:** structured JSON (pino) → CloudWatch/Loki. Always include `tenantId`, `requestId`, `userId`.
- **Metrics:** OpenTelemetry → Prometheus/Grafana (or Datadog). Track: request latency, error rate, queue depth, SLA-sweep duration, WhatsApp/telephony webhook success, LLM latency/cost.
- **Traces:** OTel across API→worker→provider.
- **Alerts:** page on 5xx spike, queue backlog, DB CPU>80%, SLA-sweep lag, webhook failures, cert expiry.
- **Health:** `/health` (liveness) + `/ready` (DB+Redis check) on every service.

---

## 21. Security & compliance (India / DPDP)

**DPDP Act, 2023** — Rules notified 14 Nov 2025; phased, with **full compliance by ~13 May 2027**; penalties up to **₹250 crore**. You are a **Data Processor** for tenants (and a Data Fiduciary for your own staff data). Build these in from day one:

- **Data residency:** all data in `ap-south-1`. State it in contracts.
- **Encryption:** at rest **AES-256** (RDS/S3 with KMS), in transit **TLS 1.3** everywhere.
- **Access:** RBAC + least privilege; RLS; MFA for admins; no shared logins.
- **Consent & purpose limitation:** capture consent for messaging channels; use data only for support.
- **Data-subject rights:** endpoints to export and **erase** a contact's data (soft-delete then purge job); honour within 30 days.
- **Breach process:** notify the Data Protection Board + affected users within the required window; log detection.
- **Audit:** `audit_logs` for every sensitive action (refunds, role changes, exports, channel connects, deletes).
- **Grievance officer** + privacy policy per tenant.
- **PII handling:** mask phone/card in UI (as the prototype does); never log raw PII; redact in transcripts where possible.
- Pursue **ISO 27001** and **SOC 2** as you grow (enterprise clients ask for it).

WhatsApp does **not** require DLT; **SMS does** (register headers/templates with TRAI DLT).

---

## 22. Testing

- **Unit** (Vitest/Jest): services, SLA `addBusinessMinutes`, rules engine, priority matrix.
- **Integration** (against ephemeral Postgres+Redis in CI): controllers end-to-end, **and a mandatory tenant-isolation test**:
  ```ts
  it('never leaks across tenants', async () => {
    const a = await createTicket(tenantA); 
    const res = await api(tenantB).get('/tickets');       // scoped to B
    expect(res.body.data.find(t => t.id === a.id)).toBeUndefined(); // RLS blocks it
  });
  ```
- **Webhook tests:** replay real Meta/Exotel payloads → assert normalised records.
- **E2E** (Playwright): login → create ticket → move → resolve → CSAT; WhatsApp inbound → bot reply → escalate → ticket.
- **Load** (k6): 500 rps on hot endpoints; assert p95 < 300ms and SLA-sweep keeps up.
- **Contract:** shared DTOs guarantee FE/BE match; add a smoke test that hits `/health` post-deploy.

Target ≥ 70% coverage on services/engines. CI blocks merge on failing tests.

---

## 23. Runbook — onboard a new client (issue login IDs, connect channels)

Do this per client. Fully scripted (`packages/db/scripts/onboard.ts`) so it's one command.

1. **Create tenant:** insert `tenants` (name, subdomain, plan, region). Seed defaults: standard **roles**, starter **departments** (CX Ops, Payments, Returns, Logistics, Escalations), default **SLA policies** (P1–P4), **business hours** (9–21 IST), example **automations** & **macros**, KB starter articles.
2. **Create Client-Admin login:** create Keycloak user in the realm; create local `users` row (role=Admin); email a one-time set-password link. *(You never see their password.)*
3. **They invite their team:** Client-Admin uses Settings → Invite; each invite = Keycloak user + `users` row + set-password email, with role + department.
4. **Connect WhatsApp:** register the client's number on Meta Cloud API (or via BSP); set the webhook to `gateways/whatsapp/webhook`; store `channels` config (encrypted); verify with a test message.
5. **Connect telephony:** provision Exotel/Ozonetel DID(s); point the call-flow webhook to `gateways/telephony/exotel/incoming`; store `numbers` + `channels`; place a test call.
6. **Connect social/email:** OAuth the client's Meta/Google/X accounts; verify SES inbound.
7. **Configure:** they set SLA targets, escalation matrix, IVR flow, KB, macros in the UI. Embeddings build automatically.
8. **Go live:** flip tenant `status=active`; smoke-test each channel; hand over.

Everything above is UI-driven after step 2 — the client's admin does it themselves; you only run steps 1–2.

---

## 24. Runbook — add / delete / change anything

**Add a new module** (e.g. "Chat Surveys"):
1. Add table(s) to `schema.prisma` → `pnpm --filter db migrate:dev -n add_chat_surveys` (creates migration).
2. Add RLS policy for the new table (copy §7).
3. Scaffold the module folder in `apps/api` copying the **Tickets** pattern (service + controller + DTO + perms).
4. Add permission strings to default roles seed.
5. Add the React page + hook in `apps/web/modules/...`, add the route + sidebar item.
6. Add tests. Open PR → CI → merge → auto-deploy (migration runs first).

**Add a field** (e.g. `tickets.channel_source`):
1. Edit `schema.prisma`, `migrate:dev`. 2. Update the DTO in `packages/shared`. 3. Surface in the service + UI form. 4. Backfill via a one-off script if needed.

**Change an API:** version it. Never break `/api/v1`; add `/api/v2` for breaking changes and run both until clients migrate.

**Change a UI screen:** edit the React component (match the prototype's classes/tokens). Ship via the normal pipeline; static SPA re-deploys to S3/CloudFront with cache invalidation.

**Delete a module/field:** deprecate first (hide in UI, stop writing), keep data for the retention period, then a migration to drop after sign-off. **Never** hard-delete customer data without a DPDP-compliant erasure flow.

**Roll back a bad deploy:** redeploy the previous image SHA (`update-service` with old tag). DB migrations must be backward-compatible (expand-then-contract): add columns before using them; drop only after the old code is gone.

---

## 25. Go-live checklist

- [ ] Terraform applied; RDS Multi-AZ + backups + PITR verified
- [ ] Secrets in Secrets Manager; nothing in code/`.env` in repo
- [ ] RLS enabled + tenant-isolation test passing
- [ ] Auth (Keycloak) live; MFA on admins; SSO for enterprise tenants
- [ ] WhatsApp, telephony, email, social webhooks verified end-to-end
- [ ] SLA sweep + escalations firing on a test ticket
- [ ] Backups tested by a restore drill; DR runbook written
- [ ] Monitoring dashboards + alerts wired; on-call set
- [ ] DPDP: privacy policy, consent capture, erasure endpoint, audit log, data in `ap-south-1`
- [ ] Load test p95 < 300ms at target rps
- [ ] Rollback tested; staging mirrors prod

---

## 26. Cost & timeline (India, indicative)

**Team & timeline to first production release:** ~**5–7 months** with a small team — 1 tech lead, 2 backend, 1–2 frontend, 1 AI/integrations, 1 DevOps (part-time), 1 QA. Phase it: **MVP (inbox + tickets + WhatsApp bot + SLA + auth/tenancy) in ~10–12 weeks**, then telephony/voice, then social/field-service/analytics, then billing & self-service.

**Monthly run cost (early, one region):** AWS (RDS + Redis + Fargate + S3 + CloudFront) roughly **₹60k–₹1.5L** depending on load; **LLM/STT/TTS** usage-based; **WhatsApp** per-message (₹1.09 marketing / ₹0.145 utility, service free) + BSP fee if used; **telephony** per-minute + DID rental (Exotel ~₹1/credit). Model these per tenant and pass through in `subscriptions.usage` for billing.

**Pricing to clients:** tiered (Growth / Business / Enterprise) per the Billing module — per-seat + usage (conversations, WhatsApp, voice minutes), matching the prototype's plans.

---

## Appendix A — full `.env` reference

```
NODE_ENV, API_PORT, APP_URL, LOG_LEVEL
DATABASE_URL, DIRECT_URL (for migrations)
REDIS_URL
JWT_SECRET, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET
AWS_REGION, S3_BUCKET, S3_EXPORTS_BUCKET, KMS_KEY_ID
WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, WA_APP_SECRET
EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SUBDOMAIN
SES_REGION, SES_FROM
ANTHROPIC_API_KEY | AZURE_OPENAI_ENDPOINT+AZURE_OPENAI_KEY
EMBEDDINGS_MODEL, LLM_MODEL
SARVAM_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY
META_APP_ID, META_APP_SECRET, GOOGLE_BUSINESS_CREDENTIALS, X_BEARER_TOKEN
SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT
```

## Appendix B — API error shape

```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket not found", "requestId": "..." } }
```
HTTP: 400 validation, 401 unauthenticated, 403 no permission, 404 not found, 409 conflict, 422 business rule, 429 rate-limited, 5xx server. Every response carries `requestId` for tracing.

## Appendix C — glossary

DID (virtual number) · ACD (auto call distribution) · IVR (voice menu) · CDR (call detail record) · Number masking (two-party bridge hiding real numbers) · Sticky agent (route caller to last agent) · RLS (row-level security) · RAG (retrieval-augmented generation) · BSP (WhatsApp Business Solution Provider) · DLT (TRAI SMS registry) · DPDP (India Digital Personal Data Protection Act) · SLA (service-level agreement) · WEM/WFM (workforce engagement/management).

---

**End of document.** This is the complete blueprint. Build the repo per §4, follow §6–§16 for the app, §17–§19 to run and ship it, §21–§22 to secure and test it, and §23–§24 to operate and change it. The prototype `AstronomiQ-CX.html` is the UI you are matching.

---

## Appendix D — Reference implementations & specs (gap-closers)

Everything the main sections *refer to* but a developer would otherwise have to invent. With these, no design decision is left open.

### D.1 Load-bearing helper functions

**`addBusinessMinutes`** — the SLA clock. Adds N working minutes, skipping nights, weekends and holidays, in `Asia/Kolkata`. SLA correctness depends entirely on this.

```ts
// apps/api/src/sla/business-time.ts
import { DateTime } from 'luxon';
type BH = { timezone: string; weekly: Record<string,[string,string]|null>; holidays: string[] };
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];

export function addBusinessMinutes(from: Date, minutes: number, bh: BH): Date {
  let cur = DateTime.fromJSDate(from, { zone: bh.timezone });
  let left = minutes;
  let guard = 0;
  while (left > 0 && guard++ < 100000) {
    const dayKey = DAYS[cur.weekday % 7];               // luxon: 1=Mon..7=Sun
    const win = bh.weekly[dayKey];
    const isHoliday = bh.holidays.includes(cur.toISODate()!);
    if (!win || isHoliday) { cur = cur.plus({ days: 1 }).startOf('day'); continue; }
    const [openH, closeH] = win;
    const open  = cur.set({ hour:+openH.split(':')[0],  minute:+openH.split(':')[1],  second:0 });
    const close = cur.set({ hour:+closeH.split(':')[0], minute:+closeH.split(':')[1], second:0 });
    if (cur < open)  cur = open;                         // before hours → jump to open
    if (cur >= close){ cur = cur.plus({ days: 1 }).startOf('day'); continue; } // after hours → next day
    const availMin = close.diff(cur, 'minutes').minutes;
    if (left <= availMin) return cur.plus({ minutes: left }).toJSDate();
    left -= availMin; cur = cur.plus({ days: 1 }).startOf('day');
  }
  return cur.toJSDate();
}
```
Pause/resume (ticket → `waiting`): store `remainingMins = (targetAt - now)` in working minutes at pause; on resume, `targetAt = addBusinessMinutes(now, remainingMins, bh)`.

**`nextRef`** — human-friendly sequential IDs per tenant (`ZK-T-4821`). Use a per-tenant counter row to avoid gaps/races.

```ts
// apps/api/src/common/ref.ts
export async function nextRef(tx, tenantId: string, prefix: string): Promise<string> {
  const row = await tx.$queryRawUnsafe(
    `insert into ref_counters (tenant_id, prefix, seq) values ($1,$2,1)
     on conflict (tenant_id, prefix) do update set seq = ref_counters.seq + 1
     returning seq`, tenantId, prefix);
  return `${prefix}${row[0].seq}`;
}
```
Add table: `ref_counters (tenant_id uuid, prefix text, seq bigint, primary key(tenant_id,prefix))`.

**`priorityFromMatrix`** — the urgency × impact → P1–P4 rule (the Priority Matrix module). Urgency/impact come from keywords + customer tier.

```ts
// apps/api/src/tickets/priority.ts
const M = { // [urgency][impact]
  high:   { low:'p2', medium:'p1', high:'p1' },
  medium: { low:'p3', medium:'p2', high:'p1' },
  low:    { low:'p4', medium:'p3', high:'p2' },
};
export function priorityFromMatrix(dto: { text?: string; segment?: string }) {
  const t = (dto.text ?? '').toLowerCase();
  const urgency = /outage|not working|fraud|double charge|failed payment|locked/.test(t) ? 'high'
                : /delay|stuck|wrong|damaged|refund/.test(t) ? 'medium' : 'low';
  const impact  = dto.segment === 'gold' || dto.segment === 'vip' ? 'high'
                : /many|everyone|all users/.test(t) ? 'high' : 'medium';
  let p = M[urgency][impact];
  if ((dto.segment==='gold'||dto.segment==='vip') && p!=='p1')      // VIP bump one level up
    p = (['p4','p3','p2','p1'] as const)[Math.min(3, ['p4','p3','p2','p1'].indexOf(p)+1)];
  return p;
}
```

### D.2 JSON shapes (so the no-code builders are unambiguous)

**`rules` — conditions & actions catalogue** (`rules.conditions`, `rules.actions`):

```jsonc
// conditions (ALL must match; use {any:[...]} for OR)
{ "all": [
  { "field": "segment",   "op": "eq",       "value": "gold" },
  { "field": "channel",   "op": "in",       "value": ["whatsapp","voice"] },
  { "field": "text",      "op": "contains", "value": "refund" },
  { "field": "sentiment", "op": "eq",       "value": "neg" }
]}
// supported fields: segment, channel, text, sentiment, priority, category, department, language, ticketAgeMins, status
// supported ops: eq, ne, in, nin, contains, gt, lt
// actions (run in order)
[
  { "type": "setPriority",  "value": "p1" },
  { "type": "assignDept",   "value": "payments" },
  { "type": "assignUser",   "value": "<userId|round_robin|least_busy>" },
  { "type": "addTag",       "value": "vip" },
  { "type": "escalate",     "level": 2 },
  { "type": "sendMessage",  "channel": "sms", "template": "delay_apology" },
  { "type": "createTicket", "priority": "p2" },
  { "type": "notify",       "target": "manager" }
]
```

**`agent_flows.definition` and IVR flow** — a node graph. Same shape powers the chatbot Agent Builder and the telephony IVR (nodes differ by `type`).

```jsonc
{
  "start": "n1",
  "nodes": {
    "n1": { "type": "message", "text": "Namaste! How can I help?", "next": "n2" },
    "n2": { "type": "menu", "prompt": "Choose:", "options": [
              { "label": "Track order", "value": "1", "next": "n3" },
              { "label": "Talk to agent", "value": "0", "next": "n9" } ] },
    "n3": { "type": "action", "action": "lookupOrder", "next": "n4" },
    "n4": { "type": "condition", "if": "order.status=='delivered'", "then": "n5", "else": "n6" },
    "n5": { "type": "message", "text": "Delivered on {order.date}.", "next": "end" },
    "n6": { "type": "ai", "prompt": "Answer from KB about {order.ext_ref}", "escalateOn": "ESCALATE", "next": "end" },
    "n9": { "type": "handoff", "queue": "cx_ops" }
  }
}
// IVR-only node types add: "dial"(connect to agent/queue), "voicemail", "hours"(business-hours branch), "playAudio"
```
The flow interpreter walks nodes from `start`; `message/menu/ai` for chat, `dial/voicemail/hours/playAudio` for voice. Store as `jsonb`; the visual builder reads/writes this exact shape.

### D.3 Prisma schema

`packages/db/schema.prisma` mirrors the SQL in §6 one-to-one. Representative excerpt so the mapping is unambiguous; generate the rest the same way (every model gets `tenantId String` + an index):

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }

model Tenant {
  id        String   @id @default(uuid())
  name      String
  subdomain String   @unique
  plan      String   @default("business")
  status    String   @default("active")
  createdAt DateTime @default(now())
  users     User[]   @relation
}
model Ticket {
  id            String   @id @default(uuid())
  tenantId      String
  extRef        String?
  subject       String
  priority      String   @default("p3")
  status        String   @default("new")
  assignedUserId String?
  departmentId  String?
  slaPolicyId   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([tenantId, status])
}
// ...one model per table in §6. RLS is applied via raw SQL migration (Prisma doesn't manage RLS) — see D below.
```
RLS note: Prisma migrations don't create RLS policies, so add a plain-SQL migration (`prisma/migrations/xxxx_rls/migration.sql`) containing the `enable row level security` + `create policy` statements from §7 for every table.

### D.4 Media & recordings (S3 presigned uploads)

Never stream large files through the API. Client asks for a presigned URL, uploads straight to S3, then saves the key.

```ts
// GET /media/presign?type=image/jpeg  -> { url, key }
async presign(tenantId: string, contentType: string) {
  const key = `${tenantId}/${uuid()}`;
  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: env.S3_BUCKET, Key: key, ContentType: contentType,
    ServerSideEncryption: 'aws:kms', SSEKMSKeyId: env.KMS_KEY_ID,
  }), { expiresIn: 300 });
  return { url, key };
}
// Call recordings from telephony: the provider posts a RecordingUrl; a worker fetches it and re-uploads to S3 under {tenantId}/recordings/{callId}, then stores the S3 key on calls.recording_url.
// Serving: generate a short-lived presigned GET when an agent plays a recording. Never make the bucket public.
```

### D.5 WebSocket handshake auth

```ts
// apps/api/src/realtime/rt.gateway.ts
@WebSocketGateway({ cors: true })
export class RtGateway implements OnGatewayConnection {
  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;         // client sends its JWT
      const claims = await verifyOidc(token);             // same validation as JwtGuard
      const tenantId = await tenantForUser(claims.sub);
      socket.join(`tenant:${tenantId}`);                  // room = tenant isolation
      (socket.data as any).tenantId = tenantId;
    } catch { socket.disconnect(true); }                  // reject unauthenticated sockets
  }
}
```

### D.6 Keycloak realm setup (one-time)

1. Create realm `astronomiq`. 2. Create confidential client `aq-api` (standard flow + service accounts) → copy client secret to `OIDC_CLIENT_SECRET`. 3. Create public client `aq-web` (PKCE, redirect `https://*.app.astronomiq.in/*`). 4. Enable "Required action: Update Password" so invited users set their own. 5. Add realm roles matching AstronomiQ roles (Admin/Manager/…); map to token via a "roles" client scope. 6. For enterprise SSO, add an Identity Provider (SAML/Google/Microsoft) per tenant and enable OTP as a required action for Admins. Automate all of this with the Keycloak Admin REST API inside the onboarding script (§23) so no manual console work per tenant.

### D.7 Pagination, filtering & sorting convention

All list endpoints: `?limit=50&cursor=<opaque>&sort=createdAt:desc&filter[status]=open&filter[priority]=p1`. Response: `{ data:[...], meta:{ nextCursor, total } }`. Use **keyset (cursor) pagination** on `(created_at, id)` for hot lists (tickets, messages) — offset pagination degrades at scale. Whitelist filterable/sortable fields per module to avoid injection.

### D.8 Backup, restore & disaster recovery

- **Backups:** RDS automated backups + **PITR** (7–35 day window); nightly snapshot copied to a second region (`ap-south-2`) for DR. S3 versioning + cross-region replication for `media`.
- **Targets:** RPO ≤ 5 min (PITR), RTO ≤ 1 hr.
- **Restore drill (quarterly):** spin RDS from snapshot into staging, run `prisma migrate deploy`, smoke-test, tear down. Document the wall-clock time.
- **DR runbook:** if `ap-south-1` is down — promote the cross-region snapshot, repoint Route 53 to the DR ALB/CloudFront, rotate secrets if needed, verify webhooks. Keep this as a one-page checklist in `docs/dr.md`.

### D.9 Seed script structure

`packages/db/seed.ts` (dev) and the onboarding script (prod) share helpers:

```ts
export async function seedTenant(tenantId: string) {
  await seedRoles(tenantId);                // Admin, Manager, TeamLead, Agent, QA, Viewer + permissions
  await seedDepartments(tenantId);          // CX Ops, Payments, Returns, Logistics, Escalations
  await seedBusinessHours(tenantId);        // 09:00–21:00 IST, national holidays
  await seedSlaPolicies(tenantId);          // P1..P4 defaults
  await seedEscalationRules(tenantId);      // L1..L4 with triggerAfterMins
  await seedAutomations(tenantId);          // the example rules from §14
  await seedMacros(tenantId);               // canned responses
  await seedKb(tenantId);                   // starter articles → triggers embeddings
}
// dev seed also inserts demo contacts/tickets/calls so the UI looks like the prototype.
```

### D.10 What is intentionally *not* in this document (and where to get it)

This document contains everything **we own**. Three categories necessarily live in the vendors' own, always-current references — fetch these when wiring each integration (do not hard-code assumptions from memory):

1. **Third-party API references** — Meta WhatsApp Cloud API, Exotel/Ozonetel call APIs, Google Business Profile, AWS SDK. These change; always use the vendor's live docs for exact field names, versions and limits.
2. **Cloud-console specifics** — exact IAM policy JSON, VPC/subnet CIDRs, and account-level settings depend on your AWS org; the Terraform in §18 is the shape, your infra team fills account IDs/CIDRs.
3. **Commercial credentials & rates** — actual API keys, phone numbers, per-message/per-minute contracted rates, and the Meta/BSP + Exotel account sign-ups are procurement steps, not code.

Everything else — architecture, schema, tenant isolation, auth model, every module's build pattern, SLA/escalation logic, channel gateway code, deployment, CI/CD, security, testing and change runbooks — is in this document. A competent team can build, deploy and operate AstronomiQ CX from this file plus the prototype UI, referring outward only for the three categories above.

---

**Companion file:** `AstronomiQ-CX.html` (the clickable prototype) is the authoritative UI specification for this document — every screen, colour, and interaction the built product must match. Keep it with this guide.
