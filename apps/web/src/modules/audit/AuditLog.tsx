import { useAuditLog } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { downloadCsv } from '../../lib/csv';

/**
 * Audit Log — exact port of the prototype's #audit section: a reverse-chronological
 * feed of sensitive actions (who did what, and when) for DPDP & ISO compliance.
 */
export function AuditLog() {
  const { data, isLoading, error, refetch } = useAuditLog();
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const exportCsv = () => {
    downloadCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Actor', 'Action', 'Time'],
      data.map((r) => [r.actorName, r.message, `${r.time} ago`]),
    );
    toast('Audit log exported ✓');
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Audit log</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Every sensitive action is recorded — who did what, and when. Needed for DPDP &amp; ISO compliance.
          </div>
        </div>
        <button className="btn btn-o" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!data.length}>
          Export
        </button>
      </div>
      <div className="card">
        {!data.length ? (
          <EmptyState label="No audited actions yet." />
        ) : (
          data.map((row) => (
            <div className="audit-row" key={row.id}>
              <div className="ai" style={{ background: `${row.color}18` }}>
                {row.icon}
              </div>
              <div className="at">
                <b>{row.actorName}</b> {row.message}
              </div>
              <div className="atm">{row.time} ago</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
