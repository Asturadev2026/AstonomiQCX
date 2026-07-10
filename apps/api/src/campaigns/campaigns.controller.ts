import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { CampaignsService } from './campaigns.service';
import { SendCampaignDto } from './send-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Get('summary')
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }

  @Post()
  send(@Req() req: TenantScopedRequest, @Body() dto: SendCampaignDto) {
    return this.svc.send(req.tenantId, dto);
  }
}
