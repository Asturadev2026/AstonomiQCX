import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface QaKpis {
  autoAuditedPct: number;
  avgScore: number;
  csatDeltaPct: number;
  flaggedCount: number;
}
export interface QaAuditRow {
  agentLabel: string;
  customerName: string;
  score: number;
  scoreClass: 'qa-hi' | 'qa-mid' | 'qa-lo';
  category: string;
  empathy: string;
  resolution: string;
}
export interface LeaderboardEntry {
  rank: number;
  name: string;
  initials: string;
  avatarColor: string;
  title: string;
  resolvedCount: number;
  avgScore: number;
}
export interface IntentBar {
  label: string;
  pct: number;
  color: string;
}
export interface QaPayload {
  kpis: QaKpis;
  recentAudits: QaAuditRow[];
  leaderboard: LeaderboardEntry[];
  intents: IntentBar[];
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  chat: 'Chat',
  voice: 'Voice',
  email: 'Email',
  instagram: 'Instagram',
};
const INTENT_META: Record<string, { label: string; color: string }> = {
  order_tracking: { label: 'Order tracking', color: '#2563EB' },
  refund: { label: 'Refunds & returns', color: '#0EA5E9' },
  delivery_delay: { label: 'Delivery delay', color: '#E08A00' },
  product_enquiry: { label: 'Product enquiry', color: '#16A34A' },
  emi_payment: { label: 'EMI & payment', color: '#DB2777' },
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function avg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function scoreClass(score: number): QaAuditRow['scoreClass'] {
  if (score >= 90) return 'qa-hi';
  if (score >= 75) return 'qa-mid';
  return 'qa-lo';
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

@Injectable()
export class QaService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<QaPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const [resolvedConvCount, auditedCount, flaggedCount, scoreRows, csatRows, recent, agents, intentGroups] = await Promise.all([
        tx.conversation.count({ where: { status: 'resolved' } }),
        tx.qaAudit.count(),
        tx.qaAudit.count({ where: { flagged: true } }),
        tx.qaAudit.findMany({ select: { score: true } }),
        tx.survey.findMany({ where: { type: 'csat' }, select: { score: true, createdAt: true } }),
        tx.qaAudit.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { agentUser: { select: { name: true } }, contact: { select: { name: true } } },
        }),
        tx.user.findMany({ where: { title: { not: 'Team Lead' } } }),
        tx.conversation.groupBy({ by: ['intent'], where: { intent: { not: null } }, _count: { intent: true } }),
      ]);

      const avgScore = avg(scoreRows.map((r) => r.score ?? 0));

      const csatCurrent = csatRows.filter((r) => now.getTime() - r.createdAt.getTime() <= 30 * MS_PER_DAY);
      const csatPrev = csatRows.filter((r) => {
        const ageDays = (now.getTime() - r.createdAt.getTime()) / MS_PER_DAY;
        return ageDays > 30 && ageDays <= 60;
      });
      const csatCurrentAvg = avg(csatCurrent.map((r) => Number(r.score ?? 0)));
      const csatPrevAvg = avg(csatPrev.map((r) => Number(r.score ?? 0)));
      const csatDeltaPct = csatPrevAvg ? Math.round(((csatCurrentAvg - csatPrevAvg) / csatPrevAvg) * 100) : 0;

      const recentAudits: QaAuditRow[] = recent.map((r) => {
        const breakdown = (r.breakdown ?? {}) as { category?: string; empathy?: string; resolution?: string; channel?: string };
        const agentLabel = r.agentUser?.name ?? `Astra AI · ${CHANNEL_LABELS[breakdown.channel ?? ''] ?? 'Bot'}`;
        return {
          agentLabel,
          customerName: r.contact?.name ?? 'Unknown customer',
          score: r.score ?? 0,
          scoreClass: scoreClass(r.score ?? 0),
          category: breakdown.category ?? 'General',
          empathy: breakdown.empathy ?? '—',
          resolution: breakdown.resolution ?? '—',
        };
      });

      const leaderboardRaw = await Promise.all(
        agents.map(async (agent) => {
          const [resolvedCount, agentScores] = await Promise.all([
            tx.conversation.count({ where: { assignedUserId: agent.id, status: 'resolved' } }),
            tx.qaAudit.findMany({ where: { agentUserId: agent.id }, select: { score: true } }),
          ]);
          return {
            name: agent.name,
            initials: initials(agent.name),
            avatarColor: agent.avatarColor ?? '#2563EB',
            title: agent.title ?? '',
            resolvedCount,
            avgScore: avg(agentScores.map((s) => s.score ?? 0)),
          };
        }),
      );
      const leaderboard: LeaderboardEntry[] = leaderboardRaw
        .sort((a, b) => b.resolvedCount - a.resolvedCount)
        .map((l, i) => ({ rank: i + 1, ...l }));

      const totalIntents = intentGroups.reduce((sum, g) => sum + g._count.intent, 0);
      const intents: IntentBar[] = intentGroups
        .map((g) => {
          const meta = INTENT_META[g.intent as string] ?? { label: g.intent as string, color: '#94A3B8' };
          return { label: meta.label, color: meta.color, pct: totalIntents ? Math.round((g._count.intent / totalIntents) * 100) : 0 };
        })
        .sort((a, b) => b.pct - a.pct);

      return {
        kpis: {
          autoAuditedPct: resolvedConvCount ? Math.round((auditedCount / resolvedConvCount) * 100) : 0,
          avgScore,
          csatDeltaPct,
          flaggedCount,
        },
        recentAudits,
        leaderboard,
        intents,
      };
    });
  }
}
