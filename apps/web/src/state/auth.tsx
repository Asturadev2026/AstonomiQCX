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

/** Non-hook accessor for the plain fetch helpers in lib/api/hooks.ts and
 * VoiceAi.tsx, which aren't React components and can't call useAuth(). Falls
 * back to 'shopnova' so pre-login calls (e.g. the login screen's own
 * workspace list) don't break — real pages are unreachable until signIn(). */
export function getActiveTenant(): string {
  return sessionStorage.getItem(TENANT_KEY) ?? 'shopnova';
}

interface AuthState {
  authed: boolean;
  tenantSubdomain: string | null;
  signIn: (subdomain: string) => void;
  signOut: () => void;
}

const AuthCtx = createContext<AuthState>({
  authed: false,
  tenantSubdomain: null,
  signIn: () => {},
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
  const signIn = (subdomain: string) => {
    sessionStorage.setItem('aq.authed', '1');
    sessionStorage.setItem(TENANT_KEY, subdomain);
    setTenantSubdomain(subdomain);
    setAuthed(true);
    // Every cached query belongs to whichever tenant was active when it ran —
    // without this, switching workspaces would keep showing the previous
    // tenant's data until each query happened to refetch on its own.
    queryClient.clear();
  };
  const signOut = () => {
    sessionStorage.removeItem('aq.authed');
    sessionStorage.removeItem(TENANT_KEY);
    setTenantSubdomain(null);
    setAuthed(false);
    queryClient.clear();
  };
  return (
    <AuthCtx.Provider value={{ authed, tenantSubdomain, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
