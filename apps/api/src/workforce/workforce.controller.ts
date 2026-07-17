import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { WorkforceService } from './workforce.service';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('workforce')
export class WorkforceController {
  constructor(private svc: WorkforceService) {}

  @Get('board')
  board(@Req() req: TenantScopedRequest) {
    return this.svc.board(req.tenantId);
  }

  @Get('roster')
  roster(@Req() req: TenantScopedRequest) {
    return this.svc.roster(req.tenantId);
  }
}
