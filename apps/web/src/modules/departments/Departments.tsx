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
 * ticket counts come from a real `groupBy` over `Ticket`.
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

export function Departments() {
  const { data, isLoading, error, refetch } = useDepartments();
  const createDept = useCreateDepartment();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏢');
  const [color, setColor] = useState('#2563EB');

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const handleCreate = () => {
    if (!name.trim()) return;
    createDept.mutate(
      { name: name.trim(), icon, color },
      {
        onSuccess: () => {
          setName('');
          setCreating(false);
          toast('Department created ✓');
        },
        onError: () => toast('Could not create department', 'error'),
      },
    );
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Departments &amp; team hierarchy</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Each department has a head, executives, live SLA adherence and current load
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setCreating((s) => !s)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add department
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 16, padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            style={{ width: 44, textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: '9px 4px', fontSize: 16 }}
            placeholder="🏢"
          />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="Department Name (e.g. Quality Assurance)"
            style={{ flex: 1, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: '9px 12px', fontSize: 13 }}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 38, height: 38, border: 'none', background: 'none', cursor: 'pointer' }}
          />
          <button className="btn btn-g" onClick={handleCreate} disabled={createDept.isPending}>
            {createDept.isPending ? 'Saving…' : 'Create'}
          </button>
          <button className="btn btn-o" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      )}

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
