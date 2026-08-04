import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { SettingsService } from './settings.service';
import { CreateInviteDto } from './create-invite.dto';
import { UpdateUserRoleDto } from './update-user-role.dto';

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

  @Patch('users/:userId/department')
  updateUserDepartment(
    @Req() req: TenantScopedRequest,
    @Param('userId') userId: string,
    @Body() body: { departmentId: string | null },
  ) {
    return this.svc.updateUserDepartment(req.tenantId, userId, body.departmentId);
  }

  @Patch('users/:userId/role')
  updateUserRole(
    @Req() req: TenantScopedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.svc.updateUserRole(req.tenantId, userId, dto);
  }
}
