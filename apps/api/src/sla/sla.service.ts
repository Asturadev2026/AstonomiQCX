import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type Tx, type Ticket } from '@aq/db';
import type { CreateSlaPolicyDto, EscalationLevelDto, SlaBreachRow, SlaKpis, SlaPolicyDto, SlaScorecardRow } from '@aq/shared';
import { DEFAULT_ESCALATION_RULES } from './default-escalation-rules';

const DEFAULT_SLA_POLICIES = [
  { priority: 'p1', name: 'P1 — Urgent', firstResponseMins: 15, resolutionMins: 120 },
  { priority: 'p2', name: 'P2 — High', firstResponseMins: 30, resolutionMins: 240 },
  { priority: 'p3', name: 'P3 — Medium', firstResponseMins: 60, resolutionMins: 480 },
  { priority: 'p4', name: 'P4 — Low', firstResponseMins: 120, resolutionMins: 1440 },
];

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Guide §11.6: "at risk" means the target is coming close (within 2 hours) but not yet resolved.
const AT_RISK_THRESHOLD_MINS = 120;

/**
 * Whether an event is overdue RIGHT NOW — not just whether the `breached`
 * column has been flipped. That column is only ever set by `markResolved()`
 * at the moment of resolution; nothing sweeps it for tickets that are simply
 * still open past their target (that sweep is Guide §11.4, deliberately out
 * of scope here). Without this, an event breached for days would still read
 * as merely "at risk" everywhere except the live breaches table.
 */
function isOverdue(event: { metAt: Date | null; breached: boolean; targetAt: Date }, now: number): boolean {
  return event.breached || (!event.metAt && event.targetAt.getTime() < now);
}

/**
 * Starts/resolves the SLA clock for a ticket (Guide §8.3/§11), plus the read
 * side for the SLA & Escalation screen (KPIs, policies, scorecards, live
 * breach table, escalation matrix). Scoped deliberately to "real data, plain
 * clock" — the working-hours-aware clock and the once-a-minute breach-sweep
 * background job (Guide §11.2/§11.4) need `apps/workers`, which isn't built;
 * due dates stay plain clock time from firstResponseMins/resolutionMins.
 */
@Injectable()
export class SlaService {
  private prisma = getPrisma();

  private async ensureDefaultPolicies(tx: Tx, tenantId: string) {
    let policies = await tx.slaPolicy.findMany();
    if (policies.length === 0) {
      for (const p of DEFAULT_SLA_POLICIES) {
        await tx.slaPolicy.create({ data: { tenantId, priority: p.priority, name: p.name, firstResponseMins: p.firstResponseMins, resolutionMins: p.resolutionMins } });
      }
      policies = await tx.slaPolicy.findMany();
    }
    const unattached = await tx.ticket.findMany({
      where: { slaEvents: { none: {} } },
    });
    for (const ticket of unattached) {
      const policy = policies.find((p) => p.priority === ticket.priority) ?? policies[0];
      if (policy) {
        const createdMs = ticket.createdAt.getTime();
        await tx.ticket.update({ where: { id: ticket.id }, data: { slaPolicyId: policy.id } });
        await tx.slaEvent.createMany({
          data: [
            {
              tenantId,
              ticketId: ticket.id,
              kind: 'first_response',
              targetAt: new Date(createdMs + policy.firstResponseMins * 60_000),
            },
            {
              tenantId,
              ticketId: ticket.id,
              kind: 'resolution',
              targetAt: new Date(createdMs + policy.resolutionMins * 60_000),
            },
          ],
        });
      }
    }
  }

  async startTimers(tx: Tx, tenantId: string, ticket: Ticket) {
    await this.ensureDefaultPolicies(tx, tenantId);
    const policy = await tx.slaPolicy.findFirst({
      where: { tenantId, priority: ticket.priority },
      orderBy: { id: 'asc' },
    });
    if (!policy) return; // no SLA policy configured for this priority yet — nothing to start

    const now = Date.now();
    await tx.ticket.update({ where: { id: ticket.id }, data: { slaPolicyId: policy.id } });
    await tx.slaEvent.createMany({
      data: [
        {
          tenantId,
          ticketId: ticket.id,
          kind: 'first_response',
          targetAt: new Date(now + policy.firstResponseMins * 60_000),
        },
        {
          tenantId,
          ticketId: ticket.id,
          kind: 'resolution',
          targetAt: new Date(now + policy.resolutionMins * 60_000),
        },
      ],
    });
  }

  async markResolved(tx: Tx, _tenantId: string, ticketId: string) {
    const openEvent = await tx.slaEvent.findFirst({
      where: { ticketId, kind: 'resolution', metAt: null },
    });
    if (!openEvent) return;

    const now = new Date();
    await tx.slaEvent.update({
      where: { id: openEvent.id },
      data: { metAt: now, breached: now > openEvent.targetAt },
    });
  }

  async listPolicies(tenantId: string): Promise<SlaPolicyDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      await this.ensureDefaultPolicies(tx, tenantId);
      const [policies, depts] = await Promise.all([
        tx.slaPolicy.findMany({ orderBy: { firstResponseMins: 'asc' } }),
        tx.department.findMany(),
      ]);
      const deptName = (id: string | null) => (id ? depts.find((d) => d.id === id)?.name ?? null : null);
      return policies.map((p) => ({
        id: p.id,
        name: p.name,
        priority: p.priority,
        channel: p.channel,
        segment: p.segment,
        departmentName: deptName(p.departmentId),
        firstResponseMins: p.firstResponseMins,
        resolutionMins: p.resolutionMins,
      }));
    });
  }

  async createPolicy(tenantId: string, dto: CreateSlaPolicyDto): Promise<SlaPolicyDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const p = await tx.slaPolicy.create({
        data: {
          tenantId,
          name: dto.name,
          priority: dto.priority || null,
          channel: dto.channel || null,
          segment: dto.segment || null,
          departmentId: dto.departmentId || null,
          firstResponseMins: Number(dto.firstResponseMins) || 30,
          resolutionMins: Number(dto.resolutionMins) || 240,
        },
      });
      let departmentName: string | null = null;
      if (p.departmentId) {
        const dept = await tx.department.findUnique({ where: { id: p.departmentId } });
        departmentName = dept?.name ?? null;
      }
      return {
        id: p.id,
        name: p.name,
        priority: p.priority,
        channel: p.channel,
        segment: p.segment,
        departmentName,
        firstResponseMins: p.firstResponseMins,
        resolutionMins: p.resolutionMins,
      };
    });
  }

  async kpis(tenantId: string): Promise<SlaKpis> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      await this.ensureDefaultPolicies(tx, tenantId);
      const events = await tx.slaEvent.findMany({
        where: { kind: 'resolution' },
        include: { ticket: { select: { createdAt: true } } },
      });
      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const concluded = events.filter((e) => e.metAt || isOverdue(e, now));
      const metOnTime = events.filter((e) => e.metAt && !e.breached);
      const compliancePct = concluded.length > 0 ? Math.round((metOnTime.length / concluded.length) * 1000) / 10 : null;

      const atRiskCount = events.filter(
        (e) => !e.metAt && !isOverdue(e, now) && e.targetAt.getTime() - now <= AT_RISK_THRESHOLD_MINS * 60_000,
      ).length;
      const breachedTodayCount = events.filter((e) => isOverdue(e, now) && e.targetAt >= startOfToday).length;

      const resolvedDurations = events
        .filter((e) => e.metAt)
        .map((e) => (e.metAt!.getTime() - e.ticket.createdAt.getTime()) / 60_000);
      const avgResolutionMins =
        resolvedDurations.length > 0 ? Math.round(resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length) : null;

      return { compliancePct, atRiskCount, breachedTodayCount, avgResolutionMins };
    });
  }

  async scorecard(tenantId: string, by: 'exec' | 'dept'): Promise<SlaScorecardRow[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      await this.ensureDefaultPolicies(tx, tenantId);
      const events = await tx.slaEvent.findMany({
        where: { kind: 'resolution' },
        include: { ticket: { select: { assignedUserId: true, departmentId: true } } },
      });
      const now = Date.now();

      const groups = new Map<string, { assigned: number; met: number; breached: number; atRisk: number }>();
      for (const e of events) {
        const rawKey = by === 'exec' ? e.ticket.assignedUserId : e.ticket.departmentId;
        const key = rawKey ?? 'unassigned';
        const g = groups.get(key) ?? { assigned: 0, met: 0, breached: 0, atRisk: 0 };
        g.assigned++;
        const overdue = isOverdue(e, now);
        if (e.metAt && !e.breached) g.met++;
        if (overdue) g.breached++;
        if (!e.metAt && !overdue && e.targetAt.getTime() - now <= AT_RISK_THRESHOLD_MINS * 60_000) g.atRisk++;
        groups.set(key, g);
      }

      const toRow = (key: string, name: string, initialsOrIcon: string, color: string | null): SlaScorecardRow => {
        const g = groups.get(key) ?? { assigned: 0, met: 0, breached: 0, atRisk: 0 };
        return {
          key,
          name,
          initials: initialsOrIcon,
          color: color ?? '#2563EB',
          assigned: g.assigned,
          met: g.met,
          breached: g.breached,
          atRisk: g.atRisk,
          adherencePct: g.assigned > 0 ? Math.round((g.met / g.assigned) * 100) : 0,
        };
      };

      const rows: SlaScorecardRow[] = [];

      if (by === 'exec') {
        const users = await tx.user.findMany({ orderBy: { name: 'asc' } });
        for (const u of users) {
          rows.push(toRow(u.id, u.name, initials(u.name), u.avatarColor));
        }
        if (groups.has('unassigned')) {
          rows.push(toRow('unassigned', 'Unassigned Queue', '??', '#94A3B8'));
        }
      } else {
        const depts = await tx.department.findMany({ orderBy: { name: 'asc' } });
        for (const d of depts) {
          rows.push(toRow(d.id, d.name, d.icon ?? '🏢', d.color));
        }
        if (groups.has('unassigned')) {
          rows.push(toRow('unassigned', 'General / Unassigned', '🏢', '#94A3B8'));
        }
      }

      return rows.sort((a, b) => b.assigned - a.assigned);
    });
  }

  async breaches(tenantId: string): Promise<SlaBreachRow[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const events = await tx.slaEvent.findMany({
        where: { kind: 'resolution', metAt: null },
        include: { ticket: { include: { contact: true, assignedUser: true, department: true } } },
        orderBy: { targetAt: 'asc' },
        take: 20,
      });
      const now = Date.now();
      return events.map((e) => {
        const secondsLeft = Math.round((e.targetAt.getTime() - now) / 1000);
        const status: SlaBreachRow['status'] = secondsLeft < 0 ? 'breach' : secondsLeft < AT_RISK_THRESHOLD_MINS * 60 ? 'warn' : 'ok';
        return {
          ticketExtRef: e.ticket.extRef ?? e.ticket.id,
          customerName: e.ticket.contact?.name ?? null,
          priority: e.ticket.priority,
          departmentName: e.ticket.department?.name ?? null,
          assigneeName: e.ticket.assignedUser?.name ?? null,
          assigneeInitials: e.ticket.assignedUser ? initials(e.ticket.assignedUser.name) : null,
          assigneeColor: e.ticket.assignedUser?.avatarColor ?? null,
          secondsLeft,
          status,
        };
      });
    });
  }

  async escalationMatrix(tenantId: string): Promise<EscalationLevelDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      let rules = await tx.escalationRule.findMany({ orderBy: { level: 'asc' } });
      if (rules.length === 0) {
        await tx.escalationRule.createMany({
          data: DEFAULT_ESCALATION_RULES.map((r) => ({
            tenantId,
            level: r.level,
            triggerAfterMins: r.triggerAfterMins,
            escalateToRole: r.escalateToRole,
          })),
        });
        rules = await tx.escalationRule.findMany({ orderBy: { level: 'asc' } });
      }
      return rules.map((rule) => {
        const label = DEFAULT_ESCALATION_RULES.find((r) => r.level === rule.level);
        return {
          level: rule.level,
          who: label?.who ?? `Level ${rule.level}`,
          role: label?.role ?? rule.escalateToRole ?? '—',
          timing: label?.timing ?? `+${rule.triggerAfterMins} min`,
        };
      });
    });
  }
}
