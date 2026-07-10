import { useEffect, useState } from 'react';
import { useSurveys } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import type { CsatTrendPoint, RecentSurveyResponse, VocTheme } from '../../lib/api/types';

/**
 * Surveys & VoC — exact port of the prototype's #surveys section.
 * Markup/classes verbatim, every value from useSurveys(). (Plan §10.2 pattern)
 */

const GAUGE_R = 15.9; // matches prototype's svg circle radius → circumference ≈ 100

function gaugeDash(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `${clamped.toFixed(1)} ${(100 - clamped).toFixed(1)}`;
}

function Gauge({ pct, color, value, unit }: { pct: number; color: string; value: string; unit: string }) {
  return (
    <div className="gauge">
      <svg viewBox="0 0 42 42" width="140" height="140">
        <circle cx="21" cy="21" r={GAUGE_R} fill="none" stroke="#EEF2F9" strokeWidth={5} />
        <circle
          cx="21"
          cy="21"
          r={GAUGE_R}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={gaugeDash(pct)}
          strokeDashoffset={25}
          strokeLinecap="round"
        />
      </svg>
      <div className="cx">
        <b>{value}</b>
        <small>{unit}</small>
      </div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return <span style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}</span>;
}

function CsatTrendChart({ trend }: { trend: CsatTrendPoint[] }) {
  const values = trend.map((t) => t.avg).filter((v) => v > 0);
  const mn = values.length ? Math.min(...values) - 0.2 : 3.5;
  const mx = values.length ? Math.max(...values) + 0.2 : 5;
  const W = 520;
  const H = 170;
  const pad = 26;
  const px = (i: number) => pad + i * ((W - pad * 2) / Math.max(1, trend.length - 1));
  const py = (v: number) => H - pad - ((v - mn) / (mx - mn || 1)) * (H - pad * 2);
  const line = trend.map((d, i) => `${i ? 'L' : 'M'}${px(i)},${py(d.avg)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 10 }}>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad} y1={pad + t * (H - pad * 2)} x2={W - pad} y2={pad + t * (H - pad * 2)} stroke="#EEF2F9" />
      ))}
      <path d={line} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {trend.map((d, i) => (
        <g key={d.label}>
          <circle cx={px(i)} cy={py(d.avg)} r={3.5} fill="#fff" stroke="var(--green)" strokeWidth={2} />
          <text x={px(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#94A3B8">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ThemeBars({ themes, barsOn }: { themes: VocTheme[]; barsOn: boolean }) {
  return (
    <div style={{ marginTop: 6 }}>
      {themes.map((t) => (
        <div className="chbar" key={t.label}>
          <div className="nm" style={{ width: 112 }}>
            {t.label}
          </div>
          <div className="track">
            <div className="fill" style={{ width: barsOn ? `${t.pct * 2.6}%` : 0, background: t.color }} />
          </div>
          <div className="n">{t.pct}%</div>
        </div>
      ))}
    </div>
  );
}

function starColor(score: number): string {
  if (score >= 5) return 'var(--green)';
  if (score >= 3) return 'var(--amber)';
  return 'var(--red)';
}

function RecentResponses({ recent }: { recent: RecentSurveyResponse[] }) {
  return (
    <div>
      {recent.map((r, i) => {
        const col = starColor(r.score);
        return (
          <div className="feed-row" key={`${r.contactName}-${i}`}>
            <div className="feed-ic" style={{ background: `${col}18`, color: col, fontFamily: "'Space Grotesk'", fontWeight: 700 }}>
              {r.score}★
            </div>
            <div className="t">
              <b>{r.contactName}</b> · <span style={{ color: 'var(--muted)' }}>{r.channel ?? '—'}</span>
              <div style={{ color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>&quot;{r.comment}&quot;</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SurveysVoc() {
  const { data, isLoading, error, refetch } = useSurveys();

  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsOn(true), 120);
    return () => clearTimeout(t);
  }, [data]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const csatPct = (data.csat.avg / 5) * 100;
  const cesPct = (data.ces.avg / 7) * 100;

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>CSAT</h3>
          <div className="cap">Customer Satisfaction · this month</div>
          <Gauge pct={csatPct} color="var(--green)" value={data.csat.avg.toFixed(1)} unit="/ 5.0" />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            From <b style={{ color: 'var(--text)' }}>{data.csat.responseCount.toLocaleString()}</b> responses ·{' '}
            <Delta value={data.csat.deltaVsPrevMonth} />
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>NPS</h3>
          <div className="cap">Net Promoter Score</div>
          <Gauge
            pct={Math.max(0, data.nps.score)}
            color="var(--blue)"
            value={data.nps.score >= 0 ? `+${data.nps.score}` : `${data.nps.score}`}
            unit="NPS"
          />
          <div className="nps-bar">
            <div style={{ width: `${data.nps.promoterPct}%`, background: 'var(--green)' }}>{data.nps.promoterPct}% Promoters</div>
            <div style={{ width: `${data.nps.passivePct}%`, background: 'var(--amber)' }}>{data.nps.passivePct}%</div>
            <div style={{ width: `${data.nps.detractorPct}%`, background: 'var(--red)' }}>{data.nps.detractorPct}%</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Promoters · Passives · Detractors</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>CES</h3>
          <div className="cap">Customer Effort Score</div>
          <Gauge pct={cesPct} color="var(--sky)" value={data.ces.avg.toFixed(1)} unit="/ 7.0" />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            &quot;Easy to get help&quot; · <Delta value={data.ces.deltaVsPrevMonth} />
          </div>
        </div>
      </div>

      <div className="sect-title">
        <h2>CSAT trend &amp; feedback themes</h2>
        <div className="ln" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="card">
          <h3>CSAT · last 8 weeks</h3>
          <div className="cap">Post-interaction surveys across channels</div>
          <CsatTrendChart trend={data.trend} />
        </div>
        <div className="card">
          <h3>What&apos;s driving feedback</h3>
          <div className="cap">Auto-tagged from survey comments</div>
          <ThemeBars themes={data.themes} barsOn={barsOn} />
        </div>
      </div>

      <div className="sect-title">
        <h2>Recent survey responses</h2>
        <div className="ln" />
      </div>
      <div className="card">
        <RecentResponses recent={data.recent} />
      </div>
    </>
  );
}
