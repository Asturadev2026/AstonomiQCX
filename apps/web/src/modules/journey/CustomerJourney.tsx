import { useEffect, useState } from 'react';
import { useJourney } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';

/**
 * Customer Journey — exact port of the prototype's #journey section.
 * Markup/classes verbatim, every value from useJourney(). (Plan §10.2)
 */

export function CustomerJourney() {
  const { data, isLoading, error, refetch } = useJourney();

  // replicate the prototype's bar fill animation (width 0 → target after mount)
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsOn(true), 120);
    return () => clearTimeout(t);
  }, [data]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15 }}>Customer journey</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          Every stage of the lifecycle, the touchpoints, and how CX is performing at each
        </div>
      </div>
      <div className="card">
        <div className="jrny">
          {data.stages.map((s) => (
            <div className="jstage" key={s.name}>
              <div className="ji" style={{ background: `${s.color}18`, color: s.color }}>
                {s.icon}
              </div>
              <div className="jn">{s.name}</div>
              <div className="jt">{s.description}</div>
              <div className="jm">
                {s.metrics.map((m) => (
                  <div className="r" key={m.label}>
                    <span>{m.label}</span>
                    <b>{m.value}</b>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sect-title">
        <h2>Drop-off &amp; friction points</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3>Where customers get stuck</h3>
          <div className="cap">Auto-detected from conversations</div>
          <div style={{ marginTop: 6 }}>
            {data.friction.map((f) => (
              <div className="chbar" key={f.label}>
                <div className="nm" style={{ width: 140 }}>
                  {f.label}
                </div>
                <div className="track">
                  <div
                    className="fill"
                    style={{ width: barsOn ? `${f.pct * 2.4}%` : 0, background: f.color }}
                  />
                </div>
                <div className="n">{f.pct}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Proactive nudges firing</h3>
          <div className="cap">Automated touchpoints</div>
          {data.nudges.map((n) => (
            <div className="infoline" key={n.trigger}>
              <span>{n.trigger}</span>
              <b style={{ color: n.status === 'live' ? 'var(--green)' : 'var(--amber)' }}>
                {n.status === 'live' ? 'Live' : 'Draft'}
              </b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
