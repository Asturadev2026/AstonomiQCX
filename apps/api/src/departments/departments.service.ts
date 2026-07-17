import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { AgentStatus, DepartmentCardDto, DepartmentExecDto } from '@aq/shared';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const OPEN_STATUSES = ['new', 'in_progress', 'waiting'];

/** Real department cards — Guide's "Departments & team hierarchy" module. */
@Injectable()
export class DepartmentsService {
  private prisma = getPrisma();

  async list(tenantId: string): Promise<DepartmentCardDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const [depts, users, openCounts] = await Promise.all([
        tx.department.findMany({ orderBy: { name: 'asc' } }),
        tx.user.findMany({ include: { agentStatus: true } }),
        tx.ticket.groupBy({ by: ['departmentId'], where: { status: { in: OPEN_STATUSES } }, _count: true }),
      ]);

      const openCountFor = (deptId: string) => openCounts.find((c) => c.departmentId === deptId)?._count ?? 0;

      return depts.map((d) => {
        const deptUsers = users.filter((u) => u.departmentId === d.id);
        const execs: DepartmentExecDto[] = deptUsers
          .map((u) => ({
            id: u.id,
            name: u.name,
            initials: initials(u.name),
            color: u.avatarColor ?? '#2563EB',
            title: u.title,
            status: (u.agentStatus?.status ?? 'offline') as AgentStatus,
            isHead: u.id === d.headUserId,
          }))
          .sort((a, b) => Number(b.isHead) - Number(a.isHead));

        const head = deptUsers.find((u) => u.id === d.headUserId);

        return {
          id: d.id,
          name: d.name,
          icon: d.icon ?? '🏢',
          color: d.color ?? '#2563EB',
          headName: head?.name ?? null,
          openTicketCount: openCountFor(d.id),
          execs,
        };
      });
    });
  }
}
