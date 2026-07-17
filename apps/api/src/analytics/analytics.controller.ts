import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('overview')
  getOverview(@Req() req: TenantScopedRequest) {
    return this.svc.getOverview(req.tenantId);
  }

  @Get('detail')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }
}
