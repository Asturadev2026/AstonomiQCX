import { useState, type CSSProperties } from 'react';
import { useCreateTenant, useTenants, useUpdateTenantStatus } from '../../lib/api/hooks';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';

// Kept local rather than imported from @aq/shared — that package builds to
// CommonJS, and a runtime (non-type) import of it breaks in the browser.
const TENANT_PLANS = ['starter', 'business', 'enterprise'] as const;

const fieldStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  color: 'var(--text)',
  padding: '8px 11px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TenantsAdmin() {
  const { data: tenants, isLoading, error, refetch } = useTenants();
  const createTenant = useCreateTenant();
  const updateStatus = useUpdateTenantStatus();
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [plan, setPlan] = useState<(typeof TENANT_PLANS)[number]>('business');

  const submit = () => {
    if (!name.trim() || !subdomain.trim()) return;
    createTenant.mutate(
      { name: name.trim(), subdomain: subdomain.trim().toLowerCase(), plan },
      {
        onSuccess: () => {
          setFormOpen(false);
          setName('');
          setSubdomain('');
          setPlan('business');
        },
        onError: (err) => toast(err.message),
      },
    );
  };

  const toggleStatus = (id: string, current: string) => {
    updateStatus.mutate({ id, status: current === 'active' ? 'suspended' : 'active' });
  };

  if (isLoading) return <LoadingState label="Loading tenants…" />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15 }}>Workspaces</h3>
        <button className="btn btn-g" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New tenant'}
        </button>
      </div>

      {formOpen && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr auto',
            gap: 10,
            alignItems: 'end',
            marginBottom: 20,
            padding: 14,
            background: 'var(--panel)',
            borderRadius: 11,
          }}
        >
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Name</label>
            <input placeholder="e.g. Acme Retail" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Subdomain</label>
            <input placeholder="acme" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} style={fieldStyle}>
              {TENANT_PLANS.map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-g" onClick={submit} disabled={createTenant.isPending}>
            {createTenant.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {!tenants?.length ? (
        <EmptyState label="No tenants yet." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11.5, borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '8px 6px' }}>Name</th>
              <th style={{ padding: '8px 6px' }}>Subdomain</th>
              <th style={{ padding: '8px 6px' }}>Plan</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
              <th style={{ padding: '8px 6px' }}>Created</th>
              <th style={{ padding: '8px 6px' }} />
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 6px', fontWeight: 600 }}>{t.name}</td>
                <td style={{ padding: '10px 6px', color: 'var(--muted)' }}>{t.subdomain}</td>
                <td style={{ padding: '10px 6px', textTransform: 'capitalize' }}>{t.plan}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span
                    className="ostat"
                    style={
                      t.status === 'active'
                        ? { background: 'var(--green-l)', color: 'var(--green)' }
                        : { background: '#FCE7F3', color: 'var(--pink)' }
                    }
                  >
                    {t.status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td style={{ padding: '10px 6px', color: 'var(--muted)' }}>{fmtDate(t.createdAt)}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                  <button className="btn btn-o" onClick={() => toggleStatus(t.id, t.status)} disabled={updateStatus.isPending}>
                    {t.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
