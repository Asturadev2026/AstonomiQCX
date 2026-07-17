import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { MentionsService } from './mentions.service';

/** Not guarded yet — same rationale as AiController/KbController (see their comments). */
@Controller('mentions')
export class MentionsController {
  constructor(private svc: MentionsService) {}

  @Get('summary')
  getSummary(@Req() req: TenantScopedRequest, @Query('group') group?: string) {
    return this.svc.getSummary(req.tenantId, group);
  }

  @Post(':id/escalate')
  escalate(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.escalate(req.tenantId, id);
  }

  @Post(':id/ticket')
  createTicket(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.createTicket(req.tenantId, id);
  }
}
