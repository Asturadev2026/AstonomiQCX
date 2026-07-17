import { useContactCentreKpis, useIvrMenu } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';

/**
 * Contact Centre — exact port of the prototype's #contactcentre section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped to "real pieces only, honest gaps" (user's
 * explicit choice): Agents on call and Abandon rate are real (live
 * AgentStatusRow / seeded historical Call data); Calls in queue is real but
 * honestly 0 without a connected phone line; Avg wait time has no real field
 * to compute from at all. The Live ACD queue and Supervisor monitoring
 * (listen-in/whisper/barge) are genuinely impossible without a connected
 * telephony integration (Exotel — not built, same deferral as Voice AI's
 * live-call half) — shown as an honest empty state, not fabricated activity.
 */

export function ContactCentre() {
  const kpis = useContactCentreKpis();
  const ivr = useIvrMenu();

  if (kpis.isLoading) return <LoadingState />;
  if (kpis.error || !kpis.data) return <ErrorState error={kpis.error} retry={() => void kpis.refetch()} />;

  const k = kpis.data;

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 0-2z" />
            </svg>
          </div>
          <div className="val">{k.callsInQueue}</div>
          <div className="lab">Calls in queue</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M22 4L12 14l-3-3" />
            </svg>
          </div>
          <div className="val">{k.agentsOnCall}</div>
          <div className="lab">Agents on call</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">—</div>
          <div className="lab">Avg wait time</div>
        </div>
        <div className="card kpi">
          <div className="ic b-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
          <div className="val">{k.abandonRatePct !== null ? `${k.abandonRatePct}%` : '—'}</div>
          <div className="lab">Abandon rate</div>
        </div>
      </div>

      <div className="sect-title">
        <h2>IVR &amp; call routing</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.3fr' }}>
        <div className="card">
          <h3>IVR menu flow</h3>
          <div className="cap">What callers hear on +91 1800-266-0000</div>
          <div style={{ marginTop: 6 }}>
            {(ivr.data ?? []).map((opt) => (
              <div className="ivr-node" key={opt.key}>
                <span className="k">{opt.key}</span>
                <div className="txt">
                  <b>{opt.label}</b>
                  <div style={{ color: 'var(--muted)' }}>→ {opt.destination}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
              <h3>Live ACD queue</h3>
              <div className="cap">Auto-distributed by skill &amp; wait time</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 6,
              minHeight: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 12.5,
              padding: 20,
            }}
          >
            No live calls in queue right now — this needs a connected telephony integration (Cloud Telephony/Exotel),
            which isn't set up yet.
          </div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Supervisor monitoring</h2>
        <div className="ln" />
      </div>
      <div className="card">
        <div className="cap" style={{ marginBottom: 8 }}>
          Live calls — listen in silently, whisper to the agent, or barge into the call
        </div>
        <div
          style={{
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 12.5,
            padding: 20,
          }}
        >
          Supervisor monitoring needs a connected telephony integration (Cloud Telephony/Exotel) with live call audio
          — not set up yet, so there's nothing to show here honestly.
        </div>
      </div>
    </>
  );
}
