import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { FieldServiceService } from './field-service.service';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('field-service')
export class FieldServiceController {
  constructor(private svc: FieldServiceService) {}

  @Get('kpis')
  kpis(@Req() req: TenantScopedRequest) {
    return this.svc.kpis(req.tenantId);
  }

  @Get('visits')
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }
}
