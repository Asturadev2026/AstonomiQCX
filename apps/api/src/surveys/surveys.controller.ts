import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { SurveysService } from './surveys.service';

@Controller('surveys')
export class SurveysController {
  constructor(private readonly svc: SurveysService) {}

  @Get('summary')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }
}
