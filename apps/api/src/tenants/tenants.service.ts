import { ConflictException, Injectable } from '@nestjs/common';
import { getPrisma, Prisma, type Tenant } from '@aq/db';
import type { TenantDto } from '@aq/shared';
import { CreateTenantDto } from './create-tenant.dto';
import { UpdateTenantStatusDto } from './update-tenant-status.dto';

function toTenantDto(t: Tenant): TenantDto {
  return {
    id: t.id,
    name: t.name,
    subdomain: t.subdomain,
    plan: t.plan as TenantDto['plan'],
    status: t.status as TenantDto['status'],
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Cross-tenant by design — the `tenants` table is the root of the tenancy
 * model (no RLS policy on it), so this deliberately uses getPrisma() directly
 * rather than withTenant() (same rationale as resolve_tenant_by_oidc_subject
 * in apps/api/src/auth/oidc.ts).
 */
@Injectable()
export class TenantsService {
  private prisma = getPrisma();

  async list(): Promise<TenantDto[]> {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
    return tenants.map(toTenantDto);
  }

  async create(dto: CreateTenantDto): Promise<TenantDto> {
    try {
      const tenant = await this.prisma.tenant.create({
        data: { name: dto.name, subdomain: dto.subdomain, plan: dto.plan ?? 'business' },
      });
      return toTenantDto(tenant);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Subdomain "${dto.subdomain}" is already taken`);
      }
      throw err;
    }
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto): Promise<TenantDto> {
    const tenant = await this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
    return toTenantDto(tenant);
  }
}
