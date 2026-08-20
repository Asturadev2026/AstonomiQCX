import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * TEMPORARY auth — mirrors the prototype's demo login.
 * Replaced by Keycloak OIDC (PKCE) in Phase A auth step (Plan §4.2/§4.6);
 * only this file and Login.tsx change when that happens.
 */

const TENANT_KEY = 'aq.tenant';
const USER_EMAIL_KEY = 'aq.userEmail';

/** Non-hook accessor for the plain fetch helpers in lib/api/hooks.ts and
 * VoiceAi.tsx, which aren't React components and can't call useAuth(). Falls
 * back to 'shopnova' so pre-login calls (e.g. the login screen's own
 * workspace list) don't break — real pages are unreachable until login(). */
export function getActiveTenant(): string {
  return sessionStorage.getItem(TENANT_KEY) ?? 'shopnova';
}

/** Which demo user (Admin/Manager/Agent) this browser session logged in as — sent as
 * x-user-email so the dev-only JwtGuard stand-in (apps/api/src/auth/jwt.guard.ts) knows
 * which real user's role/permissions to load. Empty before login. */
export function getActiveUserEmail(): string {
  return sessionStorage.getItem(USER_EMAIL_KEY) ?? '';
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  authed: boolean;
  tenantSubdomain: string | null;
  /** Checks email+password against the chosen workspace's users (dev-only demo login —
   * see auth.controller.ts) and signs in on success. */
  login: (subdomain: string, email: string, password: string) => Promise<LoginResult>;
  signOut: () => void;
}

const AuthCtx = createContext<AuthState>({
  authed: false,
  tenantSubdomain: null,
  login: async () => ({ ok: false, error: 'Not ready' }),
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem('aq.authed') === '1',
  );
  const [tenantSubdomain, setTenantSubdomain] = useState<string | null>(
    () => sessionStorage.getItem(TENANT_KEY),
  );

  const login = async (subdomain: string, email: string, password: string): Promise<LoginResult> => {
    let res: Response;
    try {
      res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant': subdomain },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return { ok: false, error: 'Could not reach the server' };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.message ?? 'Incorrect email or password' };
    }

    sessionStorage.setItem('aq.authed', '1');
    sessionStorage.setItem(TENANT_KEY, subdomain);
    sessionStorage.setItem(USER_EMAIL_KEY, email);
    setTenantSubdomain(subdomain);
    setAuthed(true);
    // Every cached query belongs to whichever tenant/user was active when it ran —
    // without this, switching workspaces would keep showing the previous
    // tenant's data until each query happened to refetch on its own.
    queryClient.clear();
    return { ok: true };
  };

  const signOut = () => {
    sessionStorage.removeItem('aq.authed');
    sessionStorage.removeItem(TENANT_KEY);
    sessionStorage.removeItem(USER_EMAIL_KEY);
    setTenantSubdomain(null);
    setAuthed(false);
    queryClient.clear();
  };
  return (
    <AuthCtx.Provider value={{ authed, tenantSubdomain, login, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
