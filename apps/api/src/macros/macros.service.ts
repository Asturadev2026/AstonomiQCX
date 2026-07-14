import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant, type Macro } from '@aq/db';
import type { CreateMacroDto, MacroDto } from '@aq/shared';
import { DEFAULT_MACROS } from './default-macros';

function toDto(macro: Macro): MacroDto {
  return { id: macro.id, title: macro.title, category: macro.category, body: macro.body, uses: macro.uses };
}

/** Real persistence for macros (canned replies) — Guide's module tour. */
@Injectable()
export class MacrosService {
  private prisma = getPrisma();

  /** Auto-seeds the prototype's 6 demo macros the first time a tenant has none. */
  async list(tenantId: string): Promise<MacroDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.macro.findMany({ orderBy: { id: 'asc' } });
      if (existing.length > 0) return existing.map(toDto);

      const created = await Promise.all(
        DEFAULT_MACROS.map((m) => tx.macro.create({ data: { tenantId, title: m.title, category: m.category, body: m.body } })),
      );
      return created.map(toDto);
    });
  }

  async create(tenantId: string, dto: CreateMacroDto): Promise<MacroDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const created = await tx.macro.create({
        data: { tenantId, title: dto.title, category: dto.category, body: dto.body },
      });
      return toDto(created);
    });
  }

  async use(tenantId: string, id: string): Promise<MacroDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const macro = await tx.macro.findUnique({ where: { id } });
      if (!macro) throw new NotFoundException(`Macro ${id} not found`);
      const updated = await tx.macro.update({ where: { id }, data: { uses: { increment: 1 } } });
      return toDto(updated);
    });
  }
}
