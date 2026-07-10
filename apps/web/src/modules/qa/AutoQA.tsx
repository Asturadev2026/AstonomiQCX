import { useEffect, useState } from 'react';
import { useQa } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';

/**
 * Auto QA — exact port of the prototype's #qa section.
 * Markup/classes verbatim, every value from useQa(). (Plan §10.2 pattern)
 */

export function AutoQA() {
  const { data, isLoading, error, refetch } = useQa();
  const toast = useToast();

  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsOn(true), 120);
    return () => clearTimeout(t);
  }, [data]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const { kpis, recentAudits, leaderboard, intents } = data;

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="val">{kpis.autoAuditedPct}%</div>
          <div className="lab">Interactions auto-audited</div>
        </div>
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h4l3 8 4-16 3 8h4" />
            </svg>
          </div>
          <div className="val">{kpis.avgScore}</div>
          <div className="lab">Avg QA score</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 13s1.5 2 4 2 4-2 4-2" />
            </svg>
          </div>
          <div className="val">
            {kpis.csatDeltaPct >= 0 ? '+' : ''}
            {kpis.csatDeltaPct}%
          </div>
          <div className="lab">CSAT vs last month</div>
        </div>
        <div className="card kpi">
          <div className="ic b-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </div>
          <div className="val">{kpis.flaggedCount}</div>
          <div className="lab">Flagged for coaching</div>
        </div>
      </div>

      <div className="sect-title">
        <h2>Auto QA — recent audits</h2>
        <div className="ln" />
      </div>
      <div className="card">
        {recentAudits.map((q, i) => (
          <div className="qa-row" key={i}>
            <div className={`qa-score ${q.scoreClass}`}>{q.score}</div>
            <div className="qbar">
              <div className="qt">
                <span>{q.agentLabel}</span>
                <small>vs {q.customerName}</small>
              </div>
              <div className="qsub">
                <span>
                  Intent: <b>{q.category}</b>
                </span>
                <span>
                  Empathy: <b>{q.empathy}</b>
                </span>
                <span>
                  Resolution: <b>{q.resolution}</b>
                </span>
              </div>
            </div>
            <button className="btn btn-o" onClick={() => toast('Opening full audit trail…')}>
              Review
            </button>
          </div>
        ))}
      </div>

      <div className="sect-title">
        <h2>Agent leaderboard · this week</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3>Top performers</h3>
          <div className="cap">By resolution volume + QA score</div>
          {leaderboard.map((l) => (
            <div className="lead" key={l.name}>
              <div className={`rk ${l.rank === 1 ? 'top' : ''}`}>{l.rank === 1 ? '★' : l.rank}</div>
              <div className="lav" style={{ background: l.avatarColor }}>
                {l.initials}
              </div>
              <div>
                <div className="ln2">{l.name}</div>
                <div className="lr">{l.title}</div>
              </div>
              <div className="lm">
                <b>{l.resolvedCount}</b>
                <small>resolved · QA {l.avgScore}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>What customers are talking about</h3>
          <div className="cap">Top intents auto-detected</div>
          <div style={{ marginTop: 6 }}>
            {intents.map((n) => (
              <div className="chbar" key={n.label}>
                <div className="nm" style={{ width: 118 }}>
                  {n.label}
                </div>
                <div className="track">
                  <div className="fill" style={{ width: barsOn ? `${n.pct * 2.5}%` : 0, background: n.color }} />
                </div>
                <div className="n">{n.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
