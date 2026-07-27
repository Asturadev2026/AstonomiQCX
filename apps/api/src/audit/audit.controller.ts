import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AuditService } from './audit.service';

/** Not guarded yet, same rationale as Macros/Kb/Ai controllers. */
@Controller('audit')
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.getRecent(req.tenantId);
  }
}
