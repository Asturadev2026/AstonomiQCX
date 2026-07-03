/** Shared loading / error / empty states (Plan §10.4) — used by every view. */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card" style={{ padding: 30, textAlign: 'center' }}>
      <div className="cap">{label}</div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card" style={{ padding: 30, textAlign: 'center' }}>
      <h3 style={{ fontSize: 14 }}>Couldn't load data</h3>
      <div className="cap" style={{ margin: '6px 0 12px' }}>
        {error instanceof Error ? error.message : 'The API is not reachable.'}
        <br />
        Is the backend running? (apps/api on :4000, database migrated & seeded)
      </div>
      {retry && (
        <button className="btn btn-g" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="card" style={{ padding: 30, textAlign: 'center' }}>
      <div className="cap">{label}</div>
    </div>
  );
}
