import { Fragment } from 'react';
import { usePriorityMatrix } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { PriorityMatrixCellDto } from '../../lib/api/types';

/**
 * Priority Matrix — exact port of the prototype's #priomatrix section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Unlike the prototype's hardcoded grid, every cell
 * and every keyword shown here comes straight from the real
 * `priorityFromMatrix()` classifier in apps/api/src/tickets/priority.ts —
 * this screen can never drift from what actually decides a ticket's
 * priority. Resolution times come from the tenant's real SlaPolicy rows.
 */

const PRIORITY_COLOR: Record<string, string> = {
  p1: 'var(--red)',
  p2: 'var(--amber)',
  p3: 'var(--sky)',
  p4: '#94A3B8',
};

const URGENCY_ROWS: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
const IMPACT_COLS: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

const URGENCY_LABEL: Record<string, string> = { high: 'High urgency', medium: 'Medium urgency', low: 'Low urgency' };
const IMPACT_LABEL: Record<string, string> = { low: 'Low impact', medium: 'Medium impact', high: 'High impact' };

const LEVEL_COLOR: Record<string, string> = {
  p1: 'var(--red)',
  p2: 'var(--amber)',
  p3: 'var(--sky)',
  p4: 'var(--muted2)',
};

export function PriorityMatrix() {
  const { data, isLoading, error, refetch } = usePriorityMatrix();
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const cellFor = (urgency: string, impact: string): PriorityMatrixCellDto | undefined =>
    data.cells.find((c) => c.urgency === urgency && c.impact === impact);

  function clickCell(c: PriorityMatrixCellDto) {
    toast(`${URGENCY_LABEL[c.urgency]} × ${IMPACT_LABEL[c.impact]} → ${c.priority.toUpperCase()} · resolve in ${c.resolutionLabel}`);
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15 }}>Priority matrix</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          Every ticket's priority is set automatically from Urgency × Impact. Click a cell to see the rule.
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="card">
          <div className="pmx">
            <div className="hd" />
            <div className="hd">Low impact</div>
            <div className="hd">Medium impact</div>
            <div className="hd">High impact</div>
            {URGENCY_ROWS.map((urgency) => (
              <Fragment key={urgency}>
                <div className="axis">{URGENCY_LABEL[urgency]}</div>
                {IMPACT_COLS.map((impact) => {
                  const cell = cellFor(urgency, impact);
                  if (!cell) return <div key={`${urgency}-${impact}`} />;
                  return (
                    <div
                      className="cell"
                      key={`${urgency}-${impact}`}
                      style={{ background: PRIORITY_COLOR[cell.priority] ?? '#94A3B8' }}
                      onClick={() => clickCell(cell)}
                    >
                      <b>{cell.priority.toUpperCase()}</b>
                      <small>{cell.resolutionLabel} resolve</small>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>How it reads</h3>
          <div className="cap">Auto-set at ticket creation</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--muted)' }}>
            {data.levels.map((l) => (
              <p key={l.priority} style={{ marginTop: l.priority === 'p1' ? 0 : 10 }}>
                <b style={{ color: LEVEL_COLOR[l.priority] }}>
                  {l.priority.toUpperCase()} — {l.label}:
                </b>{' '}
                {l.description}
                {l.keywords.length > 0 && (
                  <>
                    {' '}
                    Keywords: <b style={{ color: 'var(--text)' }}>{l.keywords.join(', ')}</b>.
                  </>
                )}
              </p>
            ))}
            <p style={{ marginTop: 12 }}>
              High-impact signals: <b style={{ color: 'var(--text)' }}>{data.impactKeywords.join(', ')}</b>. {data.vipBumpNote}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
