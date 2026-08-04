import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import { TicketsService } from '../tickets/tickets.service';

export interface PublicOrderStatus {
  extRef: string;
  description: string | null;
  qty: number;
  amount: number | null;
  status: string | null;
  createdAt: string;
}

export interface ReturnRequestResult {
  ticketExtRef: string | null;
}

/** Public order lookup for the Self-Service Portal — no login, matches by the
 * customer-facing extRef (e.g. "ZK-483920"), not the internal id. */
@Injectable()
export class OrdersService {
  private prisma = getPrisma();

  constructor(private tickets: TicketsService) {}

  async findByRef(tenantId: string, extRef: string): Promise<PublicOrderStatus> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { extRef } });
      if (!order) throw new NotFoundException(`Order ${extRef} not found`);
      return {
        extRef: order.extRef ?? extRef,
        description: order.description,
        qty: order.qty ?? 1,
        amount: order.amount ? Number(order.amount) : null,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
      };
    });
  }

  /** Raises a real support ticket for the return — same engine (rules, SLA
   * timers, audit log) as any agent-created ticket, just with no authenticated
   * user (Guide's pattern for system/customer-raised tickets, see Ticket.create). */
  async requestReturn(tenantId: string, extRef: string, reason: string): Promise<ReturnRequestResult> {
    const order = await withTenant(this.prisma, tenantId, (tx) => tx.order.findFirst({ where: { extRef } }));
    if (!order) throw new NotFoundException(`Order ${extRef} not found`);

    const ticket = await this.tickets.create(tenantId, null, {
      subject: `Return / refund — ${order.description ?? order.extRef ?? extRef}`,
      description: reason,
      contactId: order.contactId ?? undefined,
      category: 'returns',
    });
    return { ticketExtRef: ticket.extRef };
  }
}
