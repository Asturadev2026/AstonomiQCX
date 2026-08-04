import { useEffect, useState } from 'react';
import {
  useCreateSlaPolicy,
  useEscalationMatrix,
  useSlaBreaches,
  useSlaKpis,
  useSlaPolicies,
  useSlaScorecard,
} from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import type { SlaBreachRow } from '../../lib/api/types';

/**
 * SLA & Escalation — exact port of the prototype's #sla section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped to "real data, current clock" (Guide §11
 * note in repo memory): every KPI/policy/scorecard/live-timer row here comes
 * from the real SlaPolicy/SlaEvent/Escalation/EscalationRule tables — but the
 * clock itself stays Part 8's plain clock time, not the business-hours-aware
 * clock, and there's no background sweep auto-escalating tickets yet (both
 * need `apps/workers`, deliberately out of scope for this pass).
 */

function fmtTimer(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const s = Math.abs(totalSeconds);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${neg ? '-' : ''}${m}:${String(ss).padStart(2, '0')}`;
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function adhClass(v: number): string {
  return v >= 90 ? 'a-hi' : v >= 80 ? 'a-mid' : 'a-lo';
}

function statusLabel(status: SlaBreachRow['status']): string {
  return status === 'breach' ? 'Breached' : status === 'warn' ? 'At risk' : 'On track';
}

export function Sla() {
  const kpis = useSlaKpis();
  const policies = useSlaPolicies();
  const createPolicyMut = useCreateSlaPolicy();
  const [scoreMode, setScoreMode] = useState<'exec' | 'dept'>('exec');
  const scorecard = useSlaScorecard(scoreMode);
  const breachesQuery = useSlaBreaches();
  const escMatrix = useEscalationMatrix();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [priority, setPriority] = useState('p1');
  const [firstResponseMins, setFirstResponseMins] = useState(15);
  const [resolutionMins, setResolutionMins] = useState(120);
  const [channel, setChannel] = useState('');
  const [segment, setSegment] = useState('');

  // Local per-second ticking, resynced to the real fetched values on every refetch —
  // same visual effect as the prototype's setInterval, but grounded in real targetAt data.
  const [ticking, setTicking] = useState<SlaBreachRow[]>([]);
  useEffect(() => {
    if (breachesQuery.data) setTicking(breachesQuery.data);
  }, [breachesQuery.data]);
  useEffect(() => {
    const id = setInterval(() => {
      setTicking((rows) => rows.map((r) => ({ ...r, secondsLeft: r.secondsLeft - 1 })));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyName.trim()) {
      toast('Please enter a policy name');
      return;
    }
    try {
      await createPolicyMut.mutateAsync({
        name: policyName.trim(),
        priority: priority || null,
        firstResponseMins: Number(firstResponseMins) || 15,
        resolutionMins: Number(resolutionMins) || 120,
        channel: channel.trim() || null,
        segment: segment.trim() || null,
      });
      toast(`Created SLA policy "${policyName.trim()}"`);
      setShowModal(false);
      setPolicyName('');
      setChannel('');
      setSegment('');
    } catch (err: any) {
      toast(`Failed to create SLA policy: ${err?.message ?? 'Error'}`);
    }
  };

  if (kpis.isLoading || policies.isLoading) return <LoadingState />;
  if (kpis.error || !kpis.data) return <ErrorState error={kpis.error} retry={() => void kpis.refetch()} />;
  if (policies.error || !policies.data) return <ErrorState error={policies.error} retry={() => void policies.refetch()} />;

  const k = kpis.data;

  return (
    <>
      {showModal && (
        <Modal title="Create SLA Policy" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreatePolicy} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Policy Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. VIP Response Guarantee"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Priority Tier
                </label>
                <select
                  className="input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="p1">P1 — Urgent</option>
                  <option value="p2">P2 — High</option>
                  <option value="p3">P3 — Medium</option>
                  <option value="p4">P4 — Low</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Customer Segment
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Enterprise, VIP (Optional)"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  First Response Target (Mins)
                </label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={firstResponseMins}
                  onChange={(e) => setFirstResponseMins(Number(e.target.value))}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Resolution Target (Mins)
                </label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={resolutionMins}
                  onChange={(e) => setResolutionMins(Number(e.target.value))}
                  required
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Channel Filter (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. WhatsApp, Email, Voice"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-o" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-p" disabled={createPolicyMut.isPending}>
                {createPolicyMut.isPending ? 'Saving…' : 'Save Policy'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div className="val">{k.compliancePct !== null ? `${k.compliancePct}%` : '—'}</div>
          <div className="lab">Overall SLA compliance</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">{k.atRiskCount}</div>
          <div className="lab">At risk right now</div>
        </div>
        <div className="card kpi">
          <div className="ic b-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </div>
          <div className="val">{k.breachedTodayCount}</div>
          <div className="lab">Breached today</div>
        </div>
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">{k.avgResolutionMins !== null ? fmtDuration(k.avgResolutionMins) : '—'}</div>
          <div className="lab">Avg resolution time</div>
        </div>
      </div>

      <div className="sect-title">
        <h2>SLA policies</h2>
        <div className="ln" />
        <button className="btn btn-o" onClick={() => setShowModal(true)}>
          + New policy
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="sla-tbl">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Priority</th>
              <th>Channel</th>
              <th>Customer segment</th>
              <th>Department</th>
              <th>First response</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {policies.data.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>
                  {p.priority ? <span className={`prio ${p.priority}`}>{p.priority.toUpperCase()}</span> : <span style={{ color: 'var(--muted)' }}>All</span>}
                </td>
                <td>{p.channel ?? 'All'}</td>
                <td>{p.segment ?? 'All'}</td>
                <td>{p.departmentName ?? 'All'}</td>
                <td className="mono" style={{ color: 'var(--blue)' }}>
                  {fmtMins(p.firstResponseMins)}
                </td>
                <td className="mono">{fmtMins(p.resolutionMins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sect-title">
        <h2>SLA scorecard</h2>
        <div className="ln" />
      </div>
      <div className="seg-toggle">
        <button className={scoreMode === 'exec' ? 'on' : ''} onClick={() => setScoreMode('exec')}>
          Executive-wise
        </button>
        <button className={scoreMode === 'dept' ? 'on' : ''} onClick={() => setScoreMode('dept')}>
          Department-wise
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {scorecard.isLoading && <LoadingState />}
        {!scorecard.isLoading && (!scorecard.data || scorecard.data.length === 0) && (
          <div className="cap" style={{ padding: 20, textAlign: 'center' }}>
            No {scoreMode === 'exec' ? 'assigned' : 'departmental'} SLA data yet.
          </div>
        )}
        {scorecard.data && scorecard.data.length > 0 && (
          <table className="sla-tbl">
            <thead>
              <tr>
                <th>{scoreMode === 'exec' ? 'Executive' : 'Department'}</th>
                <th>Assigned</th>
                <th>Met</th>
                <th>Breached</th>
                <th>At risk</th>
                <th>SLA adherence</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.data.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className="u-cell">
                      <div
                        className={scoreMode === 'exec' ? 'ua' : 'dept-ic'}
                        style={{ background: scoreMode === 'exec' ? row.color : `${row.color}18`, width: 32, height: 32 }}
                      >
                        {row.initials}
                      </div>
                      <b>{row.name}</b>
                    </div>
                  </td>
                  <td className="mono">{row.assigned}</td>
                  <td className="mono" style={{ color: 'var(--green)' }}>
                    {row.met}
                  </td>
                  <td className="mono" style={{ color: row.breached > 2 ? 'var(--red)' : 'var(--muted)' }}>
                    {row.breached}
                  </td>
                  <td className="mono" style={{ color: 'var(--amber)' }}>
                    {row.atRisk}
                  </td>
                  <td>
                    <div className="adh">
                      <div className="bar">
                        <div className={`fl ${adhClass(row.adherencePct)}`} style={{ width: `${row.adherencePct}%` }} />
                      </div>
                      <b>{row.adherencePct}%</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="sect-title">
        <h2>Live SLA timers — breach &amp; at-risk</h2>
        <span className="dot live" />
        <div className="ln" />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {ticking.length === 0 ? (
          <div className="cap" style={{ padding: 20, textAlign: 'center' }}>
            No open tickets with a live SLA clock right now.
          </div>
        ) : (
          <table className="sla-tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Customer</th>
                <th>Priority</th>
                <th>Department</th>
                <th>Assigned to</th>
                <th>Time left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ticking.map((t) => (
                <tr key={t.ticketExtRef}>
                  <td className="mono">{t.ticketExtRef}</td>
                  <td style={{ fontWeight: 600 }}>{t.customerName ?? '—'}</td>
                  <td>
                    <span className={`prio ${t.priority}`}>{t.priority.toUpperCase()}</span>
                  </td>
                  <td>{t.departmentName ?? '—'}</td>
                  <td>
                    {t.assigneeInitials ? (
                      <div className="u-cell">
                        <div className="ua" style={{ background: t.assigneeColor ?? '#2563EB', width: 26, height: 26, fontSize: 9 }}>
                          {t.assigneeInitials}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={`sla-timer ${t.status === 'breach' ? 't-breach' : t.status === 'warn' ? 't-warn' : 't-ok'}`}>
                      {fmtTimer(t.secondsLeft)}
                    </span>
                  </td>
                  <td>
                    <span
                      className="prio"
                      style={{
                        background: t.status === 'breach' ? 'var(--red-l)' : t.status === 'warn' ? 'var(--amber-l)' : 'var(--green-l)',
                        color: t.status === 'breach' ? 'var(--red)' : t.status === 'warn' ? 'var(--amber)' : 'var(--green)',
                      }}
                    >
                      {statusLabel(t.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="sect-title">
        <h2>Escalation matrix</h2>
        <div className="ln" />
      </div>
      <div className="card">
        <div className="cap" style={{ marginBottom: 14 }}>
          When an SLA is breached, the ticket escalates automatically through these time-bound levels — functional (to the right
          skill/department) then hierarchical (up the management chain).
        </div>
        <div className="esc-flow" id="escMatrix">
          {(escMatrix.data ?? []).map((e) => (
            <div className="esc-lvl" key={e.level}>
              <span className="lv" style={{ background: ['#2563EB', '#0EA5E9', '#E08A00', '#DB2777'][e.level - 1] ?? '#2563EB' }}>
                Level {e.level}
              </span>
              <div className="who">{e.who}</div>
              <div className="rl">{e.role}</div>
              <div className="tm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <b>{e.timing}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
