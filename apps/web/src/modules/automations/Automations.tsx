import { Fragment, useState } from 'react';
import { useCreateRule, useRules, useToggleRule } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { RuleAction, RuleActionType, RuleCondition, RuleConditionOp, RuleDto } from '../../lib/api/types';

/**
 * Automations — exact port of the prototype's #automations section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped to "UI port + real engine": every rule shown
 * here is a real `Rule` row, and the toggle really enables/disables a rule
 * that the backend's RuleEngineService evaluates against real ticket data
 * the instant a ticket is created (Guide §12.3) — not a client-side demo.
 *
 * "New rule" opens a real builder form (trigger + all-conditions + actions),
 * POSTs a real Rule row, and the engine picks it up on the next ticket event
 * — same "UI port + real engine" scope as the rest of this screen.
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

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  padding: 11,
  fontSize: 13,
  outline: 'none',
  color: 'var(--text)',
};

type ConditionDraft = { field: string; op: RuleConditionOp; value: string };
type ActionDraft = { type: RuleActionType; value: string; level: string; target: string };

const FIELD_OPTIONS = Object.keys(FIELD_LABELS);
const OP_OPTIONS = Object.keys(OP_LABELS) as RuleConditionOp[];
const TRIGGER_OPTIONS = Object.keys(TRIGGER_LABELS);
const ACTION_TYPE_OPTIONS: RuleActionType[] = ['setPriority', 'assignDept', 'escalate', 'notify'];
const ACTION_TYPE_LABELS: Record<RuleActionType, string> = {
  setPriority: 'Set priority',
  assignDept: 'Assign to department',
  escalate: 'Escalate',
  notify: 'Notify',
};

function emptyCondition(): ConditionDraft {
  return { field: FIELD_OPTIONS[0] ?? 'category', op: 'eq', value: '' };
}

function emptyAction(): ActionDraft {
  return { type: 'setPriority', value: 'p1', level: '1', target: 'Manager' };
}

function draftToCondition(d: ConditionDraft): RuleCondition {
  const value = d.op === 'in' || d.op === 'nin' ? d.value.split(',').map((v) => v.trim()).filter(Boolean) : d.value;
  return { field: d.field, op: d.op, value };
}

function draftToAction(d: ActionDraft): RuleAction {
  switch (d.type) {
    case 'setPriority':
      return { type: 'setPriority', value: d.value };
    case 'assignDept':
      return { type: 'assignDept', value: d.value };
    case 'escalate':
      return { type: 'escalate', level: Number(d.level) || 1 };
    case 'notify':
      return { type: 'notify', target: d.target };
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

function RuleForm({ onCancel, onSubmit, isSaving }: { onCancel: () => void; onSubmit: (dto: { name: string; description: string; trigger: string; conditions: ConditionDraft[]; actions: ActionDraft[] }) => void; isSaving: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<string>(TRIGGER_OPTIONS[0] ?? 'ticket.created');
  const [conditions, setConditions] = useState<ConditionDraft[]>([emptyCondition()]);
  const [actions, setActions] = useState<ActionDraft[]>([emptyAction()]);

  function updateCondition(i: number, patch: Partial<ConditionDraft>) {
    setConditions((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function updateAction(i: number, patch: Partial<ActionDraft>) {
    setActions((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>New rule</h3>
      <div className="cap">This is real — the engine evaluates it against every new ticket as soon as it's saved</div>

      <div className="cop-block" style={{ marginTop: 4 }}>
        <div className="lbl">Name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Refund requests → Payments" style={FIELD_STYLE} />
      </div>
      <div className="cop-block">
        <div className="lbl">Description</div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown under the rule name" style={FIELD_STYLE} />
      </div>
      <div className="cop-block">
        <div className="lbl">Trigger</div>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={FIELD_STYLE}>
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="cop-block">
        <div className="lbl">Conditions (all must match)</div>
        {conditions.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} style={{ ...FIELD_STYLE, flex: 1 }}>
              {FIELD_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
            <select value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value as RuleConditionOp })} style={{ ...FIELD_STYLE, flex: '0 0 90px' }}>
              {OP_OPTIONS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            <input
              value={c.value}
              onChange={(e) => updateCondition(i, { value: e.target.value })}
              placeholder={c.op === 'in' || c.op === 'nin' ? 'comma-separated values' : 'value'}
              style={{ ...FIELD_STYLE, flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-o"
              disabled={conditions.length === 1}
              onClick={() => setConditions((rows) => rows.filter((_, idx) => idx !== i))}
              style={{ padding: '0 10px' }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-o" onClick={() => setConditions((rows) => [...rows, emptyCondition()])} style={{ padding: '4px 10px', fontSize: 12 }}>
          + Add condition
        </button>
      </div>

      <div className="cop-block">
        <div className="lbl">Actions</div>
        {actions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value as RuleActionType })} style={{ ...FIELD_STYLE, flex: 1 }}>
              {ACTION_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {ACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {a.type === 'setPriority' && (
              <select value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} style={{ ...FIELD_STYLE, flex: 1 }}>
                {['p1', 'p2', 'p3', 'p4'].map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
            {a.type === 'assignDept' && (
              <input value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} placeholder="Department name" style={{ ...FIELD_STYLE, flex: 1 }} />
            )}
            {a.type === 'escalate' && (
              <input type="number" min={1} value={a.level} onChange={(e) => updateAction(i, { level: e.target.value })} placeholder="Level" style={{ ...FIELD_STYLE, flex: 1 }} />
            )}
            {a.type === 'notify' && (
              <input value={a.target} onChange={(e) => updateAction(i, { target: e.target.value })} placeholder="Role, e.g. Manager" style={{ ...FIELD_STYLE, flex: 1 }} />
            )}
            <button
              type="button"
              className="btn btn-o"
              disabled={actions.length === 1}
              onClick={() => setActions((rows) => rows.filter((_, idx) => idx !== i))}
              style={{ padding: '0 10px' }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-o" onClick={() => setActions((rows) => [...rows, emptyAction()])} style={{ padding: '4px 10px', fontSize: 12 }}>
          + Add action
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-g"
          disabled={isSaving}
          onClick={() => onSubmit({ name, description, trigger, conditions, actions })}
          style={{ flex: 1, justifyContent: 'center', padding: 12 }}
        >
          Save rule
        </button>
        <button className="btn btn-o" onClick={onCancel} style={{ padding: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Automations() {
  const { data, isLoading, error, refetch } = useRules();
  const toggleRule = useToggleRule();
  const createRule = useCreateRule();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);

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

  function submitRule(draft: { name: string; description: string; trigger: string; conditions: ConditionDraft[]; actions: ActionDraft[] }) {
    if (!draft.name.trim()) {
      toast('Rule name is required');
      return;
    }
    createRule.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        trigger: draft.trigger,
        conditions: { all: draft.conditions.map(draftToCondition) },
        actions: draft.actions.map(draftToAction),
      },
      {
        onSuccess: (created) => {
          toast(`Rule "${created.name}" created ✓`);
          setShowForm(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not create rule'),
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
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setShowForm((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New rule
        </button>
      </div>
      {showForm && <RuleForm onCancel={() => setShowForm(false)} onSubmit={submitRule} isSaving={createRule.isPending} />}
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
