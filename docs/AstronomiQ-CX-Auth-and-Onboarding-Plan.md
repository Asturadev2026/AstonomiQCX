# AstronomiQ CX — Auth & Tenant Onboarding Plan

**Status:** proposed · **Owner:** Samiksha · **Date:** 2026-08-04
**Supersedes:** the "auth not wired yet" stubs referenced in `apps/web/src/pages/Login.tsx`,
`apps/web/src/state/auth.tsx`, `apps/api/src/auth/oidc.ts` (`loadDevUser`) and
`apps/api/src/tenancy/tenant.middleware.ts` (`x-tenant` dev header).

---

## 1. The problem, stated precisely

Right now there is no authentication anywhere in the stack. "Any Gmail account can log in"
is the visible symptom; the actual situation is broader — **there is nothing to log in to,
and nothing checks anything.** Four independent holes combine:

| # | Hole | Evidence |
|---|---|---|
| 1 | The login screen never verifies credentials | `apps/web/src/pages/Login.tsx` — `doLogin()` is `setTimeout(() => signIn(subdomain), 500)`. The email and password `<input>`s are not read at all. The Google / Microsoft / SSO buttons call the same `doLogin()`. |
| 2 | The session is a boolean in `sessionStorage` | `apps/web/src/state/auth.tsx` — `signIn()` writes `aq.authed = '1'`. Anyone can set that key in DevTools and be "logged in". |
| 3 | The API accepts unauthenticated requests as an admin | `apps/api/src/auth/jwt.guard.ts` — no token in dev ⇒ `loadDevUser()`, which (`oidc.ts`) **creates an Admin user on the fly** if none exists. And only 2 of the 34 controllers use `@UseGuards` at all (`tickets`, `conversations`). Every other endpoint is wide open even in production. |
| 4 | The tenant is chosen by the client | `apps/api/src/tenancy/tenant.middleware.ts` reads the `x-tenant` **request header**, which the browser sets from `sessionStorage` (`getActiveTenant()`). A user of tenant A can read tenant B by editing one header. `GET /tenants` is deliberately excluded from the middleware **and** unguarded, so it publicly lists every customer's name, subdomain and plan to feed the login dropdown. |

### Latent bugs that will surface the moment auth is switched on

These are already in the code and would fail on first real use, so the plan fixes them
as part of the work rather than discovering them at 2am:

- **`resolve_tenant_by_oidc_subject` does not exist.** `apps/api/src/auth/oidc.ts#tenantForUser`
  calls it via `$queryRaw`, but the function is in neither `packages/db/prisma/rls.sql` nor any
  of the three migrations. Any call throws `function ... does not exist`. The realtime gateway
  depends on this path.
- **`keycloak-admin.ts` ignores every HTTP failure.** `createKeycloakUser` never checks
  `res.ok`; on a duplicate email or a bad admin token it falls through to
  `users[0]!.id` and crashes with a non-null-assertion error instead of a usable message.
- **`createInvite` makes everyone an Admin.** `apps/api/src/settings/settings.service.ts`
  looks up the tenant's `Admin` role, assigns it to the new user regardless of intent,
  sets `status: 'active'` immediately, and marks the invite `accepted` without anyone
  accepting anything. It also sends no email — there is no mailer in the repo at all
  (`grep -r nodemailer|smtp|resend` returns only KB article prose).

### What "done" looks like

1. A platform admin (you / Astura staff) signs in at the root domain and sees **only** the
   Tenants section.
2. Onboarding a tenant there creates the workspace **and** its owner, and emails the owner a
   workspace link, their email, and a temporary password.
3. The owner signs in with those credentials and lands in their own workspace — and nowhere else.
4. The owner invites team members from Team & Settings with a chosen role; each gets the same
   style of email.
5. A random Gmail address that was never invited gets `401`. A member cannot reach admin
   endpoints. A tenant-A token cannot read tenant-B data no matter what headers it sends.

Once that holds, every other module can be built against a real `req.user` with real
permissions — which is the actual reason to do this now.

---

## 2. Decisions

Locked in by your answers:

| Decision | Choice | Consequence |
|---|---|---|
| Credential store | **Keycloak OIDC**, as `docs/AstronomiQ-CX-Implementation-Plan.md` §4.2 specifies | Keycloak owns passwords; our `users` table owns identity, tenant and role. Adds realm provisioning as Phase 0. |
| Email delivery | **Real provider now** (SMTP) | Invites land in real inboxes from day one. Requires a verified sender domain before Phase 7 is testable. |
| Platform admins | **Separate `platform_admins` table** | Platform staff live outside every tenant. Clean separation; needs a bootstrap script (Phase 10) since nobody can log in otherwise. |
| Invite payload | **Temp password, no forced change** | Email carries the workspace link + email + generated password, usable indefinitely. Adds a self-service "Change password" screen so users aren't stuck with it. |

### Two decisions I made, with rationale — flag if you disagree

**Login uses Keycloak's Direct Access Grant through our API, not a browser redirect to Keycloak.**
The Implementation Plan says PKCE redirect, but Rule 4 of the repo is that the UI matches
`docs/AstronomiQ-CX_1.html` exactly — and that spec has a branded email + password form.
A PKCE redirect would replace it with Keycloak's own login page. So: the browser posts
credentials to `POST /api/v1/auth/login`, and the API (which holds `OIDC_CLIENT_SECRET`)
exchanges them with Keycloak's token endpoint. Keycloak still owns and verifies passwords,
brute-force protection still applies, and no password is ever stored by us.

The trade-off is that direct grant cannot do real SSO or MFA. That is exactly what the
Google / Microsoft / SSO buttons already on the login screen are for — they get wired to
the `aq-web` PKCE client later, alongside the password form, without changing anything
built here. Phase 0 provisions **both** clients so that switch is config, not a rewrite.

**`JwtGuard` is registered globally with an opt-out, not added controller by controller.**
There are 34 controllers and 2 of them are guarded. Adding `@UseGuards` to each is 32 chances
to miss one, and a missed one is a silent open endpoint. Instead: one `APP_GUARD` provider in
`app.module.ts` plus a `@Public()` decorator on the handful of genuinely public routes
(portal, webhooks, `/auth/login`, `/auth/refresh`, `/health`). Default-deny beats default-allow.

---

## 3. Target model

### Identity

```
Keycloak realm "astronomiq"  ──►  one Keycloak user per email (username = email)
                                          │  sub (uuid)
                    ┌─────────────────────┴──────────────────────┐
                    ▼                                            ▼
      platform_admins.oidc_subject                    users.oidc_subject
      (no tenant — sees only Tenants)                 (exactly one tenant)
```

One email = one Keycloak user = **one** tenant. This is already baked in: `tenantForUser()`
returns a single tenant, and `users` has `@@unique([tenantId, email])` but no cross-tenant
guard. The plan enforces the invariant explicitly (a global unique index on `oidc_subject`,
and an invite check that rejects an email already present in another tenant). Multi-workspace
membership, if you ever want it, is a later schema change — deliberately out of scope.

### Tenancy resolution — the important inversion

Today: `tenant ← x-tenant header` (client-controlled).
After: `tenant ← the verified token's subject` (server-derived).

`x-tenant` survives only for unauthenticated dev curl in non-production, and subdomain
resolution survives only for genuinely public routes (portal, webhooks, which resolve their
own tenant from channel identity as they do now).

### Roles

Roles already exist (`DEFAULT_ROLES` in `packages/shared/src/constants.ts`) but are created
*lazily and half-heartedly* — `settings.service.ts#updateUserRole` invents a role with an
inline permission map if one is missing. Instead, all six roles with their real permission
sets get seeded at tenant provisioning, once, and the lazy path is deleted. The UI keeps
exposing three (`UI_ROLES` = Admin / Manager / Executive → `UI_ROLE_TO_DB`), unchanged.

---

## 4. Phased plan

Phases are ordered so the repo stays runnable after each one. Phases 0–2 add capability
without changing behaviour; Phase 5–6 is the switch that makes things actually locked;
9 is the visible change.

---

### Phase 0 — Make the Keycloak realm real *(infra, ~half a day)*

`infra/docker/docker-compose.yml` starts `keycloak:24` with `start-dev` and **no realm**, so
`OIDC_ISSUER=http://localhost:8080/realms/astronomiq` currently 404s. (Note: `.env` already has
a real-looking `OIDC_CLIENT_SECRET`, so a realm may exist by hand on your machine — it must be
committed as code either way, or nobody else can run the app.)

- **New** `infra/keycloak/realm-astronomiq.json` — committed realm export:
  - realm `astronomiq`, `loginWithEmailAllowed: true`, `registrationAllowed: false`
  - client **`aq-api`** — confidential, `serviceAccountsEnabled`, `directAccessGrantsEnabled`,
    service-account roles `realm-management: manage-users, view-users, query-users`
  - client **`aq-web`** — public, PKCE `S256`, redirect URIs `http://*.localtest.me:3000/*`
    and `https://*.app.astronomiq.in/*` *(provisioned now, wired later — see §2)*
  - brute-force detection on; password policy (length 10, upper, digit, special)
- **Edit** `infra/docker/docker-compose.yml` — keycloak `command: start-dev --import-realm`,
  mount `./keycloak:/opt/keycloak/data/import`, add a healthcheck.
- **New** `infra/keycloak/README.md` — how to re-export after console changes
  (`kc.sh export`), and the warning that console-only changes are lost on rebuild.
- Reconcile `OIDC_CLIENT_SECRET` in `.env` / `.env.example` with the realm file.

**Exit check:** `docker compose down -v && up -d keycloak`, then
`curl $OIDC_ISSUER/.well-known/openid-configuration` returns JSON, and a client-credentials
token request for `aq-api` succeeds.

---

### Phase 1 — Database: platform admins, invite state, the missing function *(~half a day)*

- **Edit** `packages/db/prisma/schema.prisma`:
  - **New model `PlatformAdmin`** → `platform_admins`: `id`, `email @unique`, `name`,
    `oidcSubject @unique`, `status` (active|suspended), `createdAt`, `lastLogin`.
    No `tenantId` — a root table like `Tenant`.
  - `User`: add `invitedAt`, `invitedByUserId`; add a global partial unique index on
    `oidcSubject` (`where oidc_subject is not null`); document `status` as
    `invited | active | suspended`.
  - `Invite`: add `name`, `roleId` already exists, `invitedByUserId`, `lastSentAt`,
    `acceptedAt`, `sendError`; `status` becomes `sent | accepted | revoked | failed`.
- **New migration** `add_platform_admins_and_invite_state`.
- **Edit** `packages/db/prisma/rls.sql` — append, and mirror into a
  `--create-only` migration:
  - `resolve_tenant_by_oidc_subject(text) returns uuid` — `SECURITY DEFINER`, `STABLE`,
    `search_path = public`. **This is the missing function `oidc.ts` already calls.**
  - `resolve_platform_admin_by_oidc_subject(text) returns uuid` — same shape.
  - `revoke execute ... from public; grant execute ... to astronomiq_app;`
  - `platform_admins` stays **out** of the RLS loop (no `tenant_id` to filter on), same as
    `tenants` and `plans` — call that out in the file's comment block so the next reader
    doesn't "fix" it.

**Exit check:** `select resolve_tenant_by_oidc_subject('nope')` returns null rather than erroring;
`pnpm --filter @aq/db generate && pnpm typecheck` clean.

---

### Phase 2 — Mail module *(~half a day + domain verification lead time)*

Nothing in the repo can send email today. Provider-agnostic SMTP via `nodemailer` so
Resend / SES / Postmark / Google Workspace all work by env change alone.

- **New** `apps/api/src/mail/mail.module.ts`, `mail.service.ts`
- **New** `apps/api/src/mail/templates/tenant-welcome.ts`, `team-invite.ts`,
  `password-changed.ts` — HTML + plain-text, AstronomiQ-branded, no external images
- **New** `apps/api/src/mail/workspace-url.ts` —
  `workspaceUrl(subdomain)` → `${APP_PROTOCOL}://${subdomain}.${APP_BASE_DOMAIN}`
  → dev `http://acme.localtest.me:3000`, prod `https://acme.app.astronomiq.in`.
  Replaces the single hardcoded `APP_URL=http://shopnova.localtest.me:3000` in `.env`,
  which cannot work for more than one tenant.
- **Edit** `apps/api/src/config/env.ts` + `.env.example` — see §6.
- `MailService.send()` **never swallows errors**: it returns success/failure so the caller can
  persist `Invite.sendError` and the UI can offer *Resend*. A silent mail failure means a
  tenant who can never log in and no trace of why.

**Setup checklist (do this early — DNS propagation is the long pole):** pick the provider,
verify the sending domain, publish SPF + DKIM (and DMARC), set `MAIL_FROM` to that domain.
Sending from an unverified domain puts every invite in spam, which will look like a code bug.

**Exit check:** a temporary `POST /dev/mail-test` (removed after) delivers a rendered
`team-invite` to a real inbox, passing SPF/DKIM in the received headers.

---

### Phase 3 — Harden the Keycloak admin wrapper *(~half a day)*

Rewrite `apps/api/src/auth/keycloak-admin.ts`:

- cache the admin token until ~30s before expiry (currently fetched on every call)
- **check `res.ok` on every request** and throw a typed `KeycloakError` with the response body
- `createKeycloakUser({ email, name, tempPassword })` — sets `credentials: [{ type: 'password',
  value, temporary: false }]` inline, `requiredActions: []` *(per the no-forced-change
  decision)*, `emailVerified: true`, and reads the new id from the **`Location` response
  header** instead of a follow-up search
- `findKeycloakUserByEmail`, `setKeycloakPassword`, `setKeycloakUserEnabled`,
  `deleteKeycloakUser` *(needed for rollback and invite revocation)*
- `passwordLogin(email, password)` → direct-grant token exchange
- `refreshAccessToken(refreshToken)`, `keycloakLogout(refreshToken)`
- **New** `apps/api/src/auth/temp-password.ts` — `generateTempPassword()`, 16 chars from an
  unambiguous alphabet (no `O/0/l/1/I`), satisfying the realm password policy

**Exit check:** unit tests with a mocked fetch cover duplicate-email (409) and
bad-secret (401) paths returning clear errors, not crashes.

---

### Phase 4 — Real login endpoints *(~1 day)*

- **New** `apps/api/src/auth/identity.service.ts` — the single place that turns a verified
  token subject into either `{ kind: 'platform', admin }` or
  `{ kind: 'tenant', tenantId, user, permissions }`, using the two SQL resolvers from Phase 1.
- **Rewrite** `apps/api/src/auth/auth.controller.ts`:
  - `POST /auth/login` `{ email, password }` → direct grant → verify → resolve identity →
    `{ accessToken, refreshToken, expiresIn, kind, user, tenant?, permissions, }`.
    Rejects suspended users and suspended tenants. Updates `lastLogin`.
    **One generic message** — "Invalid email or password" — for every failure mode, so the
    endpoint can't be used to enumerate which emails exist.
  - `POST /auth/refresh`, `POST /auth/logout`
  - `GET /auth/me` — real user; **delete the `'Demo User'` fallback**
  - `POST /auth/change-password` `{ currentPassword, newPassword }` → verifies via direct
    grant, then sets the new password; sends `password-changed`. Needed because we are not
    forcing a change at first login.
- **Edit** `apps/api/src/auth/oidc.ts` → **delete `loadDevUser`** entirely.
- **Edit** `apps/api/src/auth/jwt.guard.ts` → remove the no-token dev branch; no token ⇒ 401
  in every environment.
- Add `@nestjs/throttler`: 5 attempts/min per IP+email on `/auth/login`,
  `/auth/change-password`.

**Exit check:** `POST /auth/login` with a never-invited Gmail returns 401. With a seeded
user's real credentials it returns a token whose `/auth/me` shows the right tenant and role.

---

### Phase 5 — Tenancy from the token, not the header *(~half a day — the real security fix)*

Rewrite `apps/api/src/tenancy/tenant.middleware.ts`:

1. Public allowlist (`/health`, `/auth/login`, `/auth/refresh`, `/webhooks/*`, `/portal/*`)
   → no token required. Webhooks keep resolving their own tenant from channel identity
   (e.g. WhatsApp's `phone_number_id`) as they do now. `/portal/*` is the one route that
   legitimately still needs **subdomain** resolution — it's the customer-facing self-service
   bundle with no login — so keep the subdomain path alive for it, but only for it, and
   rate-limit it.
2. `Authorization` present → verify, then **tenant comes from
   `resolve_tenant_by_oidc_subject(sub)`**. `x-tenant` is *ignored*.
3. Platform-admin subject → no tenant on the request; only `PlatformAdminGuard` routes accept it.
4. `x-tenant` honoured **only** when `NODE_ENV !== 'production'` **and** there is no
   `Authorization` header (dev curl convenience).
5. **Remove the `/tenants` exclusion.** That hack exists to let the login dropdown list every
   workspace; the dropdown is being deleted in Phase 9.

Also **new** `apps/api/src/auth/platform-admin.guard.ts`.

**Exit check:** authenticate as a tenant-A user, send `x-tenant: <tenant-B-subdomain>` to
`GET /tickets` — still tenant A's tickets. This is the test that proves the isolation.

---

### Phase 6 — Lock every endpoint *(~1 day)*

- **Edit** `apps/api/src/app.module.ts` — register `JwtGuard` as `APP_GUARD`.
- **New** `apps/api/src/auth/public.decorator.ts` — `@Public()`; `JwtGuard` honours it via
  `Reflector`. Apply to `app.controller.ts` health, `auth` login/refresh,
  `portal.controller.ts`, `whatsapp` + `telephony/exotel-webhook` controllers.
- Remove the now-redundant `@UseGuards(JwtGuard)` lines in `tickets` and `conversations`
  (keep `PermissionsGuard` where `@Perms` is used).
- Add `@Perms(...)` where authority actually matters:
  `settings` invites/roles/status → `user.invite` / `user.edit`; `settings` toggles →
  `settings.edit`; `billing` → `billing.view`; `audit` → `audit.view`;
  `sla` writes → `sla.edit`; `kb`/`macros` writes → `kb.edit`/`macro.edit`;
  `automations`/`agent-builder` → `rule.edit`/`flow.edit`.
- `TenantsController` → `@UseGuards(PlatformAdminGuard)` on every route.
- **New** `apps/api/src/tenants/default-roles.ts` — the six `DEFAULT_ROLES` with real
  permission arrays drawn from `PERMISSIONS`. **Delete** the inline `PERMS_BY_ROLE` map in
  `settings.service.ts#updateUserRole` and its lazy `role.create`.
- **Edit** `apps/api/src/nav/nav.service.ts` — `unreadNotifications` becomes per-user
  (`where: { userId }`) now that a user exists; its own comment already asks for this.

**Exit check:** a script that hits every route with no token expects 401 except the
`@Public()` list; with an Executive token, admin routes return 403.

---

### Phase 7 — Tenant onboarding from the Tenants section *(~1.5 days)*

**New** `apps/api/src/tenants/provision-tenant.service.ts` — `provision({ name, subdomain,
plan, ownerName, ownerEmail })`:

1. **Preflight** — subdomain free; `ownerEmail` not in `users` (any tenant), not in
   `platform_admins`, not in Keycloak.
2. **Postgres transaction** — tenant row · six default roles · `TenantSettings` (default
   toggles + the D.1 priority matrix) · a default department · owner `User`
   (`status: 'invited'`, Admin role) · `Invite` row (`status: 'sent'`).
3. **Keycloak** — `createKeycloakUser` with `generateTempPassword()`; write the returned `sub`
   back to `users.oidc_subject`.
4. **Mail** — `tenant-welcome`: workspace URL, their email, the temporary password.
5. **Audit** — `audit_logs` entry attributed to the platform admin.

Because Keycloak and SMTP are not in the Postgres transaction, compensation is explicit:
Keycloak create fails ⇒ roll the tenant back (nothing references it yet). Mail fails ⇒ keep
everything, set `Invite.status = 'failed'` + `sendError`, and surface **Resend** in the UI.
Re-running provision for the same subdomain is rejected, not silently duplicated.

- **Edit** `apps/api/src/tenants/create-tenant.dto.ts` + `packages/shared/src/dto/tenant.ts`
  — add `ownerName`, `ownerEmail`; extend `TenantDto` with `ownerEmail`, `ownerInviteStatus`.
- **New endpoints** on `TenantsController`: `POST /tenants/:id/owner/resend-invite`,
  `POST /tenants/:id/owner/reset-password`.
- **Edit** `PATCH /tenants/:id/status` — suspending a tenant also disables all its Keycloak
  users, so a suspended tenant genuinely cannot log in (today `status` only blocks the
  middleware lookup).
- **Edit** `apps/web/src/modules/admin/TenantsAdmin.tsx` — the "New tenant" form gains
  **Owner name** and **Owner email**; the table gains an owner column with invite state
  (Sent / Active / Failed); row actions **Resend invite**, **Reset owner password**, Suspend.
  The generated password is **never shown in the UI or an API response** — it exists only in
  the email.

**Exit check:** onboard a tenant against a real inbox; the email arrives with a working link;
signing in with it lands in the new workspace with the Admin role and a seeded settings page.

---

### Phase 8 — Team members from Team & Settings *(~1 day)*

**Rewrite** `apps/api/src/settings/settings.service.ts#createInvite` — same shape as Phase 7
but scoped to the caller's tenant:

- DTO gains `name` and `roleName` (`UI_ROLES`); `departmentId` stays optional.
  *(Today it takes only `email` and force-assigns Admin.)*
- Guarded by `@Perms('user.invite')`; only an Admin may invite another Admin.
- Rejects an email already in this tenant, or present in any other tenant / `platform_admins`
  (the one-email-one-tenant invariant).
- Creates the Keycloak user + temp password → `User` row with the **chosen** role and
  `status: 'invited'` → `Invite` row → `team-invite` email with workspace URL, email, password.
- **New endpoints:** `POST /settings/users/:id/resend-invite`,
  `POST /settings/users/:id/reset-password`,
  `PATCH /settings/users/:id/status` (active ⇄ suspended, mirrored to Keycloak `enabled`),
  `DELETE /settings/invites/:id` (revoke → delete the Keycloak user if they never logged in,
  so the emailed password dies with it).
- `getSettings` no longer needs its `unacceptedInvites` email de-dup hack — invites and users
  are now created together and `status` distinguishes them.
- **Edit** `apps/web/src/modules/settings/TeamSettings.tsx` — invite form gains Name + Role +
  Department; each row gets Resend / Reset password / Suspend / Revoke, hidden unless the
  viewer holds `user.invite` / `user.edit`.

**Exit check:** owner invites an Executive; that person signs in from the email and gets
403 on `POST /settings/invites` and on `GET /tenants`.

---

### Phase 9 — Web app wiring *(~1.5 days)*

- **Rewrite** `apps/web/src/state/auth.tsx` — real session
  (`accessToken` in memory, `refreshToken` in `sessionStorage`, `expiresAt`, `user`, `tenant`,
  `permissions`, `isPlatformAdmin`), silent refresh ~60s before expiry, `hasPerm(p)` helper.
  **Delete** the `'shopnova'` fallback in `getActiveTenant()` — a fallback tenant is how you
  get "logged in" without logging in.
- **Edit** `apps/web/src/lib/api/hooks.ts` — collapse the five near-identical fetch helpers
  (lines ~112–160) into one `apiFetch` that attaches `Authorization: Bearer`, drops
  `x-tenant`, and on 401 attempts one refresh then signs out.
- **Edit** `apps/web/src/pages/Login.tsx` — bind the existing email/password inputs
  (they are currently uncontrolled and unread) to `POST /auth/login`; **remove the workspace
  dropdown and `useTenants()`** (tenant now comes from the account, and that endpoint is
  platform-admin-only); remove the ⚠️ demo-note block; inline error on failure;
  SSO buttons disabled with a "coming soon" title until the PKCE switch.
  Markup otherwise untouched, per Rule 4.
- **Edit** `apps/web/src/App.tsx` — platform admins get a Tenants-only shell; tenant users get
  routes filtered by `hasPerm`, with direct navigation to a forbidden route redirecting.
- **Edit** `apps/web/src/lib/views.ts` + `layout/Sidebar.tsx` — each view declares a required
  permission; the sidebar renders only what the role can reach.
- **Edit** `apps/web/src/layout/Topbar.tsx` — real name / initials / role from `/auth/me`;
  sign-out calls `POST /auth/logout`.
- **New** `apps/web/src/pages/ChangePassword.tsx` — reachable from the Topbar menu.

**Exit check:** clearing `sessionStorage` logs you out; setting `aq.authed = '1'` by hand does
nothing; a reload keeps the session via refresh token; an Executive's sidebar has no Tenants
or Billing entry.

---

### Phase 10 — Bootstrap, seed, and end-to-end verification *(~1 day)*

There is a chicken-and-egg problem: with auth on, nobody can log in to create the first
platform admin.

- **New** `apps/api/src/scripts/create-platform-admin.ts` +
  `"platform-admin": "ts-node src/scripts/create-platform-admin.ts"` in `apps/api/package.json`
  — creates a Keycloak user and a `platform_admins` row from `--email --name`, prints the
  temp password once.
- **Edit** `packages/db/src/seed/index.ts` — seeded users (`shopnova`, `northwind`) currently
  have no `oidcSubject`, so none of them can log in. Add an idempotent `seed:auth` step that
  provisions Keycloak users for seeded members with a known dev password, and skips cleanly
  when Keycloak is unreachable so `pnpm seed` still works offline.
- **New** `apps/api/test/auth-onboarding.e2e-spec.ts` covering, in order:

| # | Assertion |
|---|---|
| 1 | `POST /auth/login` with a never-invited Gmail → **401** *(the reported bug)* |
| 2 | Any business endpoint with no token → **401** *(not a silently-created admin)* |
| 3 | Platform admin can `GET /tenants`; a tenant Admin gets **403** |
| 4 | `POST /tenants` provisions tenant + owner + roles + settings and queues one email |
| 5 | Owner logs in with the emailed password → `/auth/me` shows the new tenant + Admin |
| 6 | Owner invites an Executive → that user logs in → **403** on `POST /settings/invites` |
| 7 | Tenant-A token + `x-tenant: tenant-b` → still tenant-A data *(isolation)* |
| 8 | Suspending a tenant makes its users' logins fail |
| 9 | Revoking an invite makes the emailed password stop working |
| 10 | Provisioning with a duplicate subdomain or owner email → **409**, nothing partially created |

- **Edit** `README.md` (the status table still says `apps/api` "🚧 planned" — it is built) and
  `REQUIREMENTS.txt` (add the realm import, the platform-admin bootstrap, and SMTP setup to
  first-time setup).

---

## 5. Suggested sequencing

| Order | Phases | Why together | Rough size |
|---|---|---|---|
| 1 | 0, 1, 2 | Pure capability — realm, schema, mailer. Nothing behaves differently yet, so it can land while other work continues. Start the sender-domain DNS verification on day one. | ~1.5 days |
| 2 | 3, 4 | Keycloak wrapper + login endpoints. The API can authenticate, but nothing requires it yet. | ~1.5 days |
| 3 | **5, 6** | The switch. Tenant comes from the token and everything is default-deny. **Merge these two together** — Phase 6 without Phase 5 means guarded endpoints that still trust `x-tenant`. Expect a day of fixing modules that quietly relied on the dev user. | ~1.5 days |
| 4 | 7, 8 | The onboarding flows you described, now on a foundation that can enforce them. | ~2.5 days |
| 5 | 9 | Web wiring. Do it last so the UI is built against final API shapes. | ~1.5 days |
| 6 | 10 | Bootstrap, seed, e2e. | ~1 day |

**~9–10 working days** for one developer, plus DNS lead time in parallel. Steps 1 and 2 are
low-risk and mergeable to `main` incrementally; step 3 is the one that wants a branch, both
developers around, and a careful pass over the modules that currently lean on `loadDevUser`.

---

## 6. Environment variables

New (add to `.env.example` and `apps/api/src/config/env.ts`'s zod schema):

```ini
# ---- app URLs (replaces the single-tenant APP_URL) ----
APP_PROTOCOL=http                    # https in production
APP_BASE_DOMAIN=localtest.me:3000    # app.astronomiq.in in production

# ---- mail (SMTP — provider-agnostic) ----
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@astronomiq.in     # must be on a domain with SPF+DKIM published
MAIL_FROM_NAME=AstronomiQ CX

# ---- keycloak realm admin (the aq-api service account) ----
KEYCLOAK_REALM=astronomiq            # currently parsed out of OIDC_ISSUER by string replace
```

Changed: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` become **required** in the zod
schema (today all three are `.optional()`, which is what lets the app boot with no auth at
all). `APP_URL` is removed in favour of the two `APP_*` vars above.

### New dependencies (`apps/api`)

`nodemailer` + `@types/nodemailer` (Phase 2) and `@nestjs/throttler` (Phase 4). Nothing else
is needed — `jose` is already there for token verification, and Keycloak's Admin REST API is
reached with plain `fetch`, as `keycloak-admin.ts` already does.

One cleanup worth doing while in `keycloak-admin.ts`: it derives the admin base URL with
`env.OIDC_ISSUER.replace('/realms/astronomiq', '')` — a hardcoded realm name in a string
replace. Use `KEYCLOAK_REALM` and a proper URL parse.

---

## 7. Security invariants to hold onto

These are the properties worth writing tests against, because each one is a hole that exists today:

1. **No token, no data.** Default-deny via global guard; `@Public()` is an explicit,
   reviewable list.
2. **The client never picks the tenant.** Tenant is derived from the verified subject.
   `x-tenant` is dev-only and ignored whenever a token is present.
3. **Tenant names are not public.** `GET /tenants` is platform-admin only.
4. **Passwords exist only in Keycloak and in the recipient's inbox** — never in our DB,
   never in an API response, never in a log line, never in the UI. Redact
   `password` / `tempPassword` in any request logging.
5. **One email, one tenant, one Keycloak user** — enforced at invite time and by a global
   unique index on `oidc_subject`.
6. **Suspension is real.** Suspending a tenant or a user disables their Keycloak login, not
   just a row in our database.
7. **Roles come from the inviter's choice**, never defaulted to Admin.
8. **Generic auth errors.** Login failures don't reveal whether the email exists.

---

## 8. Risks and how they're handled

| Risk | Handling |
|---|---|
| Keycloak and Postgres can't share a transaction, so provisioning can half-fail | Explicit compensation per step (Phase 7): roll back the tenant if Keycloak fails; keep the tenant and expose *Resend* if mail fails. `Invite.sendError` makes a stuck tenant visible instead of silent. |
| Invite emails land in spam | Verify the sender domain and publish SPF/DKIM/DMARC in Phase 2, before Phase 7 is testable. Surface delivery failure in the UI rather than assuming success. |
| Turning on guards breaks modules that leaned on `loadDevUser` | Phases 5+6 land together on a branch; the route sweep in Phase 6's exit check finds them systematically rather than by bug report. |
| Seeded demo users can't log in once auth is real | `seed:auth` in Phase 10 gives them Keycloak identities with a known dev password. |
| Direct grant blocks real SSO/MFA later | Both Keycloak clients are provisioned in Phase 0; the existing Google/Microsoft/SSO buttons become the PKCE path without touching anything else. |
| A tenant admin escalates themselves to platform admin | Platform admins live in a separate table with no tenant-facing write path; no endpoint creates one — only the CLI script does. |

---

## 9. Explicitly out of scope

Multi-workspace membership for one email · self-service signup (`registrationAllowed: false`) ·
forgot-password email flow (deliberate: temp passwords don't expire, and `POST
/auth/change-password` covers the need — worth adding right after) · SCIM / directory sync ·
per-tenant Keycloak realms · MFA · session revocation lists beyond Keycloak's own · the PKCE
SSO switch (provisioned, not wired).
