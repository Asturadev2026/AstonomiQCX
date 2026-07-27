import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { BillingService } from './billing.service';

/** Not guarded yet, same rationale as Macros/Kb/Ai controllers. */
@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}

  @Get('overview')
  overview(@Req() req: TenantScopedRequest) {
    return this.svc.getOverview(req.tenantId);
  }
}
