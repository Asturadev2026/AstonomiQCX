import { useState, type CSSProperties } from 'react';
import { useContactOrders, useCreateContactOrder } from '../lib/api/hooks';
import { useTestContact } from '../state/testContact';
import { inr } from '../lib/format';
import { EmptyState, LoadingState } from './states';

// Mirrors @aq/shared's ORDER_STATUSES — kept local rather than imported since
// @aq/shared builds to CommonJS and this is the first browser-side runtime
// (non-type-only) use of one of its constants; everything else that package
// exports here is consumed as `import type`, which TS erases before it ever
// reaches the browser.
const ORDER_STATUSES = ['delivered', 'in_transit', 'refunded'] as const;

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

/**
 * Shows the Topbar's selected "test as customer" contact's orders, and lets
 * you add one — so seeded/untraceable demo data can be replaced with a known
 * order before asking Astra about it (Chatbot/WhatsApp/Voice AI).
 */
export function CustomerTestPanel() {
  const { contact } = useTestContact();
  const { data: orders, isLoading } = useContactOrders(contact?.id);
  const createOrder = useCreateContactOrder(contact?.id);
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<(typeof ORDER_STATUSES)[number]>('in_transit');
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('1');

  if (!contact) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Customer data</h3>
        <div className="cap">Select a customer above to see their orders.</div>
      </div>
    );
  }

  const submit = () => {
    if (!description.trim() || !amount) return;
    createOrder.mutate(
      { description: description.trim(), status, amount: parseFloat(amount) || 0, qty: parseInt(qty, 10) || 1 },
      {
        onSuccess: () => {
          setFormOpen(false);
          setDescription('');
          setAmount('');
          setQty('1');
          setStatus('in_transit');
        },
      },
    );
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 2 }}>{contact.name}</h3>
      <div className="cap" style={{ marginBottom: 12 }}>
        {contact.phone ?? '—'} {contact.email ? `· ${contact.email}` : ''}
      </div>

      {isLoading ? (
        <LoadingState label="Loading orders…" />
      ) : !orders?.length ? (
        <EmptyState label="No orders yet for this customer." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {orders.map((o) => (
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
          ))}
        </div>
      )}

      {!formOpen ? (
        <button className="btn btn-o" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setFormOpen(true)}>
          + Add order
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="Description, e.g. Wireless Mouse"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={fieldStyle}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={fieldStyle}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              min={0}
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <input
              type="number"
              min={1}
              placeholder="Qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              style={{ ...fieldStyle, width: 70 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-g" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={createOrder.isPending}>
              {createOrder.isPending ? 'Adding…' : 'Add'}
            </button>
            <button className="btn btn-o" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
