import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useContactOrders,
  useContactTickets,
  useContactTimeline,
  useLatestContact,
} from '../../lib/api/hooks';
import { ErrorState, EmptyState, LoadingState } from '../../components/states';
import { inr, initials } from '../../lib/format';

/**
 * Customer 360 — exact port of the prototype's #customer section.
 * The prototype shows one hardcoded profile with no picker; there is no
 * customer-search/inbox entry point built yet to select a specific contact,
 * so this shows the most recently created one (real DB row, just not a
 * user-chosen one — Rule 1 still holds, nothing here is a literal).
 */

type Tab = 'orders' | 'tickets' | 'timeline';

const ORDER_STATUS_CLASS: Record<string, string> = {
  delivered: 'o-del',
  in_transit: 'o-tr',
  refunded: 'o-rf',
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  delivered: 'Delivered',
  in_transit: 'In transit',
  refunded: 'Refunded',
};
const SENTIMENT_LABEL: Record<string, string> = { pos: 'Happy', neu: 'Neutral', neg: 'Upset' };
const SENTIMENT_COLOR: Record<string, string> = {
  pos: 'var(--green)',
  neu: 'var(--amber)',
  neg: 'var(--pink)',
};

function fmtYear(iso: string): string {
  return new Date(iso).getFullYear().toString();
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CustomerProfile() {
  const [tab, setTab] = useState<Tab>('orders');
  const { data: profile, isLoading, error, refetch } = useLatestContact();
  const { data: orders, isLoading: ordersLoading } = useContactOrders(profile?.id);
  const { data: tickets, isLoading: ticketsLoading } = useContactTickets(profile?.id);
  const { data: timeline, isLoading: timelineLoading } = useContactTimeline(profile?.id);

  if (isLoading) return <LoadingState />;

  if (error instanceof Error && error.message.includes('404')) {
    return (
      <div className="card" style={{ padding: 34, textAlign: 'center' }}>
        <h3 style={{ fontSize: 16 }}>No customers yet</h3>
        <div className="cap" style={{ marginTop: 6, marginBottom: 16 }}>
          Add your first customer to see their profile here.
        </div>
        <Link to="/customer/add" className="btn btn-g" style={{ display: 'inline-flex' }}>
          + Add Customer
        </Link>
      </div>
    );
  }
  if (error || !profile) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <div className="grid c360">
      <div className="card profile-card">
        <div className="p-ava" style={{ background: 'var(--grad)' }}>
          {initials(profile.name)}
        </div>
        <h3>{profile.name}</h3>
        <div className="loc">
          📍 {profile.location ?? 'Location not added'} · Member since {fmtYear(profile.memberSince)}
        </div>
        <div className="p-stats">
          <div className="p-stat">
            <b>{profile.orderCount}</b>
            <small>Orders</small>
          </div>
          <div className="p-stat">
            <b>{inr(profile.lifetimeValue)}</b>
            <small>Lifetime value</small>
          </div>
          <div className="p-stat">
            <b>{profile.loyaltyTier ?? '—'}</b>
            <small>Loyalty tier</small>
          </div>
          <div className="p-stat" style={{ color: profile.sentiment ? SENTIMENT_COLOR[profile.sentiment] : undefined }}>
            <b>{profile.sentiment ? SENTIMENT_LABEL[profile.sentiment] : '—'}</b>
            <small>Sentiment</small>
          </div>
        </div>
        <div className="p-detail">
          <div className="r"><span>Phone</span><b>{profile.phone ?? '—'}</b></div>
          <div className="r"><span>Email</span><b>{profile.email ?? '—'}</b></div>
          <div className="r"><span>Preferred lang</span><b>{profile.language ?? '—'}</b></div>
          <div className="r"><span>Preferred channel</span><b>{profile.preferredChannel ?? '—'}</b></div>
          <div className="r">
            <span>Open tickets</span>
            <b style={{ color: profile.openTickets > 0 ? 'var(--amber)' : undefined }}>{profile.openTickets}</b>
          </div>
        </div>
        <Link
          to="/customer/add"
          className="btn btn-o"
          style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
        >
          + Add another customer
        </Link>
      </div>

      <div className="card">
        <div className="tabrow">
          <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>
            Order history
          </button>
          <button className={tab === 'tickets' ? 'on' : ''} onClick={() => setTab('tickets')}>
            Past tickets
          </button>
          <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
            Sentiment timeline
          </button>
        </div>

        {tab === 'orders' && (
          <div className="ct-tab on">
            {ordersLoading ? (
              <LoadingState />
            ) : !orders?.length ? (
              <EmptyState label="No orders yet for this customer." />
            ) : (
              orders.map((o) => (
                <div className="order" key={o.id}>
                  <div className="oic">📦</div>
                  <div>
                    <div className="oid">{o.extRef ?? o.id.slice(0, 8)}</div>
                    <div className="od">
                      {o.description ?? 'Order'} · {fmtDate(o.createdAt)}
                    </div>
                  </div>
                  <div className="amt">
                    <b>{o.amount != null ? inr(o.amount) : '—'}</b>
                    <br />
                    {o.status && (
                      <span className={`ostat ${ORDER_STATUS_CLASS[o.status] ?? ''}`}>
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'tickets' && (
          <div className="ct-tab on">
            {ticketsLoading ? (
              <LoadingState />
            ) : !tickets?.length ? (
              <EmptyState label="No support tickets for this customer." />
            ) : (
              tickets.map((t) => (
                <div className="order" key={t.id}>
                  <div className="oic" style={{ background: '#E0F4FE' }}>
                    🎫
                  </div>
                  <div>
                    <div className="oid">{t.subject}</div>
                    <div className="od">
                      {t.channel ?? 'Unknown channel'} · {fmtDate(t.createdAt)}
                    </div>
                  </div>
                  <div className="amt">
                    <span className="ostat" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <div className="ct-tab on">
            {timelineLoading ? (
              <LoadingState />
            ) : !timeline?.some((m) => m.pos + m.neu + m.neg > 0) ? (
              <EmptyState label="No conversation history yet to chart sentiment." />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 160, padding: '10px 0 0' }}>
                  {timeline!.map((m) => {
                    const total = m.pos + m.neu + m.neg;
                    const height = total ? Math.min(100, 20 + total * 16) : 4;
                    const color = m.dominant ? SENTIMENT_COLOR[m.dominant] : '#EEF2F9';
                    return (
                      <div
                        key={m.label}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}
                      >
                        <div
                          style={{ width: '100%', maxWidth: 34, height: `${height}%`, borderRadius: '8px 8px 4px 4px', background: color }}
                        />
                        <small style={{ fontSize: 11, color: 'var(--muted)' }}>{m.label}</small>
                      </div>
                    );
                  })}
                </div>
                <div className="legend">
                  <span><i style={{ background: 'var(--green)' }} />Happy</span>
                  <span><i style={{ background: 'var(--amber)' }} />Neutral</span>
                  <span><i style={{ background: 'var(--pink)' }} />Upset</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
