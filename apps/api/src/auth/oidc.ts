import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getPrisma, withTenant } from '@aq/db';
import { env } from '../config/env';

// Keycloak publishes its public keys here — we fetch them once and reuse them.
const JWKS = env.OIDC_ISSUER
  ? createRemoteJWKSet(new URL(`${env.OIDC_ISSUER}/protocol/openid-connect/certs`))
  : null;

/** Checks the token is genuine and not expired, and returns its claims. */
export async function verifyOidcToken(token: string) {
  if (!JWKS || !env.OIDC_ISSUER) {
    throw new Error('OIDC_ISSUER is not configured');
  }
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: env.OIDC_ISSUER,
  });
  return payload; // contains "sub" (the user's id in Keycloak), email, etc.
}

/** Loads the user from OUR database using the tenant + the id from the token. */
export async function loadUser(tenantId: string, oidcSubject: string) {
  return withTenant(getPrisma(), tenantId, async (tx) => {
    const user = await tx.user.findFirst({ where: { oidcSubject } });
    if (!user) throw new Error('User not found in this workspace');

    const role = user.roleId ? await tx.role.findUnique({ where: { id: user.roleId } }) : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      departmentId: user.departmentId,
      role: role?.name ?? null,
      permissions: (role?.permissions as string[]) || [],
    };
  });
}

/**
 * Dev-only stand-in for a logged-in user (Guide §7 — no real Keycloak login wired into
 * apps/web yet). When `email` is given (from the x-user-email header — see jwt.guard.ts
 * and auth.controller.ts's dev login endpoint) it loads that exact user, so different
 * browser sessions can be signed in as different roles for RBAC testing. Without one, it
 * falls back to picking any real user (old sessions predating the login flow). Never
 * called in production — JwtGuard gates that. Replace with real Keycloak login (Guide §7).
 */
export async function loadDevUser(tenantId: string, email?: string) {
  return withTenant(getPrisma(), tenantId, async (tx) => {
    let user = email
      ? await tx.user.findFirst({ where: { email } })
      : await tx.user.findFirst({ where: { roleId: { not: null } }, orderBy: { name: 'asc' } });

    if (!user && email) throw new Error(`No user "${email}" in this workspace`);

    if (!user) {
      const invite = await tx.invite.findFirst({ where: { tenantId } });
      const role =
        (await tx.role.findFirst({ where: { tenantId, name: 'Admin' } })) ??
        (await tx.role.findFirst({ where: { tenantId } }));

      if (role) {
        const fallbackEmail = invite?.email ?? 'admin@workspace.local';
        user = await tx.user.create({
          data: {
            tenantId,
            name: fallbackEmail.split('@')[0]!,
            email: fallbackEmail,
            roleId: role.id,
            status: 'active',
            avatarColor: '#2563EB',
          },
        });
      }
    }
    if (!user) throw new Error('No user available for the dev auth stand-in');

    const role = user.roleId ? await tx.role.findUnique({ where: { id: user.roleId } }) : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      departmentId: user.departmentId,
      role: role?.name ?? null,
      permissions: (role?.permissions as string[]) || [],
    };
  });
}

/**
 * Finds which company (tenant) a user belongs to — used by the live-updates
 * connection, where the tenant genuinely isn't known yet (that's the whole
 * point of this lookup). Can't go through withTenant() for that reason, and
 * a bare cross-tenant query would either return nothing or (before the RLS
 * fix — see repo memory) leak every tenant's users. Uses a narrow
 * SECURITY DEFINER SQL function instead: it runs with the function owner's
 * privileges (bypassing RLS) for this one specific, audited lookup, while
 * the app's own DB role keeps zero broader bypass capability.
 */
export async function tenantForUser(oidcSubject: string): Promise<string> {
  const rows = await getPrisma().$queryRaw<
    Array<{ tenant_id: string | null }>
  >`SELECT resolve_tenant_by_oidc_subject(${oidcSubject}) as tenant_id`;
  const tenantId = rows[0]?.tenant_id;
  if (!tenantId) throw new Error('User has no workspace');
  return tenantId;
}
