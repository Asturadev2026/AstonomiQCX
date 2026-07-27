import { useState } from 'react';
import { useCreateInvite, useSettings, useToggleSetting } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { ErrorState, LoadingState } from '../../components/states';
import type { SettingsToggles } from '../../lib/api/types';

const TOGGLE_META: { key: keyof SettingsToggles; title: string; desc: string }[] = [
  { key: 'autoResolve', title: 'Auto-resolve with AI', desc: 'Let Astra close routine tickets' },
  { key: 'hindiSupport', title: 'Hindi & regional languages', desc: 'Auto-detect and reply in kind' },
  { key: 'sentimentRouting', title: 'Sentiment-based routing', desc: 'Send upset customers to seniors' },
  { key: 'autoQa', title: '100% Auto QA', desc: 'Score every interaction' },
  { key: 'afterHoursVoice', title: 'After-hours voice bot', desc: 'Astra takes calls 24×7' },
];

const inputStyle = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  padding: 11,
  fontSize: 13,
  outline: 'none',
  color: 'var(--text)',
} as const;

/**
 * Team & Settings — exact port of the prototype's #settings section: team members table,
 * platform feature toggles and the connected channels/integrations grid. Toggles really
 * flip TenantSettings.toggles server-side; invites really create an Invite row.
 */
export function TeamSettings() {
  const { data, isLoading, error, refetch } = useSettings();
  const toggleSetting = useToggleSetting();
  const createInvite = useCreateInvite();
  const toast = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function sendInvite() {
    if (!email.trim()) return;
    createInvite.mutate(
      { email: email.trim() },
      {
        onSuccess: () => {
          toast('Invite sent ✓');
          setEmail('');
          setShowInvite(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not send invite'),
      },
    );
  }

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <h3>Team members</h3>
              <div className="cap">Manage who has access to the workspace</div>
            </div>
            <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowInvite((s) => !s)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Invite
            </button>
          </div>
          {showInvite && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@shopnova.in"
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              />
              <button className="btn btn-g" disabled={createInvite.isPending} onClick={sendInvite}>
                Send
              </button>
            </div>
          )}
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="u-cell">
                      <div className="ua" style={{ background: u.avatarColor ?? '#94A3B8' }}>
                        {u.initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role ${u.roleClass}`}>{u.roleLabel}</span>
                  </td>
                  <td>{u.teamName ?? '—'}</td>
                  <td>
                    <span className="st-on" style={u.status === 'Pending' ? { color: 'var(--amber)' } : undefined}>
                      <span className="dot" style={u.status === 'Pending' ? { background: 'var(--amber)' } : undefined} />
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Platform settings</h3>
          <div className="cap">Turn features on or off</div>
          {TOGGLE_META.map((t) => (
            <div className="toggle-row" key={t.key}>
              <div>
                <div className="tr-t">{t.title}</div>
                <div className="tr-d">{t.desc}</div>
              </div>
              <div
                className={`sw ${data.toggles[t.key] ? 'on' : ''}`}
                style={{ opacity: toggleSetting.isPending ? 0.6 : 1, pointerEvents: toggleSetting.isPending ? 'none' : 'auto' }}
                onClick={() =>
                  toggleSetting.mutate(
                    { key: t.key },
                    { onSuccess: () => toast('Setting updated ✓'), onError: () => toast('Could not update setting') },
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="sect-title">
        <h2>Connected channels &amp; integrations</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {data.integrations.map((c) => (
          <div key={c.id} className="card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toast(`${c.label} settings…`)}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `${c.color}18`,
                display: 'grid',
                placeItems: 'center',
                fontSize: 20,
                margin: '0 auto 10px',
              }}
            >
              {c.icon}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 3 }}>● {c.status}</div>
          </div>
        ))}
        <div className="card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toast('120+ integrations available…')}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#94A3B818',
              display: 'grid',
              placeItems: 'center',
              fontSize: 20,
              margin: '0 auto 10px',
            }}
          >
            ➕
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Add new</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>120+ available</div>
        </div>
      </div>
    </>
  );
}
