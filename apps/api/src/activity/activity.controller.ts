import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(private readonly svc: ActivityService) {}

  @Get('feed')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.getFeed(req.tenantId);
  }
}
