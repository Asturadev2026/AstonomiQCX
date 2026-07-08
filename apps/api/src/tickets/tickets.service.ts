import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant, nextRef, type Ticket } from '@aq/db';
import { REF_PREFIXES, type CreateTicketDto, type MoveTicketDto } from '@aq/shared';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { RtGateway } from '../realtime/rt.gateway';
import type { AuthenticatedUser } from '../auth/jwt.guard';
import { priorityFromMatrix } from './priority';

/** The Tickets service — Guide §8.3, the reference pattern every module copies. */
@Injectable()
export class TicketsService {
  private prisma = getPrisma();

  constructor(
    private audit: AuditService,
    private sla: SlaService,
    private rt: RtGateway,
  ) {}

  // userId is nullable for system-raised tickets (e.g. Astra escalating a chat — Guide §10.4).
  async create(tenantId: string, userId: string | null, dto: CreateTicketDto): Promise<Ticket> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const extRef = await nextRef(tx, tenantId, REF_PREFIXES.ticket);

      let segment: string | null = null;
      if (dto.contactId) {
        segment = (await tx.contact.findUnique({ where: { id: dto.contactId }, select: { segment: true } }))
          ?.segment ?? null;
      }
      const priority = dto.priority ?? priorityFromMatrix({ text: dto.subject, segment });

      const ticket = await tx.ticket.create({
        data: {
          tenantId,
          extRef,
          subject: dto.subject,
          description: dto.description,
          contactId: dto.contactId,
          priority,
          category: dto.category,
          departmentId: dto.departmentId,
          status: 'new',
        },
      });

      await this.sla.startTimers(tx, tenantId, ticket);
      await this.audit.log(tx, tenantId, userId, 'ticket.create', 'ticket', { id: ticket.id });
      this.rt.emitToTenant(tenantId, 'ticket.created', ticket);
      return ticket;
    });
  }

  async move(tenantId: string, userId: string, id: string, dto: MoveTicketDto): Promise<Ticket> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Ticket ${id} not found`);

      const ticket = await tx.ticket.update({ where: { id }, data: { status: dto.status } });

      if (dto.status === 'resolved') {
        await this.sla.markResolved(tx, tenantId, id);
      }
      await this.audit.log(tx, tenantId, userId, 'ticket.move', 'ticket', { id, status: dto.status });
      this.rt.emitToTenant(tenantId, 'ticket.updated', ticket);
      return ticket;
    });
  }

  // 'ticket.view.all' sees everything; 'ticket.view.assigned' sees only their own —
  // this scoping is a business rule, so it lives here rather than in the guard.
  private viewScope(user: AuthenticatedUser): { assignedUserId?: string } {
    if (user.permissions.includes('*') || user.permissions.includes('ticket.view.all')) return {};
    if (user.permissions.includes('ticket.view.assigned')) return { assignedUserId: user.id };
    throw new ForbiddenException('You do not have permission for this');
  }

  list(tenantId: string, user: AuthenticatedUser): Promise<Ticket[]> {
    const scope = this.viewScope(user);
    return withTenant(this.prisma, tenantId, (tx) =>
      tx.ticket.findMany({ where: scope, orderBy: { createdAt: 'desc' } }),
    );
  }

  async getOne(tenantId: string, id: string, user: AuthenticatedUser): Promise<Ticket> {
    const scope = this.viewScope(user);
    return withTenant(this.prisma, tenantId, async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id, ...scope } });
      if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
      return ticket;
    });
  }
}
