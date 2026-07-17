import { Controller, Get, Query, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { SlaService } from './sla.service';

/** Not guarded yet, same rationale as Kb/Rules/AgentFlow/Macros controllers. */
@Controller('sla')
export class SlaController {
  constructor(private svc: SlaService) {}

  @Get('policies')
  policies(@Req() req: TenantScopedRequest) {
    return this.svc.listPolicies(req.tenantId);
  }

  @Get('kpis')
  kpis(@Req() req: TenantScopedRequest) {
    return this.svc.kpis(req.tenantId);
  }

  @Get('scorecard')
  scorecard(@Req() req: TenantScopedRequest, @Query('by') by: 'exec' | 'dept' = 'exec') {
    return this.svc.scorecard(req.tenantId, by === 'dept' ? 'dept' : 'exec');
  }

  @Get('breaches')
  breaches(@Req() req: TenantScopedRequest) {
    return this.svc.breaches(req.tenantId);
  }

  @Get('escalation-matrix')
  escalationMatrix(@Req() req: TenantScopedRequest) {
    return this.svc.escalationMatrix(req.tenantId);
  }
}
