/** Guide's module tour — "Workforce management": live agent status, roster, adherence. */
import type { AgentStatus } from '../constants';

export interface WorkforceStatusCounts {
  available: number;
  on_call: number;
  on_break: number;
  offline: number;
}

export interface WorkforcePersonDto {
  id: string;
  name: string;
  initials: string;
  color: string;
  title: string | null;
  status: AgentStatus;
}

export interface WorkforceBoardDto {
  statusCounts: WorkforceStatusCounts;
  people: WorkforcePersonDto[];
}

export interface RosterRowDto {
  userId: string;
  name: string;
  departmentName: string | null;
  shiftName: string;
  loginTime: string | null;
  status: AgentStatus;
}

export interface WorkforceRosterDto {
  adherencePct: number | null;
  rows: RosterRowDto[];
}
