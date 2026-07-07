import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { JourneyService } from './journey.service';

@Controller('journey')
export class JourneyController {
  constructor(private readonly svc: JourneyService) {}

  @Get('summary')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }
}
