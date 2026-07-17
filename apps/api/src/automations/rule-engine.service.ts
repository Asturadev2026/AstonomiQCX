import { Injectable, Logger } from '@nestjs/common';
import type { Tx, Ticket, Rule } from '@aq/db';
import type { RuleAction, RuleCondition, RuleConditions } from '@aq/shared';

export interface TicketCreatedEvent {
  text: string;
  category: string | null;
  priority: string;
  status: string;
  segment: string | null;
  channel: string | null;
  sentiment: string | null;
  language: string | null;
}

function readField(event: TicketCreatedEvent, field: string): unknown {
  return (event as unknown as Record<string, unknown>)[field];
}

function checkOne(c: RuleCondition, event: TicketCreatedEvent): boolean {
  const actual = readField(event, c.field);
  switch (c.op) {
    case 'eq':
      return actual === c.value;
    case 'ne':
      return actual !== c.value;
    case 'in':
      return Array.isArray(c.value) && c.value.includes(actual);
    case 'nin':
      return Array.isArray(c.value) && !c.value.includes(actual);
    case 'contains':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(c.value).toLowerCase());
    case 'gt':
      return Number(actual) > Number(c.value);
    case 'lt':
      return Number(actual) < Number(c.value);
    default:
      return false;
  }
}

function matchConditions(conditions: RuleConditions | null, event: TicketCreatedEvent): boolean {
  if (!conditions) return true;
  const list = conditions.all ?? conditions.any ?? [];
  if (list.length === 0) return true;
  const results = list.map((c) => checkOne(c, event));
  return conditions.any ? results.some(Boolean) : results.every(Boolean);
}

/**
 * The rule engine — Guide §12.3. Runs in-process (no apps/workers/Redis job
 * queue — same "no new deployable service yet" call as the WhatsApp gateway)
 * right when `ticket.created` actually happens, inside the caller's already-
 * open transaction (never opens its own — Guide's nested-transaction lesson
 * from Part 8's AuditService bug).
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  async runForTicketCreated(tx: Tx, tenantId: string, ticket: Ticket, event: TicketCreatedEvent): Promise<Ticket> {
    const rules = await tx.rule.findMany({ where: { tenantId, trigger: 'ticket.created', enabled: true } });
    let current = ticket;

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as RuleConditions | null;
      if (!matchConditions(conditions, event)) continue;

      const actions = (rule.actions as unknown as RuleAction[] | null) ?? [];
      for (const action of actions) {
        current = await this.applyAction(tx, tenantId, current, rule, action);
      }
      await tx.rule.update({ where: { id: rule.id }, data: { runs: { increment: 1 } } });
    }
    return current;
  }

  private async applyAction(tx: Tx, tenantId: string, ticket: Ticket, rule: Rule, action: RuleAction): Promise<Ticket> {
    switch (action.type) {
      case 'setPriority':
        if (!action.value) return ticket;
        return tx.ticket.update({ where: { id: ticket.id }, data: { priority: action.value } });

      case 'assignDept': {
        if (!action.value) return ticket;
        const dept = await tx.department.findFirst({ where: { tenantId, name: action.value } });
        if (!dept) {
          this.logger.warn(`Rule "${rule.name}": department "${action.value}" not found — skipping assignDept`);
          return ticket;
        }
        return tx.ticket.update({ where: { id: ticket.id }, data: { departmentId: dept.id } });
      }

      case 'escalate':
        await tx.escalation.create({
          data: { tenantId, ticketId: ticket.id, level: action.level ?? 1, reason: `Rule: ${rule.name}` },
        });
        return ticket;

      case 'notify': {
        if (!action.target) return ticket;
        const role = await tx.role.findFirst({ where: { tenantId, name: action.target } });
        if (!role) {
          this.logger.warn(`Rule "${rule.name}": role "${action.target}" not found — skipping notify`);
          return ticket;
        }
        const users = await tx.user.findMany({ where: { tenantId, roleId: role.id } });
        if (users.length === 0) {
          this.logger.warn(`Rule "${rule.name}": no users have the "${action.target}" role — skipping notify`);
          return ticket;
        }
        await tx.notification.createMany({
          data: users.map((u) => ({
            tenantId,
            userId: u.id,
            kind: 'rule.notify',
            body: `Rule "${rule.name}" fired on ticket ${ticket.extRef}`,
            entity: 'ticket',
            entityId: ticket.id,
          })),
        });
        return ticket;
      }

      default:
        return ticket;
    }
  }
}
