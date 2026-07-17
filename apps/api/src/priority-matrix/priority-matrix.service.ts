import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type SlaPolicy } from '@aq/db';
import type { PriorityLevelInfoDto, PriorityMatrixCellDto, PriorityMatrixDto } from '@aq/shared';
import { HIGH_IMPACT_KEYWORDS, HIGH_URGENCY_KEYWORDS, MATRIX, MEDIUM_URGENCY_KEYWORDS, type Level } from '../tickets/priority';

const URGENCY_LEVELS: Level[] = ['high', 'medium', 'low'];
const IMPACT_LEVELS: Level[] = ['low', 'medium', 'high'];

function formatMins(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const LEVEL_INFO: Omit<PriorityLevelInfoDto, 'keywords'>[] = [
  { priority: 'p1', label: 'Critical', description: 'Payment failures, account lockouts, outages. Auto-escalates through the escalation matrix.' },
  { priority: 'p2', label: 'High', description: 'Wrong item, delayed order, refund stuck — also where a high-urgency issue has low impact, or a medium-urgency issue has high impact.' },
  { priority: 'p3', label: 'Medium', description: 'How-to questions, return requests, general queries — the default when nothing urgent is detected.' },
  { priority: 'p4', label: 'Low', description: 'Feedback, feature requests — low urgency with no VIP or scale signal.' },
];

/**
 * Real Priority Matrix — Guide §8.3. Renders the exact same `MATRIX` and
 * keyword lists `apps/api/src/tickets/priority.ts` uses to classify real
 * tickets, so this reference screen can never drift from what the system
 * actually does. Resolution times come from the tenant's real SlaPolicy rows
 * (same "first by id" tie-break as SlaService.startTimers, so what's shown
 * here matches what would actually apply to a new ticket).
 */
@Injectable()
export class PriorityMatrixService {
  private prisma = getPrisma();

  async matrix(tenantId: string): Promise<PriorityMatrixDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const policies = await tx.slaPolicy.findMany({ orderBy: { id: 'asc' } });
      const policyForPriority = new Map<string, SlaPolicy>();
      for (const p of policies) {
        if (p.priority && !policyForPriority.has(p.priority)) policyForPriority.set(p.priority, p);
      }

      const cells: PriorityMatrixCellDto[] = [];
      for (const urgency of URGENCY_LEVELS) {
        for (const impact of IMPACT_LEVELS) {
          const priority = MATRIX[urgency][impact];
          const policy = policyForPriority.get(priority);
          cells.push({ urgency, impact, priority, resolutionLabel: policy ? formatMins(policy.resolutionMins) : '—' });
        }
      }

      const keywordsByPriority: Record<string, string[]> = {
        p1: HIGH_URGENCY_KEYWORDS,
        p2: MEDIUM_URGENCY_KEYWORDS,
        p3: [],
        p4: [],
      };
      const levels: PriorityLevelInfoDto[] = LEVEL_INFO.map((l) => ({ ...l, keywords: keywordsByPriority[l.priority] ?? [] }));

      return {
        cells,
        levels,
        impactKeywords: HIGH_IMPACT_KEYWORDS,
        vipBumpNote: 'Premium/VIP customers get bumped one priority level up (unless already P1).',
      };
    });
  }
}
