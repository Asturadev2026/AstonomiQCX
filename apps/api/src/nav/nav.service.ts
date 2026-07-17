import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface NavCounts {
  inbox: number;
  mentions: number;
  slaAtRisk: number;
  agentsLive: number;
  unreadNotifications: number;
}

const OPEN_CONVERSATION_STATUSES_EXCLUDED = ['resolved', 'closed'];
const UNHANDLED_MENTION_STAGES = ['detected', 'bot_replied'];
const LIVE_AGENT_STATUSES = ['available', 'on_call'];
const SLA_RISK_WINDOW_MINS = 30;

@Injectable()
export class NavService {
  private prisma = getPrisma();

  async getCounts(tenantId: string): Promise<NavCounts> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const riskCutoff = new Date(Date.now() + SLA_RISK_WINDOW_MINS * 60_000);

      const [inbox, mentions, slaAtRisk, agentsLive, unreadNotifications] = await Promise.all([
        tx.conversation.count({ where: { status: { notIn: OPEN_CONVERSATION_STATUSES_EXCLUDED } } }),
        tx.socialMention.count({ where: { stage: { in: UNHANDLED_MENTION_STAGES } } }),
        // Not yet breached but due within the risk window, or already overdue — no minute-sweep
        // worker exists yet (apps/workers, Guide §15) so `breached` isn't kept live; compute it here.
        tx.slaEvent.count({ where: { kind: 'resolution', metAt: null, targetAt: { lte: riskCutoff } } }),
        tx.agentStatusRow.count({ where: { status: { in: LIVE_AGENT_STATUSES } } }),
        // Tenant-wide, not per-user: this endpoint has no authenticated user context yet
        // (unguarded, like the other summary endpoints) until the login flow is wired into apps/web.
        tx.notification.count({ where: { readAt: null } }),
      ]);

      return { inbox, mentions, slaAtRisk, agentsLive, unreadNotifications };
    });
  }
}
