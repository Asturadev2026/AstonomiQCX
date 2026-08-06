import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { CreateServiceVisitDto, FieldServiceKpis, ServiceVisitDto } from '@aq/shared';

/** Real field service data — Guide's "Field Service" module. Fully backed by the existing `ServiceVisit` model, no gaps. */
@Injectable()
export class FieldServiceService {
  private prisma = getPrisma();

  async create(tenantId: string, dto: CreateServiceVisitDto): Promise<ServiceVisitDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const created = await tx.serviceVisit.create({
        data: {
          tenantId,
          kind: dto.kind,
          contactId: dto.contactId,
          address: dto.address,
          slot: new Date(dto.slot),
          technician: dto.technician,
          status: 'scheduled',
        },
        include: { contact: true },
      });
      return {
        id: created.id,
        kind: created.kind,
        contactName: created.contact?.name ?? null,
        address: created.address,
        slot: created.slot ? created.slot.toISOString() : null,
        technician: created.technician,
        status: created.status,
      };
    });
  }

  async kpis(tenantId: string): Promise<FieldServiceKpis> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const todayVisits = await tx.serviceVisit.findMany({ where: { slot: { gte: startOfDay, lt: endOfDay } } });

      const scheduledToday = todayVisits.length;
      const completedToday = todayVisits.filter((v) => v.status === 'completed').length;
      const inProgressToday = todayVisits.filter((v) => v.status === 'in_progress' || v.status === 'en_route').length;
      const techniciansOnField = new Set(
        todayVisits.filter((v) => v.technician && v.status !== 'completed').map((v) => v.technician),
      ).size;

      return { scheduledToday, completedToday, inProgressToday, techniciansOnField };
    });
  }

  async list(tenantId: string): Promise<ServiceVisitDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const visits = await tx.serviceVisit.findMany({
        where: { slot: { gte: startOfDay, lt: endOfDay } },
        include: { contact: true },
        orderBy: { slot: 'asc' },
      });

      return visits.map((v) => ({
        id: v.id,
        kind: v.kind,
        contactName: v.contact?.name ?? null,
        address: v.address,
        slot: v.slot ? v.slot.toISOString() : null,
        technician: v.technician,
        status: v.status,
      }));
    });
  }
}
