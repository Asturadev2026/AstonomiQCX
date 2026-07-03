# AstronomiQ CX

Multi-tenant AI customer-experience platform — a pnpm + Turborepo monorepo
(TypeScript everywhere).

**New here? Read this file top to bottom, then `REQUIREMENTS.txt` for the exact
first-time setup.** The deep specs live in `docs/`:
`AstronomiQ-CX-Implementation-Plan.md` (build order — follow this),
`AstronomiQ-CX-Build-and-Deploy-Guide.md` (technical reference), and
`AstronomiQ-CX_1.html` (the pixel-exact UI spec).

---

## Project status (read this first)

The docs describe the **full target architecture**. Not all of it is built yet.
Here is what actually exists in the repo today vs. what is still planned, so you
don't run commands that hit dead ends.

| Area | Package | Status |
|---|---|---|
| Web SPA (React + Vite) | `apps/web` | ✅ **Built** — runs today |
| Shared types / enums / DTOs | `packages/shared` | ✅ **Built** |
| DB schema, RLS, tenant gate | `packages/db` | ✅ Schema + helpers exist; ⚠️ **no migrations or seed yet** |
| Shared tsconfig | `packages/config` | ✅ **Built** |
| Local infra (Postgres/Redis/Keycloak) | `infra/docker` | ✅ **Built** — `docker compose` works |
| API server (NestJS) | `apps/api` | 🚧 **Planned** — folder does not exist yet |
| Background workers (BullMQ) | `apps/workers` | 🚧 **Planned** |
| Webhook gateways | `apps/gateways` | 🚧 **Planned** |
| DB seed data | `packages/db/src/seed` | 🚧 **Planned** (`pnpm --filter @aq/db seed` fails until created) |
| CI pipeline | `.github/workflows` | 🚧 **Planned** — directory is empty |
| Terraform / k8s | `infra/terraform`, `infra/k8s` | 🚧 **Planned** |

**What you can do today:** run the web app. Because there is no API yet, every
view calls its real endpoint, gets nothing, and renders its **error state** —
that is correct and by design (see [Rule 1](#rules-of-the-repo)). Building the
API + database is the next phase (`docs/AstronomiQ-CX-Implementation-Plan.md`).

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 LTS | `node -v` |
| pnpm | 9.x | `corepack enable` (pins the version in `package.json`), or `npm i -g pnpm@9` |
| Docker Desktop | latest | runs Postgres+pgvector, Redis, Keycloak locally |
| Git | any recent | trunk-based on `main` |

Editor: VS Code + the Prisma, ESLint, and Prettier extensions.

---

## Quickstart

### Run the web app (works today)

```bash
git clone <repo> && cd astronomiq-cx
cp .env.example .env          # defaults work as-is for local dev
pnpm install                  # installs every workspace in one shot

pnpm --filter @aq/web dev     # Vite dev server → http://localhost:3000
```

Open http://localhost:3000. Views will render their error/empty states until the
API exists — expected.

> `pnpm dev` (turbo) also works, but today only `apps/web` has a `dev` script, so
> it effectively starts just the web app.

### Bring up local infrastructure (for the next phase)

```bash
# Postgres + pgvector only:
docker compose -f infra/docker/docker-compose.yml up -d db

# or everything (Postgres, Redis, Keycloak):
docker compose -f infra/docker/docker-compose.yml up -d
```

### Set up the database (schema exists; migrations/seed not committed yet)

```bash
pnpm --filter @aq/db generate                 # generate the Prisma client
pnpm --filter @aq/db migrate:dev --name init  # create + apply the first migration

# RLS policies can't be managed by Prisma — after generating an empty migration,
# paste packages/db/prisma/rls.sql into it, then apply. See REQUIREMENTS.txt §2.

# pnpm --filter @aq/db seed                    # ⚠️ not available yet (no src/seed)
```

### Service URLs & ports (local)

| Port | Service | Notes |
|---|---|---|
| 3000 | web (Vite) | proxies `/api/*` → `:4000` |
| 4000 | api (NestJS) | 🚧 once built |
| 5432 | PostgreSQL | user `aq` / pass `aq` / db `astronomiq` (dev only) |
| 6379 | Redis | |
| 8080 | Keycloak | admin `admin` / `admin` (dev only) |

`*.localtest.me` resolves to `127.0.0.1`, giving you free wildcard subdomains for
multi-tenant testing (e.g. `http://shopnova.localtest.me:3000`).

---

## Project structure

```
astronomiq-cx/
├── apps/
│   └── web/                  ✅ React 18 + Vite SPA (@aq/web)
│       ├── index.html
│       ├── vite.config.ts    dev server :3000, proxies /api → :4000
│       └── src/
│           ├── main.tsx      app entry
│           ├── App.tsx       router + PORTED view registry
│           ├── layout/       AppShell, Sidebar, Topbar
│           ├── components/   NavIcon, StubPage, Toast, loading/error/empty states
│           ├── modules/      one folder per view (e.g. overview/CommandCentre.tsx)
│           ├── pages/        Login
│           ├── lib/api/      types.ts, hooks.ts (React Query), fixtures.ts
│           ├── state/        auth context
│           └── styles/       prototype.css (verbatim from UI spec) + tweaks
│   # 🚧 apps/api, apps/workers, apps/gateways — planned, not yet created
│
├── packages/
│   ├── shared/               ✅ @aq/shared — enums, permissions, DTOs, API types
│   │   └── src/              constants.ts, api.ts, dto/ticket.ts, index.ts
│   ├── db/                   ✅ @aq/db — Prisma + tenancy
│   │   ├── prisma/
│   │   │   ├── schema.prisma every model has tenantId + indexes
│   │   │   └── rls.sql       Row-Level Security policies (Prisma can't manage these)
│   │   └── src/
│   │       ├── client.ts     getPrisma()
│   │       ├── with-tenant.ts  withTenant() — the ONLY way to touch tenant data
│   │       ├── next-ref.ts   human IDs (AQ-T-…, AQ-O-…)
│   │       └── index.ts
│   │       # 🚧 src/seed — planned
│   └── config/               ✅ @aq/config — tsconfig.base.json
│
├── infra/
│   ├── docker/               ✅ docker-compose.yml (Postgres+pgvector, Redis, Keycloak)
│   ├── terraform/            🚧 planned
│   └── k8s/                  🚧 planned
│
├── docs/                     source specs (build guide, implementation plan, UI spec)
├── .github/workflows/        🚧 empty — CI planned
├── .env.example              copy to .env; local defaults work out of the box
├── package.json              root scripts + workspace tooling
├── pnpm-workspace.yaml       workspaces: apps/*, packages/*
├── turbo.json                task pipeline (build/dev/lint/typecheck/test)
└── REQUIREMENTS.txt          machine prerequisites + first-time setup
```

### How the packages fit together

`@aq/shared` holds the type/enum contracts used by both frontend and (future)
backend. `@aq/db` owns the Prisma schema and the tenancy gate — all data access
goes through `withTenant()`, which sets the Postgres session tenant so RLS
policies apply. `apps/web` depends on `@aq/shared` and talks to the API over
`/api/v1/*`. `@aq/config` supplies the base tsconfig everyone extends.

---

## Common commands

Run from the repo root:

| Command | What it does |
|---|---|
| `pnpm install` | install all workspaces |
| `pnpm dev` | `turbo dev` — start all app dev servers (today: just web) |
| `pnpm --filter @aq/web dev` | run only the web app |
| `pnpm build` | `turbo build` — build all packages |
| `pnpm typecheck` | typecheck all packages |
| `pnpm lint` | lint (turbo; per-package lint scripts added as apps land) |
| `pnpm test` | run tests |
| `pnpm format` | Prettier across the repo |

Per-package Prisma helpers live under `pnpm --filter @aq/db …`
(`generate`, `migrate:dev`, `migrate:deploy`, `studio`, `seed`).

---

## Rules of the repo

1. **No hardcoded data.** Every business value shown in the UI comes from
   Postgres via the API. Frontend components read **only** from hooks in
   `apps/web/src/lib/api/hooks.ts`. Any demo/sample data belongs in the database
   seed (`packages/db/src/seed`), never as code literals.
2. **Every module copies the Tickets pattern** (Guide §10): shared DTO in
   `packages/shared` → tenant-scoped service (`withTenant`) → guarded controller
   → tests → React page + hook.
3. **Every business table** has `tenant_id` + an RLS policy
   (`packages/db/prisma/rls.sql`). Queries run inside `withTenant()`; outside it,
   `FORCE ROW LEVEL SECURITY` returns zero rows — a loud failure, not a leak.
4. **UI matches the spec exactly.** Port `docs/AstronomiQ-CX_1.html` 1:1; its CSS
   is imported verbatim (`apps/web/src/styles/prototype.css`). Recipe:
   `apps/web/README.md`.
5. **Trunk-based on `main`.** PRs reviewed by the other dev; keep `main` green.

---

## Where to go next

- Building a UI view → `apps/web/README.md` (the porting recipe).
- Building the API / DB / workers → `docs/AstronomiQ-CX-Implementation-Plan.md`
  (build order and task split) + the Build & Deploy Guide.
