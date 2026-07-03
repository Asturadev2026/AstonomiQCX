import { viewById } from '../lib/views';

/**
 * Placeholder for a view that hasn't been ported from the prototype yet.
 * Porting checklist (Plan §10.2): one prototype render*() → one component,
 * one dummy array → one hook in lib/api/hooks.ts. Match markup/classes exactly.
 */
export function StubPage({ viewId }: { viewId: string }) {
  const view = viewById(viewId);
  return (
    <div className="card" style={{ padding: 34, textAlign: 'center' }}>
      <h3 style={{ fontSize: 16 }}>{view?.title ?? viewId}</h3>
      <div className="cap" style={{ marginTop: 6 }}>
        Not ported yet — open <b>docs/AstronomiQ-CX_1.html</b>, find the{' '}
        <code>#{viewId}</code> section, and port it into{' '}
        <code>src/modules/{viewId}/</code> following the Command Centre example.
      </div>
    </div>
  );
}
