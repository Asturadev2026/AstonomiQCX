import type { RuleAction, RuleConditions } from '@aq/shared';

/** The trigger types this ticket-automations engine understands. Scoping
 * queries to these (rather than "any Rule row") matters because the `Rule`
 * table is also used by Customer Journey's proactive-nudges feature (owned
 * separately) with unrelated trigger types like 'cart_abandoned'. */
export const TICKET_RULE_TRIGGERS = ['ticket.created', 'ticket.moved'];

/** Guide §12.4 defaults — matches the prototype's Automations demo, adapted to
 * the four action types this engine actually implements (setPriority,
 * assignDept, escalate, notify — see agent-builder.md scope note). Every
 * condition here checks a real field (Ticket.category, Ticket.description,
 * Contact.segment); none are fabricated. */
export const DEFAULT_RULES: Array<{
  name: string;
  description: string;
  trigger: string;
  conditions: RuleConditions;
  actions: RuleAction[];
}> = [
  {
    name: 'VIP fast-track',
    description: 'Premium/VIP customers jump the queue',
    trigger: 'ticket.created',
    conditions: { all: [{ field: 'segment', op: 'in', value: ['premium', 'vip'] }] },
    actions: [
      { type: 'setPriority', value: 'p1' },
      { type: 'assignDept', value: 'Escalations Desk' },
    ],
  },
  {
    name: 'Payment failure → P1',
    description: 'Money issues get top priority',
    trigger: 'ticket.created',
    conditions: {
      all: [
        { field: 'category', op: 'eq', value: 'payments' },
        { field: 'text', op: 'contains', value: 'double charge' },
      ],
    },
    actions: [
      { type: 'setPriority', value: 'p1' },
      { type: 'assignDept', value: 'Payments & Refunds' },
      { type: 'notify', target: 'Manager' },
    ],
  },
  {
    name: 'Negative sentiment → escalate',
    description: 'Frustrated customers reach a human fast',
    trigger: 'ticket.created',
    conditions: { all: [{ field: 'sentiment', op: 'eq', value: 'neg' }] },
    actions: [
      { type: 'escalate', level: 1 },
      { type: 'notify', target: 'Manager' },
    ],
  },
  {
    name: 'Technical issue → route',
    description: 'App/website bugs go straight to Tech Support',
    trigger: 'ticket.created',
    conditions: { all: [{ field: 'category', op: 'eq', value: 'technical' }] },
    actions: [{ type: 'assignDept', value: 'Technical Support' }],
  },
];
