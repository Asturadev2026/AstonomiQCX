import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { SettingsService } from './settings.service';
import { CreateInviteDto } from './create-invite.dto';

/** Not guarded yet, same rationale as Macros/Kb/Ai controllers. */
@Controller('settings')
export class SettingsController {
  constructor(private svc: SettingsService) {}

  @Get()
  get(@Req() req: TenantScopedRequest) {
    return this.svc.getSettings(req.tenantId);
  }

  @Patch('toggles/:key')
  toggle(@Req() req: TenantScopedRequest, @Param('key') key: string) {
    return this.svc.toggleSetting(req.tenantId, key);
  }

  @Post('invites')
  invite(@Req() req: TenantScopedRequest, @Body() dto: CreateInviteDto) {
    return this.svc.createInvite(req.tenantId, dto);
  }
}
