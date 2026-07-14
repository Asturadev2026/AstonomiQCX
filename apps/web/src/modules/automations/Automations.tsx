import { Fragment } from 'react';
import { useRules, useToggleRule } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { RuleAction, RuleCondition, RuleDto } from '../../lib/api/types';

/**
 * Automations — exact port of the prototype's #automations section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped to "UI port + real engine": every rule shown
 * here is a real `Rule` row, and the toggle really enables/disables a rule
 * that the backend's RuleEngineService evaluates against real ticket data
 * the instant a ticket is created (Guide §12.3) — not a client-side demo.
 *
 * "New rule" stays a toast (Guide scope note, same as Agent Builder's "Test"
 * button): there's no rule *builder* UI yet, only real toggle + real runs.
 */

const FIELD_LABELS: Record<string, string> = {
  segment: 'customer segment',
  category: 'category',
  text: 'message text',
  sentiment: 'sentiment',
  priority: 'priority',
  status: 'status',
  channel: 'channel',
  language: 'language',
};

const OP_LABELS: Record<string, string> = {
  eq: '=',
  ne: '≠',
  in: 'in',
  nin: 'not in',
  contains: 'contains',
  gt: '>',
  lt: '<',
};

const TRIGGER_LABELS: Record<string, string> = {
  'ticket.created': 'New ticket created',
  'ticket.moved': 'Ticket status changed',
};

function formatCondition(c: RuleCondition): string {
  const field = FIELD_LABELS[c.field] ?? c.field;
  const op = OP_LABELS[c.op] ?? c.op;
  const value = Array.isArray(c.value) ? c.value.join('/') : String(c.value);
  return c.op === 'contains' ? `${field} ${op} "${value}"` : `${field} ${op} ${value}`;
}

function formatAction(a: RuleAction): string {
  switch (a.type) {
    case 'setPriority':
      return `Set priority ${(a.value ?? '').toUpperCase()}`;
    case 'assignDept':
      return `Assign to ${a.value}`;
    case 'escalate':
      return `Escalate (level ${a.level ?? 1})`;
    case 'notify':
      return `Notify ${a.target}`;
  }
}

function RuleRow({ rule, onToggle, pending }: { rule: RuleDto; onToggle: () => void; pending: boolean }) {
  const conditions = rule.conditions?.all ?? rule.conditions?.any ?? [];
  const actions = rule.actions ?? [];

  return (
    <div className="rule">
      <div style={{ flex: 1 }}>
        <div className="rn">{rule.name}</div>
        <div className="rd">{rule.description}</div>
        <div className="flow-line">
          <span className="flow-pill fp-trig">⚡ {TRIGGER_LABELS[rule.trigger ?? ''] ?? rule.trigger}</span>
          <span className="arr">→</span>
          {conditions.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="arr">+</span>}
              <span className="flow-pill fp-cond">❓ {formatCondition(c)}</span>
            </Fragment>
          ))}
          <span className="arr">→</span>
          {actions.map((a, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="arr">+</span>}
              <span className="flow-pill fp-act">✓ {formatAction(a)}</span>
            </Fragment>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div
          className={`sw ${rule.enabled ? 'on' : ''}`}
          style={{ marginLeft: 'auto', opacity: pending ? 0.6 : 1, pointerEvents: pending ? 'none' : 'auto' }}
          onClick={onToggle}
        />
        {rule.runs > 0 ? (
          <div className="runs" style={{ marginTop: 8 }}>
            {rule.runs.toLocaleString()} runs
          </div>
        ) : (
          <div className="runs" style={{ marginTop: 8, color: 'var(--muted2)' }}>
            paused
          </div>
        )}
      </div>
    </div>
  );
}

export function Automations() {
  const { data, isLoading, error, refetch } = useRules();
  const toggleRule = useToggleRule();
  const toast = useToast();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function toggle(rule: RuleDto) {
    toggleRule.mutate(
      { id: rule.id },
      {
        onSuccess: (updated) => toast(`Rule "${updated.name}" ${updated.enabled ? 'enabled' : 'paused'} ✓`),
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not toggle rule'),
      },
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Business rules</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Trigger → condition → action. Runs automatically on every ticket. Toggle any rule on or off.
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => toast('Opening rule builder…')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New rule
        </button>
      </div>
      <div id="rulesList">
        {data.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            onToggle={() => toggle(rule)}
            pending={toggleRule.isPending && toggleRule.variables?.id === rule.id}
          />
        ))}
      </div>
    </>
  );
}
