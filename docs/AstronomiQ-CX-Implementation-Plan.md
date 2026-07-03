# AstronomiQ CX — Implementation Plan
### End-to-end build spec for a 2-person team · No hardcoded data — everything database-backed

**Version 1.0 · July 2026 · Companion to:** `AstronomiQ-CX-Build-and-Deploy-Guide.md` (the "Guide", §-references point there) and `AstronomiQ-CX_1.html` (the "Prototype", pixel + interaction spec).

---

## 0. Ground rules

1. **Zero hardcoded data.** Every business record, metric, chart value, list, badge count, and KPI shown in the UI must be fetched from PostgreSQL through an API. The prototype's ~45 dummy arrays are the *contract for what data must exist* — each one becomes seed rows + a table + an endpoint + a React hook. §5 of this plan maps all of them.
2. **What may live in code (not "data"):** UI copy (labels, titles, subtitles), icons/SVGs, enum *definitions* (`p1..p4`, ticket statuses, channel types — defined once in `packages/shared/constants.ts`), and design tokens. Everything else comes from the DB.
3. **The Tickets pattern is law.** Every module is built exactly like the worked example in Guide §10: DTO in `packages/shared` → tenant-scoped service (`withTenant`) → controller with `JwtGuard + PermissionsGuard` → tests → React page + TanStack Query hook.
4. **Tenant isolation is non-negotiable.** Every table has `tenant_id` + RLS policy (Guide §7). The tenant-isolation integration test (Guide §22) must exist before the second module is built.
5. **Async work never blocks requests.** Anything slow (embeddings, sends, SLA sweeps, QA scoring) runs in BullMQ workers (Guide §15).
6. **No fake liveness.** The prototype fakes real-time with `setInterval` (SLA countdowns decrementing locally, Conversation Hub adding a random mention every 14s). In the real app: countdowns are computed client-side from server-supplied `target_at` timestamps; feeds update via WebSocket events, never simulated.

---

## 1. Prerequisites (do once, Week 0)

| Item | What | Notes |
|---|---|---|
| Accounts | GitHub org, AWS account (`ap-south-1`), Anthropic/Azure OpenAI key | AWS only needed from Phase E |
| Meta | Meta developer app + WhatsApp Cloud API **test number** | Free; needed Phase D |
| Telephony | Exotel trial/sandbox account | Needed Phase F |
| Local | Node 20 LTS, pnpm 9, Docker Desktop | both machines |
| Domains | `astronomiq.in` (or dev domain) + wildcard subdomain support | Local dev uses `*.localtest.me` which resolves to 127.0.0.1 — free wildcard subdomains for tenant testing |

---

## 2. Repository & tooling setup (Week 1, pair on this)

Follow Guide §4 layout exactly:

```
astronomiq-cx/
├── apps/ (api, workers, gateways, web)
├── packages/ (db, shared, config)
├── infra/ (docker, terraform later, k8s later)
├── docs/ (both source documents + this plan + ADRs)
└── .github/workflows/
```

Step-by-step:

1. `pnpm init` at root, configure **pnpm workspaces + Turborepo** (`turbo.json` with `build`, `dev`, `lint`, `test` pipelines).
2. `packages/config`: shared `tsconfig.base.json`, ESLint + Prettier config, zod env schema (Guide §5 — copy `env.ts` verbatim; extend as integrations arrive, full list in Guide Appendix A).
3. `packages/shared`: `constants.ts` (enums: priorities, ticket statuses, channels, sentiment values, roles, permission strings), `dto/` (one file per module, start with `ticket.ts` from Guide §10), `types.ts`.
4. `apps/api`: NestJS 10 scaffold (`nest new`), wire env validation at boot, `/health` + `/ready` endpoints day one.
5. `apps/workers`: plain TS process with BullMQ, shares `packages/db`.
6. `apps/gateways`: NestJS app (or a module inside api initially — acceptable for two people; split later) for webhook receivers.
7. `apps/web`: Vite + React 18 + TS + Tailwind 3. Configure design tokens from Prototype `:root` CSS vars (full token list in §10.1 below).
8. `infra/docker/docker-compose.yml`: copy Guide §17 verbatim — `pgvector/pgvector:pg16`, `redis:7`, `keycloak:24`.
9. `.github/workflows/ci.yml`: Guide §19 `ci` job only (lint → typecheck → test → build). Deploy job comes in Phase E.
10. Branch strategy: trunk-based on `main`, short-lived feature branches, PRs reviewed by the other dev same-day. CI must pass to merge.

**Definition of done:** both machines run `docker compose up` + `pnpm dev` and see a "hello" API on :4000 and the empty React shell on :3000.

---

## 3. Database layer (Week 1–2)

### 3.1 Schema

Create `packages/db/schema.prisma` mirroring the full DDL in Guide §6 (all ~30 tables) plus Guide D.3 conventions (every model: `tenantId String` + `@@index`). Then add the **gap tables** below — these are referenced by the Guide's module map and *required by prototype screens* but missing from §6 DDL:

```sql
-- WFM (Workforce view: live agent board, roster)
create table agent_status (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'offline',   -- available|on_call|on_break|offline
  since timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create table shifts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id),
  name text not null,                        -- Morning|Evening|Night
  starts_at timestamptz not null, ends_at timestamptz not null,
  login_at timestamptz
);

-- Conversation Hub (social listening pipeline)
create table social_mentions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null,                      -- facebook|instagram|whatsapp|linkedin|google|x
  author_name text, author_handle text,
  body text not null,
  tags jsonb not null default '[]',
  sentiment text,                            -- pos|neu|neg
  tough boolean not null default false,
  bot_reply text,
  stage text not null default 'detected',    -- detected|bot_replied|escalated|ticket
  ticket_id uuid references tickets(id),
  created_at timestamptz not null default now()
);

-- Contact Centre (ACD queues)
create table queues (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,                        -- Orders & delivery, Payments...
  skill text, department_id uuid references departments(id)
);
-- live queue state (waiting count, wait times) is computed from calls + redis, not stored

-- Human-friendly sequential IDs (Guide D.1)
create table ref_counters (
  tenant_id uuid not null, prefix text not null, seq bigint not null default 0,
  primary key (tenant_id, prefix)
);

-- Topbar notifications (bell icon = real rows, not a toast)
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null, body text not null, entity text, entity_id uuid,
  read_at timestamptz, created_at timestamptz not null default now()
);

-- Billing (invoices table shown in Billing view; plans are global = no tenant_id)
create table plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null, price_inr numeric not null, features jsonb not null default '[]'
);
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ext_ref text, period_start date, period_end date,
  amount numeric, status text default 'due', created_at timestamptz default now()
);

-- Team invites (Settings → Invite flow, Guide §8)
create table invites (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null, role_id uuid references roles(id),
  department_id uuid, status text default 'sent', created_at timestamptz default now()
);

-- Tenant-level config (Priority Matrix cells, platform toggles in Settings)
create table tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  priority_matrix jsonb not null default '{}',   -- urgency×impact grid (D.1 default seeded)
  toggles jsonb not null default '{}',           -- auto_resolve, hindi_support, sentiment_routing...
  integrations jsonb not null default '[]'       -- connected integration descriptors
);
```

Also add to `conversations`: `intent text` and `language text` columns (Analytics "intents" and "language split" charts need them; set by the AI worker).

### 3.2 Migrations & RLS

1. `prisma migrate dev` for the schema.
2. Hand-written SQL migration enabling **RLS + tenant_isolation policy on every business table** (Guide §7; Prisma can't manage RLS — see Guide D.3 note). Script-generate the repetitive statements from the table list.
3. `withTenant()` helper (Guide §7) in `packages/db` — the **only** way services touch the DB.

### 3.3 Seed strategy (this is how "no hardcoded data" is honored)

Two seed layers (Guide D.9):

- **`seedTenant(tenantId)`** — production defaults for any new tenant: roles+permissions, departments (CX Ops, Payments, Returns, Logistics, Escalations), business hours (09:00–21:00 IST + holiday list), SLA policies (P1–P4), escalation rules (L1 assignee 30m → L2 manager 2h → L3 dept head 6h → L4 regional 24h), example automations, starter macros, starter KB articles, default priority matrix, plans catalogue.
- **`seedDemo(tenantId)`** — the demo tenant ("ShopNova India"): **port every dummy array from the prototype into seed rows** using the mapping table in §5. 6 inbox conversations with their full message history, 7 tickets across stages, 6 social mentions, 5 departments with executives, 8 agents with statuses and shifts, 6 KB articles, 6 macros, 6 automation rules, 5 orders + 4 past tickets for the featured contact, QA audits, surveys spanning 8 weeks, calls with transcripts and CDRs, 5 virtual numbers, invoices, usage rows. Spread `created_at` values over 30+ days so every chart has a real time series.

Seeds are idempotent (`upsert`), runnable with one command: `pnpm --filter db seed`.

**Rule:** if a screen looks empty or a chart looks dead, the fix is *more seed data*, never a hardcoded fallback in the frontend.

---

## 4. Backend platform services (Weeks 2–4)

Build in this order — everything else depends on these:

1. **Tenancy:** `TenantMiddleware` resolving subdomain → `req.tenantId` (Guide §7). Local dev: `shopnova.localtest.me:3000`.
2. **Auth:** Keycloak realm setup exactly per Guide D.6 (clients `aq-api` confidential + `aq-web` PKCE; automate with Admin REST API). `JwtGuard` validates OIDC tokens; user row loaded by `oidc_subject`.
3. **RBAC:** `PermissionsGuard` + `@Perms()` decorator (Guide §8). Permission strings seeded on roles.
4. **Realtime:** socket.io gateway with Redis adapter; handshake auth joining `tenant:{id}` room (Guide §9 + D.5). Frontend must **never** poll for live data.
5. **Conventions applied globally:** cursor pagination + whitelisted filters (`?limit&cursor&sort&filter[...]` → `{data, meta:{nextCursor,total}}`, Guide D.7); error shape + `requestId` (Guide Appendix B); audit service writing `audit_logs`; `nextRef()` for human IDs (Guide D.1); soft-delete only.
6. **Login flow in web:** real Keycloak redirect (PKCE) replacing the prototype's fake `doLogin()`. No prefilled credentials. Session → user card in sidebar (name, role from `users`), sign-out → Keycloak logout.

**Milestone M1 (end Week 4):** two seeded tenants; login works per subdomain; tenant-isolation test green; WebSocket echo works.

---

## 5. Module implementation matrix — every prototype view, every dummy array, its database source

This is the heart of the no-hardcode condition. Columns: what the prototype fakes → where the data lives → how the UI gets it. Build order is in §9.

**Legend:** `agg` = computed by SQL aggregation in the service, never stored denormalized unless noted. All routes prefixed `/api/v1`.

### 5.1 Operate

| View | Prototype dummy data | Table(s) | Endpoints | Realtime events |
|---|---|---|---|---|
| **Command Centre** (`overview`) | KPI numbers; `channels` (volume % by channel); donut (AI/agent mix); `feed` (activity) | agg over `conversations`, `messages`, `tickets`, `surveys`; feed = `audit_logs` + system events | `GET /analytics/overview` (one payload: kpis, channelSplit, resolutionMix), `GET /activity/feed` | `activity.created` |
| **Omni Inbox** (`inbox`) | `conversations` array (6 convs incl. `msgs`, `sugg` suggested replies, customer snapshot); filter state | `conversations`, `messages`, `contacts`, `orders` | `GET /conversations?filter[channel]`, `GET /conversations/:id` (incl. contact+order snapshot), `GET /conversations/:id/messages`, `POST /conversations/:id/reply`, `PATCH /:id/assign`, `PATCH /:id/resolve` | `message.created`, `conversation.updated` |
| — Copilot pane | `sugg` (canned suggestions), sentiment | AI: suggestions **generated live** (RAG over KB + thread), sentiment from `conversations.sentiment` (worker-written) | `POST /ai/suggest {conversationId}` | — |
| **Conversation Hub** (`convhub`) | `convItems` (6 mentions), pipeline stages, KPI cards, fake 14s feed timer | `social_mentions` | `GET /mentions?filter[source]`, `POST /mentions/:id/reply`, `POST /mentions/:id/escalate`, `POST /mentions/:id/ticket`, `GET /mentions/summary` (KPI cards) | `mention.created`, `mention.updated` (replaces the fake interval) |
| **Tickets Board** (`tickets`) | `tickets` (7), `stages` | `tickets` (+ status enum in shared constants) | `GET /tickets?filter[status]`, `POST /tickets`, `PATCH /tickets/:id/move`, `PATCH /:id/assign` | `ticket.created`, `ticket.updated` |

### 5.2 AI Studio

| View | Prototype dummy data | Table(s) | Endpoints | Notes |
|---|---|---|---|---|
| **AI Chatbot** (`chatbot`) | `botReplies` keyword matcher | `kb_articles`, `kb_embeddings` | `POST /ai/chat {message, lang}` → RAG (Guide §11.1) | Keyword matching is deleted; answers come from vector search + LLM. `escalate:true` → creates conversation + optional ticket |
| **WhatsApp Bot** (`whatsapp`) | `waFlows` (track/refund/talk texts) | `agent_flows` (definition jsonb, Guide D.2 node graph) | `GET/POST /flows`, flow interpreter service | Demo pane in app replays *real* flow definitions from DB |
| **Voice AI** (`voice`) | `callScript` (11-turn fake call), insights | `calls` (transcript, sentiment, QA), `messages` | `GET /calls/:id` incl. transcript; live demo streams via WS from the voice pipeline (Guide §11.2) | Phase F; until then screen renders seeded historical calls |
| **Agent Builder** (`builder`) | `flowNodes` (6 palette blocks + canvas) | `agent_flows` | `GET/POST/PATCH /flows`, `POST /flows/:id/publish` | Palette block *types* are code; the flows on canvas are DB rows |
| **Automations** (`automations`) | `rules` (6 rules with toggle + run counts) | `rules` | `GET/POST/PATCH /rules`, `PATCH /rules/:id/toggle` | `runs` incremented by the engine (Guide §14) |
| **Knowledge Base** (`kb`) | `articles` (6), category counts | `kb_articles` | `GET /kb/articles?filter[category]`, `POST/PATCH/DELETE`, `GET /kb/categories` (agg counts), `POST /kb/search` | Save triggers `embed-article` job |
| **Macros** (`macros`) | `macros` (6 with usage counts) | `macros` | `GET/POST/PATCH /macros`, `POST /macros/:id/use` (increments `uses`) | "Copy" action calls `/use` so counts are real |

### 5.3 Service Ops

| View | Prototype dummy data | Table(s) | Endpoints | Notes |
|---|---|---|---|---|
| **SLA & Escalation** (`sla`) | `slaPolicies` (6), `execSLA`/`deptSLA` scorecards, `slaTickets` (fake countdowns), `esc` matrix | `sla_policies`, `sla_events`, `escalation_rules`, `escalations`, `business_hours` | `GET/POST/PATCH /sla/policies`, `GET /sla/scorecard?by=exec\|dept` (agg per Guide §12), `GET /sla/breaches` (open events + `target_at`), `GET/PATCH /escalation-rules` | Countdown = client renders `target_at - now`; breach flips arrive via `sla.breached` WS event from the sweep worker |
| **Departments** (`departments`) | `departments` (5 with heads, open counts, exec lists) | `departments`, `teams`, `users`, `agent_status`, agg on `tickets` | `GET/POST/PATCH /departments`, `GET /departments/:id/executives` (users + live status + open ticket agg) | — |
| **Workforce** (`workforce`) | `wfPeople` (8 presence), status-grid counts, `fc` forecast, `roster` (8) | `agent_status`, `shifts` | `GET /agents/status`, `PATCH /agents/:id/status`, `GET /shifts?date=`, `GET /wfm/forecast` (agg of historical conversation volume by hour vs staffed from shifts) | presence changes → `agent.status` WS event; topbar "N agents live" uses same endpoint |
| **Contact Centre** (`contactcentre`) | KPI cards, `ivr` menu, `acd` queues, `mon` live calls | `queues`, `calls`, `agent_flows` (IVR type), Redis live state | `GET /queues` (+ live depth/wait computed), `GET /calls?filter[status]=live`, `GET /cc/kpis`; listen/whisper/barge = provider API calls (Phase F) | Live numbers from Redis keys the telephony gateway maintains |
| **Cloud Telephony** (`telephony`) | `nums` (5 DIDs), `cdr` (6), `ivrB`, `dcontacts`, softphone state, `telSteps` | `numbers`, `calls`, `agent_flows`, `contacts` | `GET/POST /telephony/numbers`, `GET /telephony/calls` (CDR w/ filters), `POST /telephony/click-to-call`, `POST /telephony/mask`, recording playback via presigned S3 GET (Guide D.4) | `telSteps` explainer copy = UI text (allowed). Dialer contacts = `GET /contacts?filter[segment]` |
| **Field Service** (`fieldservice`) | `fsVisits` (5), KPI cards | `service_visits` | `GET/POST/PATCH /service-visits`, `PATCH /:id/status`, `GET /service-visits/summary` | — |
| **Priority Matrix** (`priomatrix`) | 3×4 grid cells + SLA per cell | `tenant_settings.priority_matrix` (seeded from Guide D.1 default) | `GET/PUT /settings/priority-matrix` | `priorityFromMatrix()` reads this config, not constants |

### 5.4 Engage & Analyse

| View | Prototype dummy data | Table(s) | Endpoints | Notes |
|---|---|---|---|---|
| **Campaigns** (`campaigns`) | segment cards + counts, campaign metrics | `campaigns`, agg on `contacts` (segment counts) | `GET /contacts/segments` (agg), `GET/POST /campaigns`, `POST /campaigns/:id/send` (enqueues `campaign-blast`) | sent/delivered/read/replied updated by WA status callbacks |
| **Surveys & VoC** (`surveys`) | gauges (CSAT/NPS/CES), `w` 8-week trend, `themes`, `sr` responses | `surveys` (+ themes via LLM worker writing `surveys.comment` classifications or a `survey_themes` agg) | `GET /surveys/summary` (gauges+trend), `GET /surveys?limit=`, `GET /surveys/themes` | Surveys created by post-resolution worker; responses ingested via channel webhooks |
| **Customer Journey** (`journey`) | 5 stages with metrics, `friction` bars | agg across `contacts`, `orders`, `conversations`, `tickets`, `surveys` | `GET /journey/summary` | Pure aggregation endpoint; stage definitions are code |
| **Customer 360** (`customer`) | profile, stat boxes, `orders` (5), `ct` past tickets (4), `tl` sentiment timeline | `contacts`, `orders`, `tickets`, `conversations` | `GET /contacts/:id`, `GET /contacts/:id/orders`, `GET /contacts/:id/tickets`, `GET /contacts/:id/timeline` (monthly sentiment agg) | Also powers softphone screen-pop and inbox snapshot |
| **Self-Service Portal** (`portal`) | search, categories, actions | `kb_articles`, `tickets` | **Public** endpoints: `GET /portal/kb/search`, `POST /portal/tickets`, `GET /portal/tickets/:ref` (tracked by ext_ref + contact verification) | Separate small React bundle (Guide §16.7); rate-limited, no auth |
| **Auto QA** (`qa`) | KPI cards, `qaData` (5 audits), `leaders`, `intents` | `qa_audits`, agg on `users`+`surveys` (leaderboard), agg on `conversations.intent` | `GET /qa/audits`, `GET /qa/summary`, `GET /qa/leaderboard`, `GET /analytics/intents` | Audits written by `qa-scoring` worker on conversation/call close |
| **Analytics** (`analytics`) | `total`/`ai` trend arrays, `csat` by channel, `hrs`, `langs`, `heat` | agg over `conversations`, `messages`, `surveys` (`language`, `intent` columns) | `GET /analytics/trends?days=30`, `GET /analytics/csat-by-channel`, `GET /analytics/response-by-hour`, `GET /analytics/languages`, `GET /analytics/heatmap` | Consider a nightly `metrics_daily` rollup table when queries slow down (>~1M rows); same endpoints, faster source |

### 5.5 Admin + shell

| View / element | Prototype dummy data | Table(s) | Endpoints |
|---|---|---|---|
| **Audit Log** (`audit`) | `audit` (8 entries) | `audit_logs` | `GET /audit?filter[entity]&filter[userId]` (read-only) |
| **Billing & Plans** (`billing`) | `usage` meters, `invoices` (4), `plans` (3) | `subscriptions` (usage jsonb via `usage-metering` worker), `invoices`, `plans` | `GET /billing/usage`, `GET /billing/invoices`, `GET /plans` |
| **Team & Settings** (`settings`) | `team` (5 members), toggles, `integ` (8 integrations) | `users`+`roles`+`teams`, `tenant_settings.toggles`, `channels` + `tenant_settings.integrations`, `invites` | `GET /users`, `POST /invites`, `PATCH /users/:id`, `GET/PUT /settings/toggles`, `GET /channels` |
| Sidebar badges (18 / 27 / 4) | hardcoded numbers | agg | `GET /nav/counts` → `{inbox, mentions, slaAtRisk}`; invalidated by WS events |
| Topbar bell + red dot | fake toast | `notifications` | `GET /notifications?filter[unread]`, `PATCH /notifications/:id/read`; `notification.created` WS |
| Topbar "42 agents live" | hardcoded | `agent_status` | reuse `GET /agents/status` count |
| Global search | non-functional input | search across `contacts`, `tickets`, `orders`, `conversations` | `GET /search?q=` (ILIKE per entity, union response; pg_trgm index) |
| Login page stats/branding | marketing copy | static UI copy (allowed) | — |

---

## 6. AI layer implementation (Guide §11)

1. **Embeddings worker** (`embed-article`): on KB save → chunk (~500 tokens) → embeddings API → `kb_embeddings`. 
2. **RAG service** (`POST /ai/chat`, `POST /ai/suggest`): embed query → pgvector top-5 → LLM prompt (Guide §11.1 verbatim, but load the assistant name/persona from `tenants`/`tenant_settings`, not hardcoded "ShopNova") → answer or `ESCALATE`.
3. **Post-close workers**: `summarise`, `sentiment`, `intent`, `language`, `qa-score` — small LLM calls writing to `conversations` / `calls` / `qa_audits`. These populate the Analytics, QA and C360 screens; without them those screens only show seed data.
4. **Language handling**: detect on first message; store `contacts.language` + `conversations.language`; reply in kind (Guide §11.4).
5. **Voice pipeline** (Phase F): telephony audio stream ↔ STT (Sarvam) → RAG → TTS; transcript persisted turn-by-turn to `calls.transcript`, streamed to the Voice AI screen over WS.

---

## 7. Channel gateways (Guide §13)

Uniform shape per channel: verify webhook → normalise → `ingestInbound(tenantId, {...})` → conversation/message rows → rules engine + bot → WS events.

| Channel | Inbound | Outbound | Phase |
|---|---|---|---|
| WhatsApp | Meta Cloud API webhook (verify handshake + HMAC, Guide §13.1 code) | Graph API send; template outside 24h window | D |
| Web chat widget | WS direct to RT gateway | same socket | D |
| Email | SES → SNS → gateway; thread via `In-Reply-To` | SES send | E |
| Instagram/Facebook | Meta Graph webhooks → `social_mentions` / DMs → conversations | Graph reply | E |
| Google reviews / X | GBP API poll / X API → `social_mentions` | provider reply APIs | E/F |
| Telephony | Exotel webhooks (incoming, status/CDR — Guide §13.2 code) | click-to-call, masking, dialer | F |

Store per-tenant channel credentials in `channels.config` (encrypted refs), never in env.

---

## 8. Workers (Guide §15)

`sla-sweep` (cron 60s — Guide §12 verbatim incl. `addBusinessMinutes` from D.1), `escalations`, `embeddings`, `send-message`, `campaign-blast`, `qa-scoring`, `survey-sender` (post-resolution CSAT), `usage-metering` (fills `subscriptions.usage` + emits invoice rows monthly), `webhook-retry`, `recording-fetch` (provider URL → S3, Guide D.4). All idempotent, retried with backoff, deployed separately from the API.

---

## 9. Build order & two-person split

Each phase ends with a demo-to-each-other. After Phase B, split by *module* (own it DB→API→UI), not by layer.

| Phase | Weeks | Dev 1 | Dev 2 | Exit criteria |
|---|---|---|---|---|
| **A. Foundation** | 1–4 | Repo+DB+RLS+seeds; tenancy; auth/RBAC | Web shell: tokens, AppShell, sidebar+routing (all 27 routes stubbed), login via Keycloak, TanStack Query + socket client, `/nav/counts` badges | M1 (§4) |
| **B. Core spine** | 5–8 | Tickets module (the pattern); SLA engine + sweep worker + escalations; contacts/orders APIs | Tickets Kanban (real drag/move → `PATCH /move`); Omni Inbox 3-pane; SLA screen (policies, scorecard, live breaches via `target_at`); Customer 360 | **M2:** create→breach→escalate→resolve visible live in UI, all data from DB |
| **C. Knowledge & ops** | 9–11 | KB + embeddings worker + RAG (`/ai/chat`, `/ai/suggest`); automations engine; macros | KB UI, Chatbot screen (real RAG), Automations UI (toggles hit API), Macros, Departments, Audit Log, Notifications, global search | **M3:** bot answers from tenant KB; rules fire on ticket events |
| **D. WhatsApp + hub** | 12–14 | WhatsApp gateway (test number) + `ingestInbound` + 24h-window send logic; social_mentions API; sentiment/intent workers | Conversation Hub (WS-live), WhatsApp Bot screen, Agent Builder (canvas ↔ `agent_flows` jsonb), web chat widget | **M4:** real phone → WhatsApp → bot → escalate → ticket, end to end. **Client-demo ready** |
| **E. Engage & analytics** | 15–18 | Surveys worker + summary aggs; analytics endpoints; campaigns + blast worker; email gateway; QA scoring worker; usage metering + billing | Analytics (Recharts or ported SVG), Surveys/VoC, QA, Campaigns, Journey, Billing, Settings (toggles/invites/integrations), Self-Service Portal bundle | **M5:** every chart in the app renders from aggregation endpoints |
| **F. Telephony & voice** | 19–24 | Exotel gateway (inbound, CDR, click-to-call, masking); queues + live console state; voice pipeline (STT→RAG→TTS) | Contact Centre + Cloud Telephony screens (softphone against real call APIs), Voice AI screen (live transcript over WS), Field Service, WFM forecast | **M6:** live call answered in browser softphone; CDR + recording playback |
| **G. Harden & ship** | 25–28 | AWS deploy (Guide §18 Option A), CI/CD deploy job, observability (§20), backups/DR (D.8), DPDP items (§21) | E2E Playwright suite (Guide §22 scenarios), load test (k6), onboarding script (§23), demo-tenant reset script, docs | Go-live checklist (Guide §25) fully ticked |

Timeline is quality-first full-time: **client-demoable at ~3.5 months (M4), production-complete at ~7 months** — consistent with the Guide's 5–7 month estimate for a larger team; the demo-first cut keeps you sane.

---

## 10. Frontend port rules (Guide §16)

### 10.1 Design tokens
Copy the prototype's `:root` into `tailwind.config.js`: bg `#EEF3FB`, bg2 `#E4ECF9`, card `#FFFFFF`, panel `#F6F9FF`, line `#E3EAF4`/`#D2DDEE`, blue `#2563EB` (+dark `#1B54D6`, light `#EEF4FF`), sky `#0EA5E9`, indigo `#4F46E5`, cyan `#06B6D4`, text `#15213B`, muted `#5C6B87`/`#94A3B8`, green `#16A34A`, amber `#E08A00`, red `#E23A3A`, pink `#DB2777`, WhatsApp set (`#25D366` etc.), the two gradients, and the three shadows. Fonts: Space Grotesk (display), Inter (body), Space Mono (numbers/codes/timers).

### 10.2 Mechanical porting rule
One prototype `render*()` function → one React component. One dummy array → one hook (`useTickets()`, `useMentions()`…) wrapping TanStack Query against the endpoints in §5. JSX ≈ the prototype's template strings; visual output must match pixel-for-pixel.

### 10.3 Interaction upgrades (fake → real)
| Prototype behavior | Real implementation |
|---|---|
| `doLogin()` 500ms fake | Keycloak PKCE redirect |
| Kanban "Move forward" button | proper drag-and-drop (dnd-kit) + button fallback → `PATCH /move`; optimistic update, invalidate on `ticket.updated` |
| SLA countdown `setInterval` decrement | render `target_at − Date.now()` ticking locally; state changes only via WS |
| Conv Hub random mention every 14s | `mention.created` WS event prepends card |
| Chatbot keyword matcher | `POST /ai/chat`; typing indicator while awaiting |
| Toast-only actions (listen/whisper/barge, macro copy, invite…) | real API calls; toast on success response |
| Voice call scripted playback | live transcript turns over WS (Phase F); seeded call replay until then |
| Charts animated from constants | same SVG components, props from aggregation hooks; keep entry animations |

### 10.4 States the prototype never shows
Every page needs loading skeletons, empty states ("No tickets yet — create one"), and error states (retry + requestId). Standardize three shared components in week 5 and use them everywhere.

---

## 11. Testing (Guide §22)

- **Unit:** `addBusinessMinutes` (nights/weekends/holidays/pause-resume), `priorityFromMatrix`, rules engine matcher, `nextRef` concurrency.
- **Integration (ephemeral pg+redis in CI):** every controller; the mandatory cross-tenant leak test; webhook replays with real recorded Meta/Exotel payloads.
- **E2E (Playwright):** login → ticket lifecycle → CSAT; WhatsApp inbound → bot → escalate → ticket; SLA breach → escalation visible.
- **Contract:** shared DTOs + a post-deploy `/health` smoke test.
- **Coverage gate:** ≥70% on services/engines; CI blocks merge.

**No-hardcode audit (recurring):** grep the web bundle for suspicious literals (names, amounts, counts from the prototype arrays — e.g. "Aarav", "ZK-483920", "₹", "4.6"). Any hit outside seed files or UI copy is a bug. Add it as a CI script.

---

## 12. Environments & deployment

| Env | Where | Notes |
|---|---|---|
| Local | docker-compose (Guide §17) | `*.localtest.me` subdomains |
| Demo/staging | single EC2/Lightsail + docker-compose, managed Postgres (RDS single-AZ), Caddy/nginx TLS | from Phase D; cheap; demo-tenant reset script |
| Production | Guide §18 Option A: ECS Fargate (api/workers/gateways) + RDS Multi-AZ + ElastiCache + S3/CloudFront + Secrets Manager, Terraform | Phase G only — don't build this earlier |

CI/CD per Guide §19: `main` → prod, `develop` → staging, immutable SHA-tagged images, `prisma migrate deploy` before rollout, rollback = previous SHA.

---

## 13. Definition of done (whole project)

- [ ] All 27 prototype views implemented in React, pixel-matched, all routes live
- [ ] **Every dummy array from §5 replaced by DB-backed endpoint + seed data; no-hardcode audit clean**
- [ ] Multi-tenant: onboarding script creates a tenant + Client-Admin in one command (Guide §23); RLS test green
- [ ] Channels live: WhatsApp, web chat, email, social listening, telephony + voice bot
- [ ] SLA timers, escalations L1–L4, automations, QA scoring, surveys, usage metering all firing from workers
- [ ] Realtime everywhere the prototype fakes it (inbox, board, hub, breaches, presence, notifications)
- [ ] Test suite per §11 green in CI; load test p95 < 300ms
- [ ] Deployed on AWS `ap-south-1` with observability, backups+restore drill, DPDP checklist (Guide §21/§25)

---

*Keep this plan, the Guide, and the Prototype together in `docs/`. When this plan and the Guide conflict on sequencing, this plan wins (it's tuned for two people); on technical content, the Guide wins.*
