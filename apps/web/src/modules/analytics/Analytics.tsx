import { useAnalytics } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import type { TrendPoint } from '../../lib/api/types';

/**
 * Analytics — exact port of the prototype's #analytics section.
 * Markup/classes verbatim, every value from useAnalytics(). (Plan §10.2 pattern)
 */

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const W = 560;
  const H = 200;
  const pad = 24;
  const mx = Math.max(10, ...trend.map((t) => t.total)) * 1.1;
  const px = (i: number) => pad + i * ((W - pad * 2) / Math.max(1, trend.length - 1));
  const py = (v: number) => H - pad - (v / mx) * (H - pad * 2);
  const line = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${px(i)},${py(v)}`).join(' ');
  const area = (values: number[]) =>
    `M${px(0)},${H - pad} ` + values.map((v, i) => `L${px(i)},${py(v)}`).join(' ') + ` L${px(values.length - 1)},${H - pad} Z`;
  const totals = trend.map((t) => t.total);
  const aiResolved = trend.map((t) => t.aiResolved);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 10 }}>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2563EB" stopOpacity=".2" />
          <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad} y1={pad + t * (H - pad * 2)} x2={W - pad} y2={pad + t * (H - pad * 2)} stroke="#EEF2F9" />
      ))}
      <path d={area(totals)} fill="url(#g1)" />
      <path d={line(totals)} fill="none" stroke="#2563EB" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={line(aiResolved)} fill="none" stroke="#0EA5E9" strokeWidth={2.5} strokeDasharray="1 5" strokeLinecap="round" />
      {totals.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={2.5} fill="#2563EB" />
      ))}
    </svg>
  );
}

export function Analytics() {
  const { data, isLoading, error, refetch } = useAnalytics();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const { kpis, trend, csatByChannel, hourBars, languages, heat } = data;
  const maxHeat = Math.max(1, ...heat);

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16v12H5.2L4 17.5V4z" />
            </svg>
          </div>
          <div className="val">{kpis.conversations30d.toLocaleString('en-IN')}</div>
          <div className="lab">Conversations · 30 days</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div className="val">{kpis.costSavedLabel}</div>
          <div className="lab">Cost saved by AI</div>
        </div>
        <div className="card kpi">
          <div className="ic b-indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="val">{kpis.avgHandleTimeLabel}</div>
          <div className="lab">Avg handle time</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div className="val">{kpis.slaMetPct}%</div>
          <div className="lab">SLA met</div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Conversation trend</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="card">
          <h3>Volume &amp; AI resolution · last 14 days</h3>
          <div className="cap">AI is handling a growing share</div>
          <TrendChart trend={trend} />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--blue)' }} />
              Total conversations
            </span>
            <span>
              <i style={{ background: 'var(--sky)' }} />
              AI resolved
            </span>
          </div>
        </div>
        <div className="card">
          <h3>CSAT by channel</h3>
          <div className="cap">This month</div>
          <div style={{ marginTop: 10 }}>
            {csatByChannel.map((c) => (
              <div className="chbar" key={c.label}>
                <div className="nm" style={{ width: 88 }}>
                  {c.label}
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(c.avg / 5) * 100}%`, background: c.color }} />
                </div>
                <div className="n">{c.avg}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sect-title">
        <h2>SLA &amp; response times</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card">
          <h3>First response time by hour</h3>
          <div className="cap">Last 14 days · relative to slowest hour</div>
          <div style={{ display: 'flex', gap: 10, height: 130, marginTop: 10 }}>
            {hourBars.map((h) => (
              <div key={h.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', height: `${h.pct}%`, borderRadius: '6px 6px 3px 3px', background: 'var(--grad)' }} />
                <small style={{ fontSize: 10, color: 'var(--muted)' }}>{h.label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Language split</h3>
          <div className="cap">Detected automatically</div>
          <div style={{ marginTop: 10 }}>
            {languages.map((l) => (
              <div className="chbar" key={l.label}>
                <div className="nm" style={{ width: 70 }}>
                  {l.label}
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${l.pct * 1.9}%`, background: l.color }} />
                </div>
                <div className="n">{l.pct}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Peak hours heat</h3>
          <div className="cap">Busiest windows · last 14 days</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginTop: 6 }}>
            {heat.map((v, i) => (
              <div key={i} style={{ aspectRatio: '1', borderRadius: 6, background: `rgba(37,99,235,${v / 10})` }} title={String(v)} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Darker = busier. Peak bucket:{' '}
            <b style={{ color: 'var(--text)' }}>
              {heat.indexOf(maxHeat) * 2}:00–{heat.indexOf(maxHeat) * 2 + 2}:00 IST
            </b>
          </div>
        </div>
      </div>
    </>
  );
}
