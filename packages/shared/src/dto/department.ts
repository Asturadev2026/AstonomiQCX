/** Guide's module tour — "Departments & team hierarchy": head, executives, live status, open load. */
import type { AgentStatus } from '../constants';

export interface DepartmentExecDto {
  id: string;
  name: string;
  initials: string;
  color: string;
  title: string | null;
  status: AgentStatus;
  isHead: boolean;
}

export interface DepartmentCardDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  headName: string | null;
  openTicketCount: number;
  execs: DepartmentExecDto[];
}
