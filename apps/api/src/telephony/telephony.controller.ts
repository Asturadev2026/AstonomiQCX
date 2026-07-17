import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { TelephonyService } from './telephony.service';
import { CreateNumberDto } from './create-number.dto';
import { SendTestCallDto } from './send-test-call.dto';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('telephony')
export class TelephonyController {
  constructor(private svc: TelephonyService) {}

  @Get('kpis')
  kpis(@Req() req: TenantScopedRequest) {
    return this.svc.kpis(req.tenantId);
  }

  @Get('workflow-steps')
  workflowSteps() {
    return this.svc.workflowSteps();
  }

  @Get('integration-status')
  integrationStatus() {
    return this.svc.integrationStatus();
  }

  @Post('test-call')
  sendTestCall(@Body() dto: SendTestCallDto) {
    return this.svc.sendTestCall(dto.toNumber);
  }

  @Get('numbers')
  listNumbers(@Req() req: TenantScopedRequest) {
    return this.svc.listNumbers(req.tenantId);
  }

  @Post('numbers')
  createNumber(@Req() req: TenantScopedRequest, @Body() dto: CreateNumberDto) {
    return this.svc.createNumber(req.tenantId, dto);
  }

  @Get('cdr')
  cdr(@Req() req: TenantScopedRequest) {
    return this.svc.cdr(req.tenantId);
  }
}
