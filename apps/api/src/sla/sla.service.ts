import { Injectable } from '@nestjs/common';
import type { Tx, Ticket } from '@aq/db';

/**
 * Starts/resolves the SLA clock for a ticket (Guide §8.3/§11).
 * This covers the two moments Tickets needs today: timers start on create,
 * and get marked met on resolve. The full engine — business-hours-aware due
 * dates, the once-a-minute breach sweep, and escalation levels — is Part 11
 * and needs apps/workers (not built yet); for now due dates are plain clock
 * time from firstResponseMins/resolutionMins.
 */
@Injectable()
export class SlaService {
  async startTimers(tx: Tx, tenantId: string, ticket: Ticket) {
    const policy = await tx.slaPolicy.findFirst({
      where: { tenantId, priority: ticket.priority },
      orderBy: { id: 'asc' },
    });
    if (!policy) return; // no SLA policy configured for this priority yet — nothing to start

    const now = Date.now();
    await tx.ticket.update({ where: { id: ticket.id }, data: { slaPolicyId: policy.id } });
    await tx.slaEvent.createMany({
      data: [
        {
          tenantId,
          ticketId: ticket.id,
          kind: 'first_response',
          targetAt: new Date(now + policy.firstResponseMins * 60_000),
        },
        {
          tenantId,
          ticketId: ticket.id,
          kind: 'resolution',
          targetAt: new Date(now + policy.resolutionMins * 60_000),
        },
      ],
    });
  }

  async markResolved(tx: Tx, _tenantId: string, ticketId: string) {
    const openEvent = await tx.slaEvent.findFirst({
      where: { ticketId, kind: 'resolution', metAt: null },
    });
    if (!openEvent) return;

    const now = new Date();
    await tx.slaEvent.update({
      where: { id: openEvent.id },
      data: { metAt: now, breached: now > openEvent.targetAt },
    });
  }
}
