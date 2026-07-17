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
