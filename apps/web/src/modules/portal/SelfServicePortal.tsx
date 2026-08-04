import { useState } from 'react';
import { useKbArticles, useOrderLookup, usePortal, useRequestReturn, useTicketLookup } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';

/**
 * Self-Service Portal — exact port of the prototype's #portal section.
 * Markup/classes verbatim, category counts + latest order from usePortal(). (Plan §10.2 pattern)
 *
 * Track order / category / ticket tracker / return request are real public
 * flows (no login, matching the portal's customer-facing nature) — GET
 * /orders/:extRef, GET /kb (filtered client-side, same pattern as the admin
 * Knowledge Base screen), GET /tickets/by-ref/:extRef, and POST
 * /orders/:extRef/return (raises a real Ticket via the same engine as any
 * agent-created ticket, just with no authenticated user). Raising a NEW
 * generic support ticket and the community forum stay unbuilt — the former a
 * toast (same precedent as other unbuilt "+ New" forms), the latter an honest
 * in-app note since a real forum is a full module on its own.
 */

const inputStyle = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  padding: 11,
  fontSize: 13,
  outline: 'none',
  color: 'var(--text)',
} as const;

function OrderTrackModal({ defaultRef, onClose }: { defaultRef: string; onClose: () => void }) {
  const [ref, setRef] = useState(defaultRef);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const lookup = useOrderLookup(submitted);

  return (
    <Modal title="Track an order" onClose={onClose} width={440}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Order ref, e.g. ZK-483920"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(ref.trim())}
        />
        <button className="btn btn-g" onClick={() => setSubmitted(ref.trim())} disabled={!ref.trim()}>
          Track
        </button>
      </div>
      {lookup.isLoading && <LoadingState />}
      {lookup.isError && (
        <div className="cap" style={{ textAlign: 'center', padding: '12px 0' }}>
          No order found for &quot;{submitted}&quot;
        </div>
      )}
      {lookup.data && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{lookup.data.extRef}</div>
          <div className="cap" style={{ margin: '4px 0 10px' }}>{lookup.data.description ?? 'Order'}</div>
          <div className="infoline">
            <span>Status</span>
            <b style={{ color: 'var(--blue)' }}>{lookup.data.status ?? 'unknown'}</b>
          </div>
          <div className="infoline">
            <span>Quantity</span>
            <b>{lookup.data.qty}</b>
          </div>
          {lookup.data.amount !== null && (
            <div className="infoline">
              <span>Amount</span>
              <b>₹{lookup.data.amount.toLocaleString('en-IN')}</b>
            </div>
          )}
          <div className="infoline">
            <span>Placed</span>
            <b>{new Date(lookup.data.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</b>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TicketTrackModal({ onClose, defaultRef = '' }: { onClose: () => void; defaultRef?: string }) {
  const [ref, setRef] = useState(defaultRef);
  const [submitted, setSubmitted] = useState<string | null>(defaultRef || null);
  const lookup = useTicketLookup(submitted);
  const toast = useToast();

  return (
    <Modal title="Raise a request" onClose={onClose} width={440}>
      <div className="cap" style={{ marginBottom: 10 }}>Already raised one? Track it by reference below.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Ticket ref, e.g. AQ-T-10234"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(ref.trim())}
        />
        <button className="btn btn-g" onClick={() => setSubmitted(ref.trim())} disabled={!ref.trim()}>
          Track
        </button>
      </div>
      {lookup.isLoading && <LoadingState />}
      {lookup.isError && (
        <div className="cap" style={{ textAlign: 'center', padding: '12px 0' }}>
          No request found for &quot;{submitted}&quot;
        </div>
      )}
      {lookup.data && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{lookup.data.subject}</div>
          <div className="infoline" style={{ marginTop: 8 }}>
            <span>Status</span>
            <b style={{ color: 'var(--blue)' }}>{lookup.data.status}</b>
          </div>
          <div className="infoline">
            <span>Priority</span>
            <b>{lookup.data.priority.toUpperCase()}</b>
          </div>
          <div className="infoline">
            <span>Raised</span>
            <b>{new Date(lookup.data.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</b>
          </div>
        </div>
      )}
      <button
        className="btn btn-o"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => toast('Raise-a-new-request form opened')}
      >
        Raise a new request
      </button>
    </Modal>
  );
}

function ReturnRequestModal({ defaultRef, onClose }: { defaultRef: string; onClose: () => void }) {
  const [orderRef, setOrderRef] = useState(defaultRef);
  const [reason, setReason] = useState('');
  const [showTrackAfter, setShowTrackAfter] = useState(false);
  const requestReturn = useRequestReturn();
  const toast = useToast();

  function submit() {
    if (!orderRef.trim() || !reason.trim()) {
      toast('Order reference and reason are both required');
      return;
    }
    requestReturn.mutate(
      { extRef: orderRef.trim(), reason: reason.trim() },
      { onError: (err) => toast(err instanceof Error ? err.message : 'Could not raise the return request') },
    );
  }

  if (showTrackAfter && requestReturn.data?.ticketExtRef) {
    return <TicketTrackModal defaultRef={requestReturn.data.ticketExtRef} onClose={onClose} />;
  }

  return (
    <Modal title="Return / refund" onClose={onClose} width={440}>
      {requestReturn.data ? (
        <div>
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--green)' }}>Request submitted ✓</div>
            <div className="cap" style={{ marginTop: 4 }}>
              Reference: <b>{requestReturn.data.ticketExtRef}</b> — our team will pick this up shortly.
            </div>
          </div>
          <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowTrackAfter(true)}>
            Track this request
          </button>
        </div>
      ) : (
        <>
          <div className="cop-block">
            <div className="lbl">Order reference</div>
            <input
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              placeholder="e.g. ZK-483920"
              style={inputStyle}
            />
          </div>
          <div className="cop-block">
            <div className="lbl">Reason for return</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us what went wrong…"
              style={{ ...inputStyle, height: 90, resize: 'none' }}
            />
          </div>
          <button
            className="btn btn-g"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={submit}
            disabled={requestReturn.isPending}
          >
            Submit request
          </button>
        </>
      )}
    </Modal>
  );
}

function ForumNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Community forum" onClose={onClose} width={420}>
      <div className="cap" style={{ textAlign: 'center', padding: '20px 0', lineHeight: 1.6 }}>
        Not built yet — a real community forum (posts, threads, replies, moderation) is a full module on its own,
        not a quick wire-up. This stays informational for now.
      </div>
    </Modal>
  );
}

function CategoryModal({ label, onClose }: { label: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useKbArticles();
  const [articleId, setArticleId] = useState<string | null>(null);

  const articles = (data ?? []).filter((a) => a.category === label);
  const article = articleId ? articles.find((a) => a.id === articleId) ?? null : null;

  return (
    <Modal title={article ? article.title : label} onClose={onClose} width={560}>
      {isLoading && <LoadingState />}
      {(error || !data) && !isLoading && <ErrorState error={error} retry={() => void refetch()} />}
      {article && (
        <>
          <button
            onClick={() => setArticleId(null)}
            style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 0, marginBottom: 12, fontSize: 12.5 }}
          >
            ← Back to {label}
          </button>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{article.body}</div>
        </>
      )}
      {!article && data && (
        <div>
          {articles.length === 0 ? (
            <div className="cap" style={{ textAlign: 'center', padding: '20px 0' }}>No published articles in this category yet.</div>
          ) : (
            articles.map((a) => (
              <div key={a.id} className="kb-art" onClick={() => setArticleId(a.id)}>
                <div className="ka-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19">
                    <path d="M4 5h16v14H4z" />
                    <path d="M4 9h16M8 13h8M8 16h5" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ka-t">{a.title}</div>
                  <div className="ka-d">{a.body.length > 130 ? `${a.body.slice(0, 130).trimEnd()}…` : a.body}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

export function SelfServicePortal() {
  const { data, isLoading, error, refetch } = usePortal();
  const toast = useToast();
  const [showOrderTrack, setShowOrderTrack] = useState(false);
  const [showTicketTrack, setShowTicketTrack] = useState(false);
  const [showReturnRequest, setShowReturnRequest] = useState(false);
  const [showForumNotice, setShowForumNotice] = useState(false);
  const [viewingCategory, setViewingCategory] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15 }}>Self-service portal</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          The customer-facing help centre — 88% of customers prefer to solve it themselves. This is what they see at
          help.shopnova.in
        </div>
      </div>
      <div className="portal-frame">
        <div className="portal-bar">
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
          <div className="url">🔒 help.shopnova.in</div>
        </div>
        <div className="portal-body">
          <div className="portal-hero">
            <h2>Hi 👋 How can we help you today?</h2>
            <div className="portal-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              Search — &quot;track my order&quot;, &quot;return policy&quot;…
            </div>
          </div>
          <div className="portal-cats">
            {data.categories.map((c) => (
              <div key={c.label} className="portal-cat" onClick={() => setViewingCategory(c.label)}>
                <div className="pci">{c.icon}</div>
                <div className="pcn">{c.label}</div>
                <div className="pcc">{c.articleCount} articles</div>
              </div>
            ))}
          </div>
          <div className="portal-actions">
            <div className="portal-act" onClick={() => setShowOrderTrack(true)}>
              <div className="pai">📦</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Track an order</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Live status &amp; delivery ETA</div>
              </div>
            </div>
            <div className="portal-act" onClick={() => setShowTicketTrack(true)}>
              <div className="pai">🎫</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Raise a request</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Log &amp; track a support ticket</div>
              </div>
            </div>
            <div className="portal-act" onClick={() => setShowReturnRequest(true)}>
              <div className="pai">↩️</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Return / refund</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Start a return in 2 taps</div>
              </div>
            </div>
            <div className="portal-act" onClick={() => setShowForumNotice(true)}>
              <div className="pai">💬</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Community forum</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ask &amp; help other shoppers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showOrderTrack && (
        <OrderTrackModal defaultRef={data.latestOrder?.extRef ?? ''} onClose={() => setShowOrderTrack(false)} />
      )}
      {showTicketTrack && <TicketTrackModal onClose={() => setShowTicketTrack(false)} />}
      {showReturnRequest && (
        <ReturnRequestModal defaultRef={data.latestOrder?.extRef ?? ''} onClose={() => setShowReturnRequest(false)} />
      )}
      {showForumNotice && <ForumNoticeModal onClose={() => setShowForumNotice(false)} />}
      {viewingCategory && <CategoryModal label={viewingCategory} onClose={() => setViewingCategory(null)} />}
    </>
  );
}
