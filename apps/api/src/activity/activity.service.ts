import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface FeedItem {
  icon: string;
  iconClass: string;
  html: string;
  tag: 'res' | 'esc' | 'ai';
  time: string;
}

const CHANNEL_META: Record<string, { icon: string; iconClass: string; label: string }> = {
  whatsapp: { icon: '💬', iconClass: 'b-green', label: 'WhatsApp' },
  chat: { icon: '💭', iconClass: 'b-blue', label: 'Live Chat' },
  email: { icon: '✉️', iconClass: 'b-sky', label: 'Email' },
  voice: { icon: '📞', iconClass: 'b-amber', label: 'Voice' },
  instagram: { icon: '📸', iconClass: 'b-pink', label: 'Instagram' },
  facebook: { icon: '📘', iconClass: 'b-blue', label: 'Facebook' },
  x: { icon: '✖️', iconClass: 'b-amber', label: 'X' },
};
const RESOLVED_STATUSES = ['resolved', 'closed'];
const FEED_LIMIT = 20;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

interface FeedEvent {
  at: Date;
  tag: FeedItem['tag'];
  channel: string;
  html: string;
}

function relativeTime(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

@Injectable()
export class ActivityService {
  private prisma = getPrisma();

  async getFeed(tenantId: string): Promise<FeedItem[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const since = new Date(now.getTime() - LOOKBACK_MS);

      const [resolved, escalations, aiHandled] = await Promise.all([
        tx.conversation.findMany({
          where: { status: { in: RESOLVED_STATUSES }, updatedAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: FEED_LIMIT,
          include: { contact: { select: { name: true } }, assignedUser: { select: { name: true } } },
        }),
        tx.escalation.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: FEED_LIMIT,
          include: {
            ticket: { include: { contact: { select: { name: true } }, conversation: { select: { channel: true } } } },
            escalatedToUser: { select: { name: true } },
          },
        }),
        tx.conversation.findMany({
          where: {
            status: { notIn: RESOLVED_STATUSES },
            createdAt: { gte: since },
            messages: { some: { senderType: 'bot' } },
          },
          orderBy: { updatedAt: 'desc' },
          take: FEED_LIMIT,
          include: { contact: { select: { name: true } } },
        }),
      ]);

      const events: FeedEvent[] = [];

      for (const c of resolved) {
        const who = c.assignedUserId ? c.assignedUser?.name ?? 'An agent' : 'Astra AI';
        const customer = c.contact?.name ?? 'a customer';
        const what = c.intent ? c.intent.replace(/_/g, ' ') : 'query';
        const channelLabel = CHANNEL_META[c.channel]?.label ?? c.channel;
        events.push({
          at: c.updatedAt,
          tag: 'res',
          channel: c.channel,
          html: `<b>${who}</b> resolved a ${channelLabel} ${what} for <b>${customer}</b>`,
        });
      }

      for (const e of escalations) {
        const customer = e.ticket.contact?.name ?? 'a customer';
        const toName = e.escalatedToUser?.name ?? 'a specialist';
        const channel = e.ticket.conversation?.channel ?? 'chat';
        events.push({
          at: e.createdAt,
          tag: 'esc',
          channel,
          html: `Escalated <b>${e.ticket.subject}</b> for <b>${customer}</b> to <b>${toName}</b>`,
        });
      }

      for (const c of aiHandled) {
        const customer = c.contact?.name ?? 'a customer';
        const channelLabel = CHANNEL_META[c.channel]?.label ?? c.channel;
        events.push({
          at: c.updatedAt,
          tag: 'ai',
          channel: c.channel,
          html: `<b>Astra AI</b> is handling a ${channelLabel} message from <b>${customer}</b>`,
        });
      }

      return events
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, FEED_LIMIT)
        .map((e) => {
          const meta = CHANNEL_META[e.channel] ?? { icon: '💬', iconClass: 'b-blue' };
          return { icon: meta.icon, iconClass: meta.iconClass, html: e.html, tag: e.tag, time: relativeTime(e.at, now) };
        });
    });
  }
}
