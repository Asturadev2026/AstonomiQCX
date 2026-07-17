import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { PriorityMatrixService } from './priority-matrix.service';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('priority-matrix')
export class PriorityMatrixController {
  constructor(private svc: PriorityMatrixService) {}

  @Get()
  matrix(@Req() req: TenantScopedRequest) {
    return this.svc.matrix(req.tenantId);
  }
}
