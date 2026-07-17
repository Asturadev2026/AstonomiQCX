import { Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { RulesService } from './rules.service';

/** Not guarded yet — same rationale as KbController/AiController/AgentFlowController. */
@Controller('rules')
export class RulesController {
  constructor(private svc: RulesService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Patch(':id/toggle')
  toggle(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.toggle(req.tenantId, id);
  }
}
