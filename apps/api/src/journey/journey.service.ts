import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface JourneyStage {
  name: string;
  icon: string;
  color: string;
  description: string;
  metrics: { label: string; value: string }[];
}
export interface FrictionPoint {
  label: string;
  pct: number;
  color: string;
}
export interface ProactiveNudge {
  trigger: string;
  status: 'live' | 'draft';
}
export interface JourneyPayload {
  stages: JourneyStage[];
  friction: FrictionPoint[];
  nudges: ProactiveNudge[];
}

const FRICTION_COLORS = ['var(--red)', 'var(--amber)', 'var(--sky)', 'var(--pink)', 'var(--indigo)'];

const RESOLVED_STATUSES = ['resolved', 'closed'];

function pct(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function avgScore(scores: { score: unknown }[]): string {
  if (!scores.length) return '—';
  const total = scores.reduce((sum, s) => sum + Number(s.score ?? 0), 0);
  return (total / scores.length).toFixed(1);
}

@Injectable()
export class JourneyService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<JourneyPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const [
        totalContacts,
        orders,
        resolvedTickets,
        csatSupport,
        csatOnboarding,
        npsScores,
        ticketsByCategory,
        rules,
      ] = await Promise.all([
        tx.contact.count(),
        tx.order.findMany({ select: { contactId: true } }),
        tx.ticket.findMany({ where: { status: { in: RESOLVED_STATUSES } }, select: { id: true } }),
        tx.survey.findMany({ where: { type: 'csat', ticketId: { not: null } }, select: { score: true } }),
        tx.survey.findMany({ where: { type: 'csat', ticketId: null }, select: { score: true } }),
        tx.survey.findMany({ where: { type: 'nps' }, select: { score: true } }),
        tx.ticket.groupBy({ by: ['category'], where: { category: { not: null } }, _count: { category: true } }),
        tx.rule.findMany({ orderBy: { name: 'asc' } }),
      ]);

      const ordersByContact = new Map<string, number>();
      for (const o of orders) {
        if (!o.contactId) continue;
        ordersByContact.set(o.contactId, (ordersByContact.get(o.contactId) ?? 0) + 1);
      }
      const conversionPct = pct(ordersByContact.size, totalContacts);
      const repeatPct = pct([...ordersByContact.values()].filter((n) => n > 1).length, totalContacts);

      const resolvedIds = resolvedTickets.map((t) => t.id);
      const escalatedTickets = resolvedIds.length
        ? await tx.escalation.findMany({
            where: { ticketId: { in: resolvedIds } },
            select: { ticketId: true },
            distinct: ['ticketId'],
          })
        : [];
      const fcrPct = pct(resolvedIds.length - escalatedTickets.length, resolvedIds.length);

      const promoters = npsScores.filter((s) => Number(s.score) >= 9).length;
      const detractors = npsScores.filter((s) => Number(s.score) <= 6).length;
      const nps = npsScores.length ? Math.round(((promoters - detractors) / npsScores.length) * 100) : 0;
      const npsLabel = npsScores.length ? (nps >= 0 ? `+${nps}` : `${nps}`) : '—';

      const totalCategorized = ticketsByCategory.reduce((sum, c) => sum + c._count.category, 0);
      const friction: FrictionPoint[] = ticketsByCategory
        .sort((a, b) => b._count.category - a._count.category)
        .slice(0, 5)
        .map((c, i) => ({
          label: c.category as string,
          pct: pct(c._count.category, totalCategorized),
          color: FRICTION_COLORS[i] ?? 'var(--slate)',
        }));

      const nudges: ProactiveNudge[] = rules.map((r) => ({
        trigger: r.name ?? r.trigger ?? 'Untitled rule',
        status: r.enabled ? 'live' : 'draft',
      }));

      return {
        stages: [
          {
            name: 'Awareness',
            icon: '📣',
            color: '#8B7CFF',
            description: 'First touch — ads, social, Click-to-WhatsApp',
            // Reach/CTR need ad-impression tracking, which has no table yet — left unset intentionally.
            metrics: [
              { label: 'Reach', value: '—' },
              { label: 'CTR', value: '—' },
            ],
          },
          {
            name: 'Purchase',
            icon: '🛒',
            color: '#2563EB',
            description: 'Browse, cart, checkout & payment',
            metrics: [
              { label: 'Conversion', value: `${conversionPct}%` },
              // Cart drop needs a cart/checkout-funnel table, which doesn't exist yet.
              { label: 'Cart drop', value: '—' },
            ],
          },
          {
            name: 'Onboarding',
            icon: '📦',
            color: '#0EA5E9',
            description: 'Order confirmed, shipped, delivered',
            metrics: [
              // On-time needs an expected-vs-actual delivery timestamp on Order, which doesn't exist yet.
              { label: 'On-time', value: '—' },
              { label: 'CSAT', value: avgScore(csatOnboarding) },
            ],
          },
          {
            name: 'Support',
            icon: '🎧',
            color: '#16A34A',
            description: 'Queries, returns, refunds, help',
            metrics: [
              { label: 'FCR', value: `${fcrPct}%` },
              { label: 'CSAT', value: avgScore(csatSupport) },
            ],
          },
          {
            name: 'Retention',
            icon: '💜',
            color: '#DB2777',
            description: 'Loyalty, win-back, referrals',
            metrics: [
              { label: 'Repeat', value: `${repeatPct}%` },
              { label: 'NPS', value: npsLabel },
            ],
          },
        ],
        friction,
        nudges,
      };
    });
  }
}
