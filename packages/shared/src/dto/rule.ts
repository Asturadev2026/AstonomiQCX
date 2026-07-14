/** Guide §12 — automations: trigger → conditions → actions, run automatically on real events. */

export type RuleConditionOp = 'eq' | 'ne' | 'in' | 'nin' | 'contains' | 'gt' | 'lt';

export interface RuleCondition {
  field: string; // segment | channel | text | sentiment | priority | category | department | language | status
  op: RuleConditionOp;
  value: unknown;
}

export interface RuleConditions {
  all?: RuleCondition[];
  any?: RuleCondition[];
}

export type RuleActionType = 'setPriority' | 'assignDept' | 'escalate' | 'notify';

export interface RuleAction {
  type: RuleActionType;
  value?: string; // setPriority: p1-p4; assignDept: department name
  level?: number; // escalate: level (defaults to 1)
  target?: string; // notify: role name, e.g. 'Manager'
}

export interface RuleDto {
  id: string;
  name: string | null;
  description: string | null;
  enabled: boolean;
  trigger: string | null;
  conditions: RuleConditions | null;
  actions: RuleAction[] | null;
  runs: number;
}
