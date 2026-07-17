import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, type AuthenticatedRequest } from '../auth/jwt.guard';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { ConversationsService } from './conversations.service';
import { ReplyMessageDto } from './reply-message.dto';

/**
 * Reads are unguarded (same rationale as Contacts/Journey/Kb — no login flow
 * wired into apps/web yet, see pages/Login.tsx). Writes need a real acting
 * agent, so they follow Tickets' guarded pattern instead.
 */
@Controller('conversations')
export class ConversationsController {
  constructor(private svc: ConversationsService) {}

  @Get()
  list(@Req() req: TenantScopedRequest, @Query('channel') channel?: string) {
    return this.svc.list(req.tenantId, channel);
  }

  @Get(':id')
  getThread(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getThread(req.tenantId, id);
  }

  @UseGuards(JwtGuard)
  @Post(':id/messages')
  reply(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ReplyMessageDto) {
    return this.svc.reply(req.tenantId, id, req.user.id, dto.text);
  }

  @UseGuards(JwtGuard)
  @Patch(':id/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.assign(req.tenantId, id, req.user.id);
  }

  @UseGuards(JwtGuard)
  @Patch(':id/resolve')
  resolve(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.resolve(req.tenantId, id);
  }
}
