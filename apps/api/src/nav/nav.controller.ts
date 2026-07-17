import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { NavService } from './nav.service';

@Controller('nav')
export class NavController {
  constructor(private readonly svc: NavService) {}

  @Get('counts')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.getCounts(req.tenantId);
  }
}
