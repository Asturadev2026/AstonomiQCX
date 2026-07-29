import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { TelephonyService } from './telephony.service';
import { BridgeCallDto } from './bridge-call.dto';
import { CreateDialerCampaignDto } from './create-dialer-campaign.dto';
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

  @Get('live-calls')
  liveCalls(@Req() req: TenantScopedRequest) {
    return this.svc.liveCalls(req.tenantId);
  }

  @Post('bridge')
  bridgeCall(@Req() req: TenantScopedRequest, @Body() dto: BridgeCallDto) {
    return this.svc.bridgeCall(req.tenantId, dto.fromNumber, dto.toNumber);
  }

  @Get('dialer-campaigns')
  listDialerCampaigns(@Req() req: TenantScopedRequest) {
    return this.svc.listDialerCampaigns(req.tenantId);
  }

  @Post('dialer-campaigns')
  createDialerCampaign(@Req() req: TenantScopedRequest, @Body() dto: CreateDialerCampaignDto) {
    return this.svc.createDialerCampaign(req.tenantId, dto);
  }
}
