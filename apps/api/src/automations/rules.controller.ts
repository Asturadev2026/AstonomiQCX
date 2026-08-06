import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './create-rule.dto';

/** Not guarded yet — same rationale as KbController/AiController/AgentFlowController. */
@Controller('rules')
export class RulesController {
  constructor(private svc: RulesService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Post()
  create(@Req() req: TenantScopedRequest, @Body() dto: CreateRuleDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Patch(':id/toggle')
  toggle(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.toggle(req.tenantId, id);
  }
}
