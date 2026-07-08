import { env } from '../config/env';

/** Gets an admin token to manage users in Keycloak. */
async function adminToken(): Promise<string> {
  const res = await fetch(`${env.OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.OIDC_CLIENT_ID!,
      client_secret: env.OIDC_CLIENT_SECRET!,
    }),
  });
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

/** Creates a new login and forces the user to set their own password on first login. */
export async function createKeycloakUser(email: string, name: string): Promise<string> {
  if (!env.OIDC_ISSUER) throw new Error('OIDC_ISSUER is not configured');
  const token = await adminToken();
  const base = env.OIDC_ISSUER.replace('/realms/astronomiq', '');

  await fetch(`${base}/admin/realms/astronomiq/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      email,
      firstName: name,
      enabled: true,
      requiredActions: ['UPDATE_PASSWORD'],
    }),
  });

  // find the new user's id (Keycloak's "sub") to link in our database
  const found = await fetch(
    `${base}/admin/realms/astronomiq/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const users = (await found.json()) as Array<{ id: string }>;
  return users[0]!.id; // this is the oidcSubject we store on our User row
}
