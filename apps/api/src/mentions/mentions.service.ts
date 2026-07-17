import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import { TicketsService } from '../tickets/tickets.service';

export interface ConvHubKpis {
  mentionsThisWeek: number;
  autoRepliedPct: number;
  escalatedCount: number;
  ticketsCreatedCount: number;
}

export interface MentionCard {
  id: string;
  source: string;
  authorName: string;
  authorHandle: string | null;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  time: string;
  tough: boolean;
  body: string;
  tags: string[];
  botReply: string | null;
  stage: 'detected' | 'bot_replied' | 'escalated' | 'ticket';
  ticketRef: string | null;
}

export interface ConvHubPayload {
  kpis: ConvHubKpis;
  mentions: MentionCard[];
}

// Filter groups behind the Conversation Hub source buttons — "Meta" lumps its three
// channels together, same as the prototype's platMeta groupings.
const GROUP_SOURCES: Record<string, string[]> = {
  Meta: ['facebook', 'instagram', 'whatsapp'],
  LinkedIn: ['linkedin'],
  Google: ['google'],
  X: ['x'],
};
const STAGE_ORDER = ['detected', 'bot_replied', 'escalated', 'ticket'] as const;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function relativeTime(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function toCard(m: {
  id: string;
  source: string;
  authorName: string | null;
  authorHandle: string | null;
  sentiment: string | null;
  createdAt: Date;
  tough: boolean;
  body: string;
  tags: unknown;
  botReply: string | null;
  stage: string;
  ticket: { extRef: string | null } | null;
}, now: Date): MentionCard {
  return {
    id: m.id,
    source: m.source,
    authorName: m.authorName ?? 'Unknown',
    authorHandle: m.authorHandle,
    sentiment: m.sentiment as MentionCard['sentiment'],
    time: relativeTime(m.createdAt, now),
    tough: m.tough,
    body: m.body,
    tags: Array.isArray(m.tags) ? (m.tags as string[]) : [],
    botReply: m.botReply,
    stage: m.stage as MentionCard['stage'],
    ticketRef: m.ticket?.extRef ?? null,
  };
}

@Injectable()
export class MentionsService {
  private prisma = getPrisma();

  constructor(private tickets: TicketsService) {}

  async getSummary(tenantId: string, group?: string): Promise<ConvHubPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const since7d = new Date(now.getTime() - MS_PER_WEEK);
      const sourceFilter = group && GROUP_SOURCES[group] ? { source: { in: GROUP_SOURCES[group] } } : {};

      const [mentionsThisWeek, all, filtered] = await Promise.all([
        tx.socialMention.count({ where: { createdAt: { gte: since7d } } }),
        tx.socialMention.findMany({ select: { botReply: true, stage: true } }),
        tx.socialMention.findMany({
          where: sourceFilter,
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { ticket: { select: { extRef: true } } },
        }),
      ]);

      const autoRepliedPct = all.length ? Math.round((all.filter((m) => m.botReply).length / all.length) * 100) : 0;
      const escalatedCount = all.filter((m) => m.stage === 'escalated' || m.stage === 'ticket').length;
      const ticketsCreatedCount = all.filter((m) => m.stage === 'ticket').length;

      return {
        kpis: { mentionsThisWeek, autoRepliedPct, escalatedCount, ticketsCreatedCount },
        mentions: filtered.map((m) => toCard(m, now)),
      };
    });
  }

  private async getOne(tenantId: string, id: string) {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const mention = await tx.socialMention.findUnique({ where: { id }, include: { ticket: { select: { extRef: true } } } });
      if (!mention) throw new NotFoundException(`Mention ${id} not found`);
      return mention;
    });
  }

  async escalate(tenantId: string, id: string): Promise<MentionCard> {
    const existing = await this.getOne(tenantId, id);
    const targetIndex = Math.max(STAGE_ORDER.indexOf(existing.stage as (typeof STAGE_ORDER)[number]), STAGE_ORDER.indexOf('escalated'));
    return withTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.socialMention.update({
        where: { id },
        data: { stage: STAGE_ORDER[targetIndex] },
        include: { ticket: { select: { extRef: true } } },
      });
      return toCard(updated, new Date());
    });
  }

  async createTicket(tenantId: string, id: string): Promise<MentionCard> {
    const existing = await this.getOne(tenantId, id);
    if (existing.stage === 'ticket' && existing.ticket) {
      return toCard(existing, new Date());
    }

    // Delegates to the Tickets pattern's own service rather than duplicating ref
    // generation/SLA-timer wiring here — same approach as ai.service.ts's escalation.
    const ticket = await this.tickets.create(tenantId, null, {
      subject: existing.body.replace(/"/g, '').slice(0, 60),
      description: existing.body,
      category: 'social_escalation',
      priority: existing.tough ? 'p2' : 'p3',
    });

    return withTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.socialMention.update({
        where: { id },
        data: { stage: 'ticket', ticketId: ticket.id },
        include: { ticket: { select: { extRef: true } } },
      });
      return toCard(updated, new Date());
    });
  }
}
