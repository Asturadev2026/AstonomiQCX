import { useState } from 'react';
import { useContacts, useCreateServiceVisit, useFieldServiceKpis, useFieldServiceVisits } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { ServiceVisitDto } from '../../lib/api/types';

/**
 * Field Service — exact port of the prototype's #fieldservice section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Fully real, no gaps: the `ServiceVisit` model
 * already had everything needed (kind/address/slot/technician/status), so
 * every KPI and every visit row here is real data, not a fabricated demo.
 * "Schedule visit" opens a real form and POSTs a real `ServiceVisit` row —
 * the contact link reuses the same ContactOption search as the Topbar's
 * "test as this customer" picker.
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

const VISIT_KINDS = ['installation', 'repair', 'amc', 'pickup'];
const VISIT_KIND_LABELS: Record<string, string> = {
  installation: 'Installation',
  repair: 'Repair',
  amc: 'AMC',
  pickup: 'Pickup',
};

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

function ScheduleVisitForm({ onCancel, onSubmit, isSaving }: { onCancel: () => void; onSubmit: (kind: string, contactId: string, address: string, slot: string, technician: string) => void; isSaving: boolean }) {
  const [kind, setKind] = useState(VISIT_KINDS[0] ?? 'installation');
  const [contactId, setContactId] = useState('');
  const [address, setAddress] = useState('');
  const [slot, setSlot] = useState('');
  const [technician, setTechnician] = useState('');
  const { data: contacts } = useContacts('');

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Schedule visit</h3>
      <div className="cap">This is real — it's created as soon as you save</div>

      <div className="cop-block" style={{ marginTop: 4 }}>
        <div className="lbl">Kind</div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={FIELD_STYLE}>
          {VISIT_KINDS.map((k) => (
            <option key={k} value={k}>
              {VISIT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="cop-block">
        <div className="lbl">Contact (optional)</div>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={FIELD_STYLE}>
          <option value="">No linked contact</option>
          {contacts?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` (${c.phone})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="cop-block">
        <div className="lbl">Address</div>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Visit address" style={FIELD_STYLE} />
      </div>
      <div className="cop-block">
        <div className="lbl">Slot</div>
        <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} style={FIELD_STYLE} />
      </div>
      <div className="cop-block">
        <div className="lbl">Technician</div>
        <input value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Technician name" style={FIELD_STYLE} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-g"
          disabled={isSaving}
          onClick={() => onSubmit(kind, contactId, address, slot, technician)}
          style={{ flex: 1, justifyContent: 'center', padding: 12 }}
        >
          Save visit
        </button>
        <button className="btn btn-o" onClick={onCancel} style={{ padding: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function FieldService() {
  const kpis = useFieldServiceKpis();
  const visits = useFieldServiceVisits();
  const createVisit = useCreateServiceVisit();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);

  if (kpis.isLoading || visits.isLoading) return <LoadingState />;
  if (kpis.error || !kpis.data) return <ErrorState error={kpis.error} retry={() => void kpis.refetch()} />;
  if (visits.error || !visits.data) return <ErrorState error={visits.error} retry={() => void visits.refetch()} />;

  const k = kpis.data;

  function submitVisit(kind: string, contactId: string, address: string, slot: string, technician: string) {
    if (!slot) {
      toast('A slot time is required');
      return;
    }
    createVisit.mutate(
      {
        kind,
        contactId: contactId || undefined,
        address: address.trim() || undefined,
        slot: new Date(slot).toISOString(),
        technician: technician.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast('Visit scheduled ✓');
          setShowForm(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not schedule visit'),
      },
    );
  }

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
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowForm((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Schedule visit
        </button>
      </div>
      {showForm && <ScheduleVisitForm onCancel={() => setShowForm(false)} onSubmit={submitVisit} isSaving={createVisit.isPending} />}
      <div>
        {visits.data.map((v) => (
          <VisitRow v={v} key={v.id} />
        ))}
      </div>
    </>
  );
}
