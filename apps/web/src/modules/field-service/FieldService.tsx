import { useFieldServiceKpis, useFieldServiceVisits } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { ServiceVisitDto } from '../../lib/api/types';

/**
 * Field Service — exact port of the prototype's #fieldservice section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Fully real, no gaps: the `ServiceVisit` model
 * already had everything needed (kind/address/slot/technician/status), so
 * every KPI and every visit row here is real data, not a fabricated demo.
 * "Schedule visit" stays a toast — no add-visit form built, same precedent
 * as other "+ New X" buttons across the app.
 */

const KIND_ICON: Record<string, { icon: string; color: string }> = {
  installation: { icon: '🔧', color: '#2563EB' },
  repair: { icon: '🛠️', color: '#E08A00' },
  amc: { icon: '❄️', color: '#0EA5E9' },
  pickup: { icon: '📦', color: '#4F46E5' },
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  en_route: 'En route',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'var(--muted2)',
  assigned: 'var(--sky)',
  en_route: 'var(--indigo)',
  in_progress: 'var(--amber)',
  completed: 'var(--green)',
};

function formatSlot(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function VisitRow({ v }: { v: ServiceVisitDto }) {
  const kind = KIND_ICON[v.kind ?? ''] ?? { icon: '🔧', color: '#2563EB' };
  const status = v.status ?? 'scheduled';
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? 'var(--muted2)';

  return (
    <div className="fs-visit">
      <div className="fsi" style={{ background: `${kind.color}18` }}>
        {kind.icon}
      </div>
      <div>
        <div className="fn">
          {v.kind ? `${v.kind.charAt(0).toUpperCase()}${v.kind.slice(1)}` : 'Visit'}
          {v.contactName ? ` — ${v.contactName}` : ''}
        </div>
        <div className="fd">
          {v.address ?? '—'} · {formatSlot(v.slot)}
        </div>
      </div>
      <div className="ftech">
        <div style={{ color: 'var(--muted)' }}>Technician</div>
        <b>{v.technician ?? '—'}</b>
        <br />
        <span className="fs-stat" style={{ background: `${color}22`, color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function FieldService() {
  const kpis = useFieldServiceKpis();
  const visits = useFieldServiceVisits();
  const toast = useToast();

  if (kpis.isLoading || visits.isLoading) return <LoadingState />;
  if (kpis.error || !kpis.data) return <ErrorState error={kpis.error} retry={() => void kpis.refetch()} />;
  if (visits.error || !visits.data) return <ErrorState error={visits.error} retry={() => void visits.refetch()} />;

  const k = kpis.data;

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 7l-1.5-1.5a3 3 0 0 0-4 4L4 13.5V20h6.5l4-4" />
            </svg>
          </div>
          <div className="val">{k.scheduledToday}</div>
          <div className="lab">Visits scheduled today</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div className="val">{k.completedToday}</div>
          <div className="lab">Completed</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">{k.inProgressToday}</div>
          <div className="lab">In progress</div>
        </div>
        <div className="card kpi">
          <div className="ic b-indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
            </svg>
          </div>
          <div className="val">{k.techniciansOnField}</div>
          <div className="lab">Technicians on field</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 6px' }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Today's service visits</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Installations, warranty repairs &amp; AMC — auto-assigned by location &amp; skill
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => toast('Schedule new visit…')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Schedule visit
        </button>
      </div>
      <div>
        {visits.data.map((v) => (
          <VisitRow v={v} key={v.id} />
        ))}
      </div>
    </>
  );
}
