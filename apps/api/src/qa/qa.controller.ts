import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { QaService } from './qa.service';

@Controller('qa')
export class QaController {
  constructor(private readonly svc: QaService) {}

  @Get('summary')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }
}
