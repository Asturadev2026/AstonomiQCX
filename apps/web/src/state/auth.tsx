import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

/**
 * TEMPORARY auth — mirrors the prototype's demo login.
 * Replaced by Keycloak OIDC (PKCE) in Phase A auth step (Plan §4.2/§4.6);
 * only this file and Login.tsx change when that happens.
 */

interface AuthState {
  authed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthCtx = createContext<AuthState>({
  authed: false,
  signIn: () => {},
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem('aq.authed') === '1',
  );
  const signIn = () => {
    sessionStorage.setItem('aq.authed', '1');
    setAuthed(true);
  };
  const signOut = () => {
    sessionStorage.removeItem('aq.authed');
    setAuthed(false);
  };
  return (
    <AuthCtx.Provider value={{ authed, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
