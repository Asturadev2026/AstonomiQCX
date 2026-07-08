import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getPrisma } from '@aq/db';
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
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { tenantId, oidcSubject },
  });
  if (!user) throw new Error('User not found in this workspace');

  const role = user.roleId
    ? await prisma.role.findUnique({ where: { id: user.roleId } })
    : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    departmentId: user.departmentId,
    permissions: (role?.permissions as string[]) || [],
  };
}

/** Finds which company (tenant) a user belongs to — used by the live-updates connection. */
export async function tenantForUser(oidcSubject: string): Promise<string> {
  const user = await getPrisma().user.findFirst({
    where: { oidcSubject },
    select: { tenantId: true },
  });
  if (!user) throw new Error('User has no workspace');
  return user.tenantId;
}
