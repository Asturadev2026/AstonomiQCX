import { useState } from 'react';
import {
  useCallWorkflowSteps,
  useCdr,
  useCreateTelephonyNumber,
  useSendTestCall,
  useTelephonyIntegrationStatus,
  useTelephonyKpis,
  useTelephonyNumbers,
} from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';

/**
 * Cloud Telephony — exact port of the prototype's #telephony section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped via the user's explicit choice: real Call
 * logs (CDR) + real KPIs where a real source exists, a real Exotel
 * integration settings form (works with real credentials once added, same
 * "not configured" degradation as WhatsApp/Sarvam/ElevenLabs), and a real
 * virtual-numbers CRUD table. The IVR call-flow builder and Live
 * console/Masking bridge are NOT built — genuinely impossible without a
 * connected phone line, same deferral as Voice AI's live-call half — shown
 * as an honest "needs Exotel" note per tab instead.
 */

type Tab = 'overview' | 'integration' | 'ivr' | 'console' | 'masking' | 'cdr';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview & workflow' },
  { id: 'integration', label: 'Integration & numbers' },
  { id: 'ivr', label: 'Call flow (IVR)' },
  { id: 'console', label: 'Live console' },
  { id: 'masking', label: 'Masking & dialer' },
  { id: 'cdr', label: 'Call logs (CDR)' },
];

const STEP_COLORS = ['#2563EB', '#0EA5E9', '#4F46E5', '#E08A00', '#16A34A', '#DB2777'];

function NotConnectedNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: 12.5,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function OverviewTab() {
  const kpis = useTelephonyKpis();
  const steps = useCallWorkflowSteps();

  if (kpis.isLoading) return <LoadingState />;
  if (kpis.error || !kpis.data) return <ErrorState error={kpis.error} retry={() => void kpis.refetch()} />;

  const k = kpis.data;

  return (
    <div className="tel-panel on">
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 0-2z" />
            </svg>
          </div>
          <div className="val">{k.callsToday}</div>
          <div className="lab">Calls today</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div className="val">{k.carrierUptimePct !== null ? `${k.carrierUptimePct}%` : '—'}</div>
          <div className="lab">Carrier uptime</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">{k.avgWaitSecs !== null ? k.avgWaitSecs : '—'}</div>
          <div className="lab">Avg wait</div>
        </div>
        <div className="card kpi">
          <div className="ic b-indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div className="val">{k.avgCostPerCall !== null ? `₹${k.avgCostPerCall}` : '—'}</div>
          <div className="lab">Avg cost / call</div>
        </div>
      </div>
      <div className="card">
        <h3>End-to-end call workflow</h3>
        <div className="cap">How a call flows from the carrier to a closed ticket — all automatic</div>
        <div className="tel-flow">
          {(steps.data ?? []).map((s, i) => (
            <div className="tstep" key={s.step}>
              <span className="num">{s.step}</span>
              <div className="tn" style={{ background: STEP_COLORS[i % STEP_COLORS.length] }}>
                ⚡
              </div>
              <div className="tt">{s.label}</div>
              <div className="td">{s.detail}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, padding: 13, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 11, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          This is what a fully-connected Exotel integration automates end-to-end. Calls today and this workflow
          reference are real; carrier uptime, average wait and average cost per call have no real data source yet —
          they need live carrier telemetry and billing data.
        </div>
      </div>
    </div>
  );
}

function IntegrationTab() {
  const status = useTelephonyIntegrationStatus();
  const numbers = useTelephonyNumbers();
  const sendTestCall = useSendTestCall();
  const createNumber = useCreateTelephonyNumber();
  const toast = useToast();

  const [testNumber, setTestNumber] = useState('');
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newType, setNewType] = useState('');
  const [newMappedTo, setNewMappedTo] = useState('');

  if (status.isLoading || numbers.isLoading) return <LoadingState />;
  if (status.error || !status.data) return <ErrorState error={status.error} retry={() => void status.refetch()} />;
  if (numbers.error || !numbers.data) return <ErrorState error={numbers.error} retry={() => void numbers.refetch()} />;

  const s = status.data;

  function sendTest() {
    if (!testNumber.trim()) {
      toast('Enter a number to test');
      return;
    }
    sendTestCall.mutate(
      { toNumber: testNumber.trim() },
      {
        onSuccess: (res) =>
          toast(res.configured ? `Test call placed — ${res.status ?? 'queued'} ✓` : 'Exotel is not configured yet — add EXOTEL_* keys to .env'),
        onError: (err) => toast(err instanceof Error ? err.message : 'Test call failed'),
      },
    );
  }

  function submitNumber() {
    if (!newNumber.trim()) {
      toast('Number is required');
      return;
    }
    createNumber.mutate(
      { number: newNumber.trim(), type: newType.trim() || undefined, mappedTo: newMappedTo.trim() || undefined },
      {
        onSuccess: () => {
          toast('Number added ✓');
          setNewNumber('');
          setNewType('');
          setNewMappedTo('');
          setShowAddNumber(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not add number'),
      },
    );
  }

  return (
    <div className="tel-panel on">
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Connect a telephony provider</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          Plug in any Indian carrier — no rip-and-replace.
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
        {[
          { name: 'Exotel', icon: '📞', color: '#2563EB', status: s.configured ? 'Connected' : 'Not connected' },
          { name: 'Twilio', icon: '☎️', color: '#E23A3A', status: 'Available' },
          { name: 'Ozonetel', icon: '📱', color: '#16A34A', status: 'Available' },
          { name: 'Knowlarity', icon: '📟', color: '#E08A00', status: 'Available' },
          { name: 'MyOperator', icon: '📠', color: '#4F46E5', status: 'Available' },
        ].map((p) => (
          <div className={`prov ${p.name === 'Exotel' && s.configured ? 'on' : ''}`} key={p.name}>
            <div className="pv-logo" style={{ background: p.color }}>
              {p.icon}
            </div>
            <div className="pv-n">{p.name}</div>
            <div className="pv-s" style={{ color: p.status === 'Connected' ? 'var(--green)' : 'var(--muted)' }}>
              {p.status}
            </div>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3>Exotel connection</h3>
          <div className="cap">{s.configured ? 'Live · credentials configured' : 'Not configured yet'}</div>
          <div className="cred">
            <div className="cl">API Key (SID)</div>
            <div className="cv">{s.maskedSid ?? '— not set —'}</div>
          </div>
          <div className="cred">
            <div className="cl">API Token</div>
            <div className="cv">{s.maskedToken ?? '— not set —'}</div>
          </div>
          <div className="cred">
            <div className="cl">Inbound webhook (calls hit this)</div>
            <div className="cv">{s.webhookUrl}</div>
          </div>
          <div className="infoline" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 12 }}>
            <span>Status</span>
            <b style={{ color: s.configured ? 'var(--green)' : 'var(--muted)' }}>
              {s.configured ? '● Connected' : '○ Not configured — add EXOTEL_SID/EXOTEL_API_KEY/EXOTEL_API_TOKEN to .env'}
            </b>
          </div>
          <input
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            placeholder="Your number to test, e.g. +91 98765 43210"
            style={{
              width: '100%',
              marginTop: 10,
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              borderRadius: 9,
              padding: 9,
              fontSize: 12.5,
              outline: 'none',
              color: 'var(--text)',
            }}
          />
          <button
            className="btn btn-o"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            onClick={sendTest}
            disabled={sendTestCall.isPending}
          >
            Send test call
          </button>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
              <h3>Virtual numbers</h3>
              <div className="cap">DID, toll-free &amp; masking numbers</div>
            </div>
            <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowAddNumber((v) => !v)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Buy number
            </button>
          </div>
          {showAddNumber && (
            <div style={{ marginTop: 10, marginBottom: 10 }}>
              <input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Number, e.g. +91 1800-266-0002"
                style={{ width: '100%', marginBottom: 6, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: 9, fontSize: 12.5, outline: 'none', color: 'var(--text)' }}
              />
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="Type, e.g. support, masking, dialer"
                style={{ width: '100%', marginBottom: 6, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: 9, fontSize: 12.5, outline: 'none', color: 'var(--text)' }}
              />
              <input
                value={newMappedTo}
                onChange={(e) => setNewMappedTo(e.target.value)}
                placeholder="Mapped to, e.g. Main IVR"
                style={{ width: '100%', marginBottom: 8, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: 9, fontSize: 12.5, outline: 'none', color: 'var(--text)' }}
              />
              <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }} onClick={submitNumber} disabled={createNumber.isPending}>
                Save number
              </button>
            </div>
          )}
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Mapped to</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {numbers.data.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.number}</td>
                  <td>{n.type ?? '—'}</td>
                  <td>{n.mappedTo ?? '—'}</td>
                  <td style={{ color: 'var(--green)' }}>{n.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IvrTab() {
  return (
    <div className="tel-panel on">
      <div className="card">
        <h3>Call flow (IVR builder)</h3>
        <div className="cap">Visual, publishable IVR flow builder</div>
        <NotConnectedNote>
          Not built yet — this needs both a connected phone line (Exotel) and a second visual flow-builder (like
          Agent Builder, but for phone menus). A real, static IVR reference menu is already live on the Contact
          Centre screen.
        </NotConnectedNote>
      </div>
    </div>
  );
}

function ConsoleTab() {
  return (
    <div className="tel-panel on">
      <div className="card">
        <h3>Agent live console (CTI softphone)</h3>
        <div className="cap">Screen-pop the customer's profile the instant a call lands</div>
        <NotConnectedNote>
          No live calls to show — this needs a connected telephony integration (Exotel) with real call audio, which
          isn't set up yet.
        </NotConnectedNote>
      </div>
    </div>
  );
}

function MaskingTab() {
  return (
    <div className="tel-panel on">
      <div className="card">
        <h3>Number masking &amp; outbound dialer</h3>
        <div className="cap">Bridge two real numbers, or run outbound campaigns</div>
        <NotConnectedNote>
          Needs a connected telephony integration (Exotel) that can actually bridge two live calls — not set up yet.
        </NotConnectedNote>
      </div>
    </div>
  );
}

function CdrTab() {
  const cdr = useCdr();
  const toast = useToast();

  if (cdr.isLoading) return <LoadingState />;
  if (cdr.error || !cdr.data) return <ErrorState error={cdr.error} retry={() => void cdr.refetch()} />;

  return (
    <div className="tel-panel on">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Call detail records (CDR)</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Every call leg logged — with disposition and the agent who took it
          </div>
        </div>
        <button className="btn btn-o" style={{ marginLeft: 'auto' }} onClick={() => toast('Exporting CDRs as CSV…')}>
          Export
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>Direction</th>
              <th>From → To</th>
              <th>Agent</th>
              <th>Duration</th>
              <th>Disposition</th>
              <th>Recording</th>
            </tr>
          </thead>
          <tbody>
            {cdr.data.map((c) => (
              <tr key={c.id}>
                <td className="mono">{new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{c.direction ?? '—'}</td>
                <td className="mono">
                  {c.fromNum ?? '—'} → {c.toNum ?? c.virtualNum ?? '—'}
                </td>
                <td>{c.agentName ?? '—'}</td>
                <td className="mono">{c.durationS !== null ? `${Math.floor(c.durationS / 60)}:${String(c.durationS % 60).padStart(2, '0')}` : '—'}</td>
                <td>{c.disposition}</td>
                <td style={{ color: 'var(--muted)' }}>{c.recordingUrl ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CloudTelephony() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <>
      <div className="seg-toggle" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'integration' && <IntegrationTab />}
      {tab === 'ivr' && <IvrTab />}
      {tab === 'console' && <ConsoleTab />}
      {tab === 'masking' && <MaskingTab />}
      {tab === 'cdr' && <CdrTab />}
    </>
  );
}
