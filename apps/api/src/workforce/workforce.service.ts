import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { AgentStatus, RosterRowDto, WorkforceBoardDto, WorkforceRosterDto, WorkforceStatusCounts } from '@aq/shared';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Guide's own "on-time" bar for schedule adherence — a shift login within 15 minutes of its start.
const ADHERENCE_GRACE_MINS = 15;

/**
 * Real workforce data — Guide's "Workforce management" module. Scoped to
 * what has a real source: live status board + roster (real `AgentStatusRow`/
 * `Shift`) and schedule adherence (computed from real login times). The
 * prototype's Occupancy/Shrinkage figures and the 6-hour volume forecast
 * chart need real call-volume/ACD telephony data (Exotel — not built), so
 * they're deliberately not included rather than faked.
 */
@Injectable()
export class WorkforceService {
  private prisma = getPrisma();

  async board(tenantId: string): Promise<WorkforceBoardDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const users = await tx.user.findMany({ include: { agentStatus: true }, orderBy: { name: 'asc' } });

      const statusCounts: WorkforceStatusCounts = { available: 0, on_call: 0, on_break: 0, offline: 0 };
      const people = users.map((u) => {
        const status = (u.agentStatus?.status ?? 'offline') as AgentStatus;
        statusCounts[status]++;
        return { id: u.id, name: u.name, initials: initials(u.name), color: u.avatarColor ?? '#2563EB', title: u.title, status };
      });

      return { statusCounts, people };
    });
  }

  async roster(tenantId: string): Promise<WorkforceRosterDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const shifts = await tx.shift.findMany({
        where: { startsAt: { gte: startOfDay } },
        include: { user: { include: { department: true, agentStatus: true } } },
        orderBy: { startsAt: 'asc' },
      });

      const now = Date.now();
      const started = shifts.filter((s) => s.startsAt.getTime() <= now);
      const onTime = started.filter(
        (s) => s.loginAt && Math.abs(s.loginAt.getTime() - s.startsAt.getTime()) <= ADHERENCE_GRACE_MINS * 60_000,
      );
      const adherencePct = started.length > 0 ? Math.round((onTime.length / started.length) * 100) : null;

      const rows: RosterRowDto[] = shifts.map((s) => ({
        userId: s.userId,
        name: s.user.name,
        departmentName: s.user.department?.name ?? null,
        shiftName: s.name,
        loginTime: s.loginAt ? s.loginAt.toISOString() : null,
        status: (s.user.agentStatus?.status ?? 'offline') as AgentStatus,
      }));

      return { adherencePct, rows };
    });
  }
}
