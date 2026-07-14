import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { MacrosService } from './macros.service';
import { CreateMacroDto } from './create-macro.dto';

/** Not guarded yet, same rationale as Kb/Ai/AgentFlow/Rules controllers. */
@Controller('macros')
export class MacrosController {
  constructor(private svc: MacrosService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Post()
  create(@Req() req: TenantScopedRequest, @Body() dto: CreateMacroDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Patch(':id/use')
  use(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.use(req.tenantId, id);
  }
}
