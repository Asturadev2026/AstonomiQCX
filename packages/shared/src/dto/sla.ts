/** Guide §11 — SLA policies, live timers, scorecards, and the escalation matrix. */

export interface SlaPolicyDto {
  id: string;
  name: string;
  priority: string | null;
  channel: string | null;
  segment: string | null;
  departmentName: string | null;
  firstResponseMins: number;
  resolutionMins: number;
}

export interface SlaKpis {
  compliancePct: number | null;
  atRiskCount: number;
  breachedTodayCount: number;
  avgResolutionMins: number | null;
}

export interface SlaScorecardRow {
  key: string;
  name: string;
  initials: string;
  color: string;
  assigned: number;
  met: number;
  breached: number;
  atRisk: number;
  adherencePct: number;
}

export interface SlaBreachRow {
  ticketExtRef: string;
  customerName: string | null;
  priority: string;
  departmentName: string | null;
  assigneeName: string | null;
  assigneeInitials: string | null;
  assigneeColor: string | null;
  secondsLeft: number;
  status: 'breach' | 'warn' | 'ok';
}

export interface EscalationLevelDto {
  level: number;
  who: string;
  role: string;
  timing: string;
}
