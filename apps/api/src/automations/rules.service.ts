import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant, type Rule } from '@aq/db';
import type { RuleAction, RuleConditions, RuleDto } from '@aq/shared';
import { DEFAULT_RULES, TICKET_RULE_TRIGGERS } from './default-rules';

function toDto(rule: Rule): RuleDto {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    trigger: rule.trigger,
    conditions: rule.conditions as unknown as RuleConditions | null,
    actions: rule.actions as unknown as RuleAction[] | null,
    runs: rule.runs,
  };
}

/** Real persistence for automation rules — Guide §12.2. */
@Injectable()
export class RulesService {
  private prisma = getPrisma();

  /** Auto-seeds the Guide §12.4 default rules the first time a tenant has none.
   * Scoped to ticket-automation trigger types only — the `Rule` table is
   * shared with Customer Journey's proactive-nudges feature, which has its
   * own unrelated rows (e.g. trigger: 'cart_abandoned'); those are not ours
   * to list, seed around, or toggle here. */
  async list(tenantId: string): Promise<RuleDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.rule.findMany({
        where: { trigger: { in: TICKET_RULE_TRIGGERS } },
        orderBy: { id: 'asc' },
      });
      if (existing.length > 0) return existing.map(toDto);

      const created = await Promise.all(
        DEFAULT_RULES.map((r) =>
          tx.rule.create({
            data: {
              tenantId,
              name: r.name,
              description: r.description,
              enabled: true,
              trigger: r.trigger,
              conditions: r.conditions as object,
              actions: r.actions as unknown as object,
            },
          }),
        ),
      );
      return created.map(toDto);
    });
  }

  async toggle(tenantId: string, id: string): Promise<RuleDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const rule = await tx.rule.findUnique({ where: { id } });
      // Also guards against ever toggling a Journey proactive-nudge row that
      // happens to share this table — see the scoping note on list() above.
      if (!rule || !TICKET_RULE_TRIGGERS.includes(rule.trigger ?? '')) {
        throw new NotFoundException(`Rule ${id} not found`);
      }
      const updated = await tx.rule.update({ where: { id }, data: { enabled: !rule.enabled } });
      return toDto(updated);
    });
  }
}
