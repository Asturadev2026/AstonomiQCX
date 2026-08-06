import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type Department } from '@aq/db';
import type { AgentStatus, CreateDepartmentDto, DepartmentCardDto, DepartmentExecDto } from '@aq/shared';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const OPEN_STATUSES = ['new', 'in_progress', 'waiting'];

const DEFAULT_DEPARTMENTS = [
  { name: 'Escalations Desk', icon: '🚨', color: '#DC2626' },
  { name: 'Payments & Refunds', icon: '💳', color: '#2563EB' },
  { name: 'Technical Support', icon: '🛠️', color: '#4F46E5' },
  { name: 'Logistics', icon: '🚚', color: '#E08A00' },
  { name: 'Customer Success', icon: '🤝', color: '#16A34A' },
];

/** Real department cards — Guide's "Departments & team hierarchy" module. */
@Injectable()
export class DepartmentsService {
  private prisma = getPrisma();

  async create(tenantId: string, dto: CreateDepartmentDto): Promise<DepartmentCardDto> {
    const created: Department = await withTenant(this.prisma, tenantId, (tx) =>
      tx.department.create({
        data: { tenantId, name: dto.name, icon: dto.icon || '🏢', color: dto.color || '#2563EB' },
      }),
    );
    return {
      id: created.id,
      name: created.name,
      icon: created.icon ?? '🏢',
      color: created.color ?? '#2563EB',
      headName: null,
      openTicketCount: 0,
      execs: [],
    };
  }

  async list(tenantId: string): Promise<DepartmentCardDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      let depts = await tx.department.findMany({ orderBy: { name: 'asc' } });

      if (depts.length === 0) {
        for (const d of DEFAULT_DEPARTMENTS) {
          await tx.department.create({
            data: { tenantId, name: d.name, icon: d.icon, color: d.color },
          });
        }
        depts = await tx.department.findMany({ orderBy: { name: 'asc' } });
      }

      const [users, openCounts] = await Promise.all([
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
