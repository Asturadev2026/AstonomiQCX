import { useState } from 'react';
import { useCreateMacro, useMacros, useUseMacro } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';

/**
 * Macros — exact port of the prototype's #macros section (markup/classes
 * verbatim from docs/AstronomiQ-CX_1.html, styles from styles/prototype.css).
 * No backend existed for this yet (unlike Knowledge Base) — built one: the
 * `Macro` model already existed in the schema exactly as needed, so this is
 * real persistence + a real "uses" counter, not a client-side array like the
 * prototype's canned `macros` list. Clicking a macro really copies its body
 * to the clipboard and really increments its use count.
 */

export function Macros() {
  const { data, isLoading, error, refetch } = useMacros();
  const createMacro = useCreateMacro();
  const useMacro = useUseMacro();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function copyMacro(id: string, macroBody: string | null) {
    if (macroBody) void navigator.clipboard.writeText(macroBody);
    useMacro.mutate({ id });
    toast('Macro copied to clipboard ✓');
  }

  function submitMacro() {
    if (!title.trim() || !body.trim()) {
      toast('Title and body are required');
      return;
    }
    createMacro.mutate(
      { title: title.trim(), body: body.trim(), category: category.trim() || undefined },
      {
        onSuccess: () => {
          toast('New macro created ✓');
          setTitle('');
          setCategory('');
          setBody('');
          setShowForm(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not create macro'),
      },
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Macros &amp; canned responses</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            One-click replies for common situations. Click any to copy.
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowForm((s) => !s)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New macro
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>New macro</h3>
          <div className="cap">Use {'{placeholders}'} like {'{name}'} or {'{order}'} — agents fill them in when sending</div>
          <div className="cop-block" style={{ marginTop: 4 }}>
            <div className="lbl">Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                borderRadius: 9,
                padding: 11,
                fontSize: 13,
                outline: 'none',
                color: 'var(--text)',
              }}
            />
          </div>
          <div className="cop-block">
            <div className="lbl">Category</div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Delivery, Returns, Payments"
              style={{
                width: '100%',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                borderRadius: 9,
                padding: 11,
                fontSize: 13,
                outline: 'none',
                color: 'var(--text)',
              }}
            />
          </div>
          <div className="cop-block">
            <div className="lbl">Body</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                borderRadius: 9,
                padding: 11,
                fontSize: 13,
                height: 90,
                resize: 'none',
                outline: 'none',
                color: 'var(--text)',
              }}
            />
          </div>
          <button
            className="btn btn-g"
            onClick={submitMacro}
            disabled={createMacro.isPending}
            style={{ width: '100%', justifyContent: 'center', padding: 12 }}
          >
            Save macro
          </button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }} id="macroList">
        {data.map((m) => (
          <div className="macro" key={m.id} onClick={() => copyMacro(m.id, m.body)}>
            <div className="mt">
              {m.title}
              <span className="mcat" style={{ marginLeft: 'auto' }}>
                {m.category ?? 'General'}
              </span>
            </div>
            <div className="mb">{m.body}</div>
            <div className="mu">Used {m.uses.toLocaleString()} times · click to copy</div>
          </div>
        ))}
      </div>
    </>
  );
}
