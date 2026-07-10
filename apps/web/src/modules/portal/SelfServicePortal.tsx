import { usePortal } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';

/**
 * Self-Service Portal — exact port of the prototype's #portal section.
 * Markup/classes verbatim, category counts + latest order from usePortal(). (Plan §10.2 pattern)
 */

const QUICK_ACTIONS = [
  { icon: '🎫', title: 'Raise a request', sub: 'Log & track a support ticket', toast: 'Raise-a-ticket form opened' },
  { icon: '↩️', title: 'Return / refund', sub: 'Start a return in 2 taps', toast: 'Return & refund self-service opened' },
  { icon: '💬', title: 'Community forum', sub: 'Ask & help other shoppers', toast: 'Community forum opened' },
];

export function SelfServicePortal() {
  const { data, isLoading, error, refetch } = usePortal();
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function trackOrder() {
    if (data?.latestOrder) {
      toast(`Order tracker opened — ${data.latestOrder.extRef} is ${data.latestOrder.status}`);
    } else {
      toast('No recent orders to track');
    }
  }

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
              <div key={c.label} className="portal-cat" onClick={() => toast(`Opening "${c.label}"…`)}>
                <div className="pci">{c.icon}</div>
                <div className="pcn">{c.label}</div>
                <div className="pcc">{c.articleCount} articles</div>
              </div>
            ))}
          </div>
          <div className="portal-actions">
            <div className="portal-act" onClick={trackOrder}>
              <div className="pai">📦</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Track an order</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Live status &amp; delivery ETA</div>
              </div>
            </div>
            {QUICK_ACTIONS.map((a) => (
              <div key={a.title} className="portal-act" onClick={() => toast(a.toast)}>
                <div className="pai">{a.icon}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
