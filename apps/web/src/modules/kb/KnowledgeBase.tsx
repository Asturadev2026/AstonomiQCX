import { useMemo, useState } from 'react';
import { useCreateKbArticle, useIncrementKbView, useKbArticles } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
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

function truncate(text: string, max = 130): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function KnowledgeBase() {
  const { data, isLoading, error, refetch } = useKbArticles();
  const createArticle = useCreateKbArticle();
  const incrementView = useIncrementKbView();
  const toast = useToast();

  const [activeCat, setActiveCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');

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
    toast(`Opening "${article.title}"…`);
  }

  function submitArticle() {
    if (!title.trim() || !body.trim()) {
      toast('Title and body are required');
      return;
    }
    createArticle.mutate(
      { title: title.trim(), body: body.trim(), category: category.trim() || undefined },
      {
        onSuccess: () => {
          toast('New article created ✓');
          setTitle('');
          setBody('');
          setCategory('');
          setShowForm(false);
          setActiveCat('all');
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not create article'),
      },
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Knowledge Base</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Astra answers customers using these articles — keep them fresh
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowForm((s) => !s)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add article
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>New article</h3>
          <div className="cap">This is real — Astra can use it as soon as it's saved</div>
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
                height: 100,
                resize: 'none',
                outline: 'none',
                color: 'var(--text)',
              }}
            />
          </div>
          <button
            className="btn btn-g"
            onClick={submitArticle}
            disabled={createArticle.isPending}
            style={{ width: '100%', justifyContent: 'center', padding: 12 }}
          >
            Save article
          </button>
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
                  <div className="ka-d">{truncate(a.body)}</div>
                  <div className="ka-m">
                    <span>📁 {a.category ?? 'Uncategorised'}</span>
                    <span>👁 {formatViews(a.views)}</span>
                    <span>🕒 {timeAgo(a.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
