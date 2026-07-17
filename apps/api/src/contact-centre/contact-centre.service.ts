import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { ContactCentreKpis, IvrMenuOptionDto } from '@aq/shared';
import { IVR_MENU } from './ivr-menu';

/**
 * Real Contact Centre data — Guide's module tour. Scoped to what has a real
 * source: live "agents on call" (AgentStatusRow), live "calls in queue"
 * (Call.status = 'ringing' — honestly 0 without connected telephony), and a
 * real historical abandon rate (seeded Call history). The Live ACD queue and
 * Supervisor monitoring (listen-in/whisper/barge) are genuinely impossible
 * without a connected telephony integration (Exotel — not built, same
 * deferral as Voice AI's live-call half) — the frontend shows an honest
 * empty state for those rather than faking activity.
 */
@Injectable()
export class ContactCentreService {
  private prisma = getPrisma();

  async kpis(tenantId: string): Promise<ContactCentreKpis> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const callsInQueue = await tx.call.count({ where: { status: 'ringing' } });
      const agentsOnCall = await tx.user.count({ where: { agentStatus: { status: 'on_call' } } });
      const concluded = await tx.call.count({ where: { status: { in: ['completed', 'abandoned'] } } });
      const abandoned = await tx.call.count({ where: { status: 'abandoned' } });
      const abandonRatePct = concluded > 0 ? Math.round((abandoned / concluded) * 1000) / 10 : null;

      return { callsInQueue, agentsOnCall, abandonRatePct };
    });
  }

  ivrMenu(): IvrMenuOptionDto[] {
    return IVR_MENU;
  }
}
