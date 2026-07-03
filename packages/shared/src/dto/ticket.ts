import type { Priority, TicketStatus } from '../constants';

/** Guide §10 — the worked example every module copies. */

export interface CreateTicketDto {
  subject: string;
  description?: string;
  contactId?: string;
  priority?: Priority;
  category?: string;
  departmentId?: string;
}

export interface MoveTicketDto {
  status: TicketStatus;
}

export interface AssignTicketDto {
  assignedUserId: string;
}

export interface TicketDto {
  id: string;
  extRef: string | null;
  subject: string;
  description: string | null;
  priority: Priority;
  category: string | null;
  status: TicketStatus;
  contactId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  departmentId: string | null;
  slaPolicyId: string | null;
  createdAt: string;
  updatedAt: string;
}
