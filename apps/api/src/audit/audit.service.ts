import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type Tx } from '@aq/db';
import type { AuditLogRow } from '@aq/shared';

// Icon/color per Action — keyed by the same action strings passed to log() across
// the codebase (tickets.service.ts today; more call sites land as features wire in).
const ACTION_META: Record<string, { icon: string; color: string }> = {
  'ticket.create': { icon: '🎫', color: '#DB2777' },
  'ticket.move': { icon: '🔀', color: '#2563EB' },
};
const DEFAULT_META = { icon: '📝', color: '#94A3B8' };

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  waiting: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

function relativeTime(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function describe(
  action: string,
  entity: string,
  details: unknown,
  ticket?: { extRef: string | null; subject: string },
): string {
  const ref = ticket?.extRef ?? (details as { id?: string } | null)?.id ?? '';
  switch (action) {
    case 'ticket.create':
      return `created ticket ${ref}${ticket ? ` — "${ticket.subject}"` : ''}`;
    case 'ticket.move': {
      const status = (details as { status?: string } | null)?.status;
      return `moved ticket ${ref} to ${status ? (STATUS_LABEL[status] ?? status) : 'a new stage'}`;
    }
    default:
      return `performed ${action || 'an action'} on ${entity || 'the system'}`;
  }
}

/**
 * Records one action, e.g. log(tx, tenantId, userId, 'ticket.create', 'ticket', { id }).
 * Takes the caller's already-open tx (Guide §8.3 pattern) rather than opening
 * its own — callers always invoke this from inside their own withTenant(),
 * and a second nested transaction on the same pool connection deadlocks.
 */
@Injectable()
export class AuditService {
  private prisma = getPrisma();

  async log(
    tx: Tx,
    tenantId: string,
    userId: string | null,
    action: string,
    entity: string,
    details: unknown = {},
  ) {
    await tx.auditLog.create({
      data: { tenantId, userId, action, entity, details: details as object },
    });
  }

  async getRecent(tenantId: string): Promise<AuditLogRow[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const rows = await tx.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // AuditLog.userId/details are loose (no FK relation, no typed entity link — Guide
      // §5 keeps this table schema-agnostic across every action any module might log),
      // so actor names and ticket refs are resolved with a couple of batched lookups.
      const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
      const users = userIds.length
        ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];
      const userById = new Map(users.map((u) => [u.id, u.name]));

      const ticketIds = [
        ...new Set(
          rows
            .filter((r) => r.entity === 'ticket')
            .map((r) => (r.details as { id?: string } | null)?.id)
            .filter((id): id is string => !!id),
        ),
      ];
      const tickets = ticketIds.length
        ? await tx.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, extRef: true, subject: true } })
        : [];
      const ticketById = new Map(tickets.map((t) => [t.id, t]));

      return rows.map((r) => {
        const meta = ACTION_META[r.action ?? ''] ?? DEFAULT_META;
        const ticketId = (r.details as { id?: string } | null)?.id;
        const ticket = ticketId ? ticketById.get(ticketId) : undefined;
        return {
          id: r.id,
          icon: meta.icon,
          color: meta.color,
          actorName: r.userId ? (userById.get(r.userId) ?? 'Unknown user') : 'System',
          message: describe(r.action ?? '', r.entity ?? '', r.details, ticket),
          time: relativeTime(r.createdAt, now),
        };
      });
    });
  }
}
