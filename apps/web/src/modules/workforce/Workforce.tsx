import { useWorkforceBoard, useWorkforceRoster } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import type { AgentStatus } from '../../lib/api/types';

/**
 * Workforce — exact port of the prototype's #workforce section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). The live status board and today's roster are real
 * (`AgentStatusRow`/`Shift`), and "Adherence to schedule" is really computed
 * from real shift login times. Occupancy, Shrinkage, and the 6-hour volume
 * forecast chart are deliberately NOT shown — they need real call-volume/ACD
 * telephony data (Exotel), which isn't built, same deferral as Voice AI's
 * live-call half. Better an honest smaller panel than fabricated numbers.
 */

const STATUS_CLASS: Record<AgentStatus, string> = {
  available: 'st-av',
  on_call: 'st-oc',
  on_break: 'st-br',
  offline: 'st-of',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  available: 'Available',
  on_call: 'On call',
  on_break: 'On break',
  offline: 'Offline',
};

const STATUS_SUMMARY: Array<{ key: AgentStatus; label: string; color: string }> = [
  { key: 'available', label: 'Available', color: 'var(--green)' },
  { key: 'on_call', label: 'On call / chat', color: 'var(--sky)' },
  { key: 'on_break', label: 'On break', color: 'var(--amber)' },
  { key: 'offline', label: 'Offline', color: 'var(--muted2)' },
];

const SHIFT_CLASS: Record<string, string> = { Morning: 'sh-m', Evening: 'sh-e', Night: 'sh-n' };

function formatLoginTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function Workforce() {
  const board = useWorkforceBoard();
  const roster = useWorkforceRoster();

  if (board.isLoading || roster.isLoading) return <LoadingState />;
  if (board.error || !board.data) return <ErrorState error={board.error} retry={() => void board.refetch()} />;
  if (roster.error || !roster.data) return <ErrorState error={roster.error} retry={() => void roster.refetch()} />;

  const counts = board.data.statusCounts;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Workforce management</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Live agent status, today's roster and volume forecast
          </div>
        </div>
        <div className="tpill" style={{ marginLeft: 'auto' }}>
          <span className="dot live" /> Real-time
        </div>
      </div>

      <div className="wf-status">
        {STATUS_SUMMARY.map((s) => (
          <div className="wf-s" key={s.key}>
            <div className="n" style={{ color: s.color }}>
              {counts[s.key]}
            </div>
            <div className="l">
              <span className="st-dot" style={{ background: s.color }} />
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="sect-title">
        <h2>Live agent board</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3>Who's on now</h3>
          <div className="cap">Presence across all teams</div>
          <div>
            {board.data.people.map((p) => (
              <div className="exec-row" key={p.id}>
                <div className="ea" style={{ background: p.color }}>
                  {p.initials}
                </div>
                <div>
                  <div className="en">{p.name}</div>
                  <div className="es">{p.title ?? 'Executive'}</div>
                </div>
                <span className={`estat ${STATUS_CLASS[p.status]}`}>
                  <span className="st-dot" />
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Schedule adherence</h3>
          <div className="cap">Today · IST</div>
          <div className="infoline">
            <span>Adherence to schedule</span>
            <b style={{ color: 'var(--green)' }}>{roster.data.adherencePct !== null ? `${roster.data.adherencePct}%` : '—'}</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 14 }}>
            Occupancy, shrinkage and volume forecasting aren't available yet — they need real call-volume data from a
            telephony integration (Guide §13 Cloud Telephony/Exotel), which isn't connected. This panel shows only
            real, measured data.
          </div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Today's roster</h2>
        <div className="ln" />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="roster">
          <thead>
            <tr>
              <th>Executive</th>
              <th>Team</th>
              <th>Shift</th>
              <th>Login</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {roster.data.rows.map((r) => (
              <tr key={r.userId}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.departmentName ?? '—'}</td>
                <td>
                  <span className={`shift ${SHIFT_CLASS[r.shiftName] ?? 'sh-o'}`}>{r.shiftName}</span>
                </td>
                <td className="mono">{formatLoginTime(r.loginTime)}</td>
                <td>
                  <span className={`estat ${STATUS_CLASS[r.status]}`}>
                    <span className="st-dot" />
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
