import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { PortalService } from './portal.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

  @Get('summary')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }
}
