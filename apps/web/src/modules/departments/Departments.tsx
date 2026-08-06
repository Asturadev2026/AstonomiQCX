import { useState } from 'react';
import { useCreateDepartment, useDepartments } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { AgentStatus } from '../../lib/api/types';

/**
 * Departments — exact port of the prototype's #departments section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Every department card is a real `Department` row;
 * every executive row is a real `User` + live `AgentStatusRow` status; open
 * ticket counts come from a real `groupBy` over `Ticket`. Only 2 real login
 * users existed in this tenant before this screen — the rest of the roster
 * was seeded as real, directory-only User rows (no Keycloak login) per the
 * user's explicit choice, the same way KB articles/macros were seeded with
 * real content rather than left empty. "Add department" opens a real form
 * (name/icon/color) and POSTs a real `Department` row — head/executives are
 * assigned later by editing users, same as the seeded departments today.
 */

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  padding: 11,
  fontSize: 13,
  outline: 'none',
  color: 'var(--text)',
};

const ICON_PRESETS = ['🏢', '💬', '📦', '💳', '🛠️', '🎯', '📣', '⚖️'];
const COLOR_PRESETS = ['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED', '#0891B2'];

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

function AddDepartmentForm({ onCancel, onSubmit, isSaving }: { onCancel: () => void; onSubmit: (name: string, icon: string, color: string) => void; isSaving: boolean }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_PRESETS[0] ?? '🏢');
  const [color, setColor] = useState(COLOR_PRESETS[0] ?? '#2563EB');

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>New department</h3>
      <div className="cap">This is real — it's created as soon as you save</div>

      <div className="cop-block" style={{ marginTop: 4 }}>
        <div className="lbl">Name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retention" style={FIELD_STYLE} />
      </div>
      <div className="cop-block">
        <div className="lbl">Icon</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ICON_PRESETS.map((i) => (
            <button
              key={i}
              type="button"
              className="btn btn-o"
              onClick={() => setIcon(i)}
              style={{ padding: '6px 10px', fontSize: 16, outline: icon === i ? '2px solid var(--brand)' : 'none' }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="cop-block">
        <div className="lbl">Colour</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-g"
          disabled={isSaving}
          onClick={() => onSubmit(name, icon, color)}
          style={{ flex: 1, justifyContent: 'center', padding: 12 }}
        >
          Save department
        </button>
        <button className="btn btn-o" onClick={onCancel} style={{ padding: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Departments() {
  const { data, isLoading, error, refetch } = useDepartments();
  const createDepartment = useCreateDepartment();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function submitDepartment(name: string, icon: string, color: string) {
    if (!name.trim()) {
      toast('Department name is required');
      return;
    }
    createDepartment.mutate(
      { name: name.trim(), icon, color },
      {
        onSuccess: (created) => {
          toast(`Department "${created.name}" created ✓`);
          setShowForm(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not create department'),
      },
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Departments &amp; team hierarchy</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Each department has a head, executives, live SLA adherence and current load
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowForm((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add department
        </button>
      </div>

      {showForm && <AddDepartmentForm onCancel={() => setShowForm(false)} onSubmit={submitDepartment} isSaving={createDepartment.isPending} />}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }} id="deptGrid">
        {data.map((d) => (
          <div className="card dept-card" style={{ borderLeftColor: d.color }} key={d.id}>
            <div className="dept-h">
              <div className="dept-ic" style={{ background: `${d.color}18` }}>
                {d.icon}
              </div>
              <div>
                <div className="dn">{d.name}</div>
                <div className="dhd">Head: {d.headName ?? '—'}</div>
              </div>
              <div className="dcnt">
                <b>{d.openTicketCount}</b>
                <small>open tickets</small>
              </div>
            </div>
            {d.execs.length === 0 ? (
              <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>No assigned executives</div>
            ) : (
              d.execs.map((e) => (
                <div className="exec-row" key={e.id}>
                  <div className="ea" style={{ background: e.color }}>
                    {e.initials}
                  </div>
                  <div>
                    <div className="en">{e.name}</div>
                    <div className="es">{e.title ?? `Executive · ${d.name}`}</div>
                  </div>
                  <span className={`estat ${STATUS_CLASS[e.status]}`}>
                    <span className="st-dot" />
                    {STATUS_LABEL[e.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </>
  );
}
