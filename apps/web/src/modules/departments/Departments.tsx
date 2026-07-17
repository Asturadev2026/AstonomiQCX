import { useDepartments } from '../../lib/api/hooks';
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
 * real content rather than left empty. "Add department" stays a toast — no
 * add-department form built yet, same precedent as other "+ New X" buttons.
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
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Departments &amp; team hierarchy</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Each department has a head, executives, live SLA adherence and current load
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => toast('Add department…')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add department
        </button>
      </div>

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
            {d.execs.map((e) => (
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
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
