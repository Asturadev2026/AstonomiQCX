import { useBilling } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { ErrorState, LoadingState } from '../../components/states';
import type { PlanCard } from '../../lib/api/types';

/**
 * Billing & Plans — exact port of the prototype's #billing section: this cycle's
 * usage meters, recent invoices and the plan catalog. Usage is computed from real
 * conversation/message/call/user rows for the tenant's active subscription cycle
 * (no metering worker exists yet — see billing.service.ts) — not client-side demo data.
 */
export function Billing() {
  const { data, isLoading, error, refetch } = useBilling();
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function choosePlan(plan: PlanCard) {
    toast(plan.current ? 'This is your current plan' : `Switch to ${plan.name} — contact sales`);
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15 }}>Billing &amp; plans</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          Your subscription, usage this cycle and invoices
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <div className="card">
          <h3>This cycle&apos;s usage</h3>
          <div className="cap">{data.cycleLabel}</div>
          <div style={{ marginTop: 10 }}>
            {data.usage.map((m) => (
              <div className="meter" key={m.label}>
                <div className="ml">
                  <span>{m.label}</span>
                  <b>{m.usedLabel}</b>
                </div>
                <div className="mt2">
                  <div className="mf" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="infoline" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 12 }}>
            <span>Estimated bill this cycle</span>
            <b style={{ fontSize: 15, color: 'var(--blue)' }}>{data.estimatedBillLabel}</b>
          </div>
        </div>
        <div className="card">
          <h3>Recent invoices</h3>
          <div className="cap">Auto-generated monthly</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.extRef}</td>
                  <td>{inv.period}</td>
                  <td className="mono">{inv.amountLabel}</td>
                  <td>
                    <span className={`ostat ${inv.status === 'Paid' ? 'o-del' : 'o-tr'}`}>{inv.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sect-title">
        <h2>Plans</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {data.plans.map((p) => (
          <div className={`plan ${p.current ? 'cur' : ''}`} key={p.id}>
            {p.current && <span className="pcur">Current plan</span>}
            <div className="pn">{p.name}</div>
            <div className="pp">
              {p.priceLabel}
              <small>{p.priceLabel === 'Custom' ? '' : '/mo'}</small>
            </div>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`btn ${p.current ? 'btn-o' : 'btn-g'}`}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
              onClick={() => choosePlan(p)}
            >
              {p.current ? 'Manage plan' : `Choose ${p.name}`}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
