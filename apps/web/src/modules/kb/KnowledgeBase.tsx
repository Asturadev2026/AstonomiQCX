import { useMemo, useRef, useState } from 'react';
import { useCreateKbArticle, useIncrementKbView, useKbArticles, useUpdateKbArticle } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { applyMarkdownFormat, renderMarkdownLite, stripMarkdownLite, type MarkdownFormatAction } from '../../lib/markdownLite';
import type { KbArticle } from '../../lib/api/types';

/**
 * Knowledge Base — exact port of the prototype's #kb section (markup/classes
 * verbatim from docs/AstronomiQ-CX_1.html, styles from styles/prototype.css).
 * The backend already existed from the Chatbot build (Part 10) — this screen
 * is a real frontend on top of it, not a new engine. Categories and counts
 * are derived from the real articles, not the prototype's fixed 4/24 counts.
 * "Add article" is a real POST (a small form, not the prototype's one-click
 * fake draft) since the backend already supports it for real. Clicking an
 * article really increments its view count via a new PATCH /kb/:id/view.
 * Editing (PATCH /kb/:id) and lightweight markdown formatting (bold/italic/
 * lists, rendered as real elements — not dangerouslySetInnerHTML) reuse the
 * same form for both create and edit.
 */

const CATEGORY_ICONS: Record<string, string> = {
  delivery: '📦',
  orders: '📦',
  returns: '💰',
  refunds: '💰',
  coupons: '💳',
  payments: '💳',
  account: '👤',
};

function categoryIcon(category: string | null): string {
  return CATEGORY_ICONS[(category ?? '').toLowerCase()] ?? '📄';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  return `Updated ${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

function formatViews(views: number): string {
  return views === 1 ? '1 view' : `${views.toLocaleString()} views`;
}

function formatCited(citedCount: number): string {
  if (citedCount === 0) return 'Not cited yet';
  return citedCount === 1 ? 'Cited 1 time' : `Cited ${citedCount.toLocaleString()} times`;
}

function truncate(text: string, max = 130): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

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

const TOOLBAR_BUTTONS: { action: MarkdownFormatAction; label: string; title: string }[] = [
  { action: 'bold', label: 'B', title: 'Bold' },
  { action: 'italic', label: 'I', title: 'Italic' },
  { action: 'ul', label: '• List', title: 'Bullet list' },
  { action: 'ol', label: '1. List', title: 'Numbered list' },
];

export function KnowledgeBase() {
  const { data, isLoading, error, refetch } = useKbArticles();
  const createArticle = useCreateKbArticle();
  const updateArticle = useUpdateKbArticle();
  const incrementView = useIncrementKbView();
  const toast = useToast();

  const [activeCat, setActiveCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [viewingArticleId, setViewingArticleId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const categories = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const a of data) {
      const key = a.category ?? 'Uncategorised';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [data]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const visible = activeCat === 'all' ? data : data.filter((a) => (a.category ?? 'Uncategorised') === activeCat);

  function openArticle(article: KbArticle) {
    incrementView.mutate({ id: article.id });
    setViewingArticleId(article.id);
  }

  const viewingArticle = viewingArticleId ? data.find((a) => a.id === viewingArticleId) ?? null : null;

  function resetForm() {
    setTitle('');
    setBody('');
    setCategory('');
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    if (showForm && !editingId) {
      resetForm();
      return;
    }
    setTitle('');
    setBody('');
    setCategory('');
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(article: KbArticle, e: React.MouseEvent) {
    e.stopPropagation();
    setTitle(article.title);
    setBody(article.body);
    setCategory(article.category ?? '');
    setEditingId(article.id);
    setShowForm(true);
  }

  function applyFormat(action: MarkdownFormatAction) {
    const el = bodyRef.current;
    if (!el) return;
    const result = applyMarkdownFormat(body, el.selectionStart, el.selectionEnd, action);
    setBody(result.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function submitArticle() {
    if (!title.trim() || !body.trim()) {
      toast('Title and body are required');
      return;
    }
    const payload = { title: title.trim(), body: body.trim(), category: category.trim() || undefined };

    if (editingId) {
      updateArticle.mutate(
        { id: editingId, payload },
        {
          onSuccess: () => {
            toast('Article updated ✓');
            resetForm();
          },
          onError: (err) => toast(err instanceof Error ? err.message : 'Could not update article'),
        },
      );
      return;
    }

    createArticle.mutate(payload, {
      onSuccess: () => {
        toast('New article created ✓');
        resetForm();
        setActiveCat('all');
      },
      onError: (err) => toast(err instanceof Error ? err.message : 'Could not create article'),
    });
  }

  const isSaving = editingId ? updateArticle.isPending : createArticle.isPending;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Knowledge Base</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Astra answers customers using these articles — keep them fresh
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={startCreate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add article
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{editingId ? 'Edit article' : 'New article'}</h3>
          <div className="cap">
            {editingId ? "Changes save straight to the live article — Astra uses the new text right away" : "This is real — Astra can use it as soon as it's saved"}
          </div>
          <div className="cop-block" style={{ marginTop: 4 }}>
            <div className="lbl">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={FIELD_STYLE} />
          </div>
          <div className="cop-block">
            <div className="lbl">Category</div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Delivery, Returns, Payments"
              style={FIELD_STYLE}
            />
          </div>
          <div className="cop-block">
            <div className="lbl">Body</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {TOOLBAR_BUTTONS.map((b) => (
                <button
                  key={b.action}
                  type="button"
                  title={b.title}
                  onClick={() => applyFormat(b.action)}
                  className="btn btn-o"
                  style={{ padding: '4px 10px', fontSize: 12, fontWeight: b.action === 'bold' ? 700 : 400, fontStyle: b.action === 'italic' ? 'italic' : 'normal' }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Select text and click a formatting button, or type markdown directly — e.g. **bold**, - bullet item'}
              style={{ ...FIELD_STYLE, height: 140, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-g" onClick={submitArticle} disabled={isSaving} style={{ flex: 1, justifyContent: 'center', padding: 12 }}>
              {editingId ? 'Save changes' : 'Save article'}
            </button>
            <button className="btn btn-o" onClick={resetForm} style={{ padding: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid kb-grid">
        <div>
          <div className={`kb-cat ${activeCat === 'all' ? 'on' : ''}`} onClick={() => setActiveCat('all')}>
            📚 All articles <span className="kc-n">{data.length}</span>
          </div>
          {categories.map((c) => (
            <div key={c.name} className={`kb-cat ${activeCat === c.name ? 'on' : ''}`} onClick={() => setActiveCat(c.name)}>
              {categoryIcon(c.name)} {c.name} <span className="kc-n">{c.count}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div id="kbList">
            {visible.map((a) => (
              <div className="kb-art" key={a.id} onClick={() => openArticle(a)}>
                <div className="ka-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19">
                    <path d="M4 5h16v14H4z" />
                    <path d="M4 9h16M8 13h8M8 16h5" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ka-t">{a.title}</div>
                  <div className="ka-d">{truncate(stripMarkdownLite(a.body))}</div>
                  <div className="ka-m">
                    <span>📁 {a.category ?? 'Uncategorised'}</span>
                    <span>👁 {formatViews(a.views)}</span>
                    <span>🔗 {formatCited(a.citedCount)}</span>
                    <span>🕒 {timeAgo(a.updatedAt)}</span>
                  </div>
                </div>
                <button
                  className="btn btn-o"
                  onClick={(e) => startEdit(a, e)}
                  style={{ padding: '4px 10px', fontSize: 12, alignSelf: 'flex-start' }}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {viewingArticle && (
        <Modal title={viewingArticle.title} onClose={() => setViewingArticleId(null)}>
          <div className="ka-m" style={{ marginBottom: 12 }}>
            <span>📁 {viewingArticle.category ?? 'Uncategorised'}</span>
            <span>👁 {formatViews(viewingArticle.views)}</span>
            <span>🕒 {timeAgo(viewingArticle.updatedAt)}</span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{renderMarkdownLite(viewingArticle.body)}</div>
        </Modal>
      )}
    </>
  );
}
