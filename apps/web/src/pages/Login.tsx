import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useTenants } from '../lib/api/hooks';

/**
 * Login — exact port of the prototype's login screen, plus a workspace
 * picker (there's no real per-user tenant membership yet — Guide §8 — so for
 * now you just pick which seeded tenant to sign into).
 * The demo sign-in is replaced by a Keycloak PKCE redirect in the auth step;
 * only doLogin() and this workspace picker change then.
 */
export function Login() {
  const { signIn } = useAuth();
  const { data: tenants } = useTenants();
  const [subdomain, setSubdomain] = useState('');
  const [busy, setBusy] = useState(false);
  const activeTenants = tenants?.filter((t) => t.status === 'active') ?? [];

  const doLogin = () => {
    if (!subdomain) return;
    setBusy(true);
    setTimeout(() => signIn(subdomain), 500); // mirrors prototype behaviour until Keycloak
  };

  return (
    <div className="login">
      <div className="login-brand">
        <div className="lb-logo">
          <div className="mark">
            <i />
          </div>
          <div>
            <b>AstronomiQ</b>
            <span>CX Platform</span>
          </div>
        </div>
        <div className="lb-hero">
          <h1>
            Every customer signal,
            <br />
            one intelligent orbit.
          </h1>
          <p>
            AI-powered customer experience across WhatsApp, chat, voice, email
            and social — built for Indian brands. Astra resolves the routine,
            your team handles the rest.
          </p>
          <div className="lb-stats">
            <div>
              <b>73%</b>
              <small>auto-resolved by AI</small>
            </div>
            <div>
              <b>11</b>
              <small>languages incl. हिन्दी</small>
            </div>
            <div>
              <b>1,000+</b>
              <small>enterprises trust us</small>
            </div>
          </div>
          <div className="lb-badges">
            <span className="lb-badge">🔒 ISO 27001</span>
            <span className="lb-badge">🇮🇳 Data in India</span>
            <span className="lb-badge">✅ GDPR &amp; DPDP ready</span>
          </div>
        </div>
      </div>
      <div className="login-form">
        <h2>Welcome back 👋</h2>
        <p className="lead">Sign in to your AstronomiQ CX workspace</p>
        <div className="field">
          <label>Workspace</label>
          <select
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--panel)',
              border: '1.5px solid var(--line2)',
              borderRadius: 11,
              padding: '13px 14px',
              fontSize: 14,
              color: 'var(--text)',
              outline: 'none',
            }}
          >
            <option value="" disabled>
              {tenants ? 'Select a workspace…' : 'Loading workspaces…'}
            </option>
            {activeTenants.map((t) => (
              <option key={t.id} value={t.subdomain}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Work email</label>
          <div className="inp">
            <svg className="fic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <input type="email" placeholder="you@company.in" />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <div className="inp">
            <svg className="fic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <input type="password" placeholder="••••••••" />
          </div>
        </div>
        <div className="frow">
          <label>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--blue)' }} /> Remember me
          </label>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Forgot password?
          </a>
        </div>
        <button className="btn-login" onClick={doLogin} disabled={busy || !subdomain}>
          {busy ? 'Signing in…' : 'Sign in to workspace'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <div className="divider">or continue with</div>
        <div className="sso">
          <button onClick={doLogin} disabled={busy || !subdomain}>🔵 Google</button>
          <button onClick={doLogin} disabled={busy || !subdomain}>🪟 Microsoft</button>
          <button onClick={doLogin} disabled={busy || !subdomain}>🔑 SSO</button>
        </div>
        <div className="demo-note">
          ⚠️ Auth is not wired yet — Sign in currently opens the workspace
          without verification. Replaced by Keycloak OIDC in the auth step
          (Plan §4.2); only <code>state/auth.tsx</code> and this button change.
        </div>
        <div className="login-foot">
          New to AstronomiQ?{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              doLogin();
            }}
          >
            Start free trial
          </a>
        </div>
      </div>
    </div>
  );
}
