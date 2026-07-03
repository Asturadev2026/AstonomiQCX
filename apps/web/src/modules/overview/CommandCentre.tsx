import { useEffect, useState } from 'react';
import { useActivityFeed, useOverview } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';

/**
 * Command Centre — exact port of the prototype's #overview section.
 * This file is THE porting example: markup/classes verbatim, every value
 * from hooks, none inline. (Plan §10.2)
 */

function fmtSecs(total: number): JSX.Element {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <>
      {m}m {s}s
    </>
  );
}

export function CommandCentre() {
  const { data: ov, isLoading, error, refetch } = useOverview();
  const { data: feed } = useActivityFeed();

  // replicate the prototype's bar fill animation (width 0 → target after mount)
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsOn(true), 120);
    return () => clearTimeout(t);
  }, [ov]);

  if (isLoading) return <LoadingState />;
  if (error || !ov) return <ErrorState error={error} retry={() => void refetch()} />;

  const k = ov.kpis;
  const r = ov.resolution;

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16v12H5.2L4 17.5V4z" />
            </svg>
          </div>
          <div className="trend up">▲{k.conversationsTrendPct}%</div>
          <div className="val">{k.conversationsToday.toLocaleString('en-IN')}</div>
          <div className="lab">Conversations today</div>
        </div>
        <div className="card kpi">
          <div className="ic b-sky">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div className="trend up">▲{k.aiResolvedTrendPct}%</div>
          <div className="val">{k.aiResolvedPct}%</div>
          <div className="lab">Auto-resolved by AI</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 13s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
            </svg>
          </div>
          <div className="trend up">▲{k.csatTrend}</div>
          <div className="val">
            {k.avgCsat}
            <small style={{ fontSize: 15, color: 'var(--muted)' }}>/5</small>
          </div>
          <div className="lab">Avg CSAT score</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="trend up">▼{Math.abs(k.firstResponseTrendSecs)}s</div>
          <div className="val">{fmtSecs(k.avgFirstResponseSecs)}</div>
          <div className="lab">Avg first response</div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Signals across channels</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <h3>Volume by channel</h3>
          <div className="cap">Where customers are reaching you right now</div>
          <div>
            {ov.channels.map((c) => (
              <div className="chbar" key={c.name}>
                <div className="nm">
                  <span className="ci" style={{ background: `${c.color}22` }}>
                    {c.icon}
                  </span>
                  {c.name}
                </div>
                <div className="track">
                  <div
                    className="fill"
                    style={{ width: barsOn ? `${c.pct * 2}%` : 0 }}
                  />
                </div>
                <div className="n">{c.pct}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Resolution mix</h3>
          <div className="cap">Last 24 hours</div>
          <div className="donut-wrap">
            <div className="donut">
              <svg viewBox="0 0 42 42" width="150" height="150">
                <circle cx="21" cy="21" r="15.9" fill="none" stroke="#EEF2F9" strokeWidth="6" />
                <circle
                  cx="21" cy="21" r="15.9" fill="none" stroke="var(--blue)" strokeWidth="6"
                  strokeDasharray={`${r.aiPct} ${100 - r.aiPct}`} strokeDashoffset="25" strokeLinecap="round"
                />
                <circle
                  cx="21" cy="21" r="15.9" fill="none" stroke="var(--sky)" strokeWidth="6"
                  strokeDasharray={`${r.agentPct} ${100 - r.agentPct}`}
                  strokeDashoffset={25 - r.aiPct} strokeLinecap="round"
                />
                <circle
                  cx="21" cy="21" r="15.9" fill="none" stroke="var(--amber)" strokeWidth="6"
                  strokeDasharray={`${r.inProgressPct} ${100 - r.inProgressPct}`}
                  strokeDashoffset={25 - r.aiPct - r.agentPct} strokeLinecap="round"
                />
              </svg>
              <div className="cx">
                <b>{r.totalLabel}</b>
                <small>total</small>
              </div>
            </div>
            <div className="leg">
              <div>
                <span style={{ background: 'var(--blue)' }} />
                AI resolved <b>{r.aiPct}%</b>
              </div>
              <div>
                <span style={{ background: 'var(--sky)' }} />
                Agent resolved <b>{r.agentPct}%</b>
              </div>
              <div>
                <span style={{ background: 'var(--amber)' }} />
                In progress <b>{r.inProgressPct}%</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Live activity feed</h2>
        <span className="dot live" />
        <div className="ln" />
      </div>
      <div className="card">
        <div>
          {(feed ?? []).map((f, i) => (
            <div className="feed-row" key={i}>
              <div className={`feed-ic ${f.iconClass}`}>{f.icon}</div>
              <div className="t">
                <span dangerouslySetInnerHTML={{ __html: f.html }} />
                <div style={{ marginTop: 5 }}>
                  <span className={`tag ${f.tag}`}>
                    {f.tag === 'res' ? 'Resolved' : f.tag === 'esc' ? 'Escalated' : 'AI handled'}
                  </span>
                </div>
              </div>
              <div className="tm">{f.time}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
