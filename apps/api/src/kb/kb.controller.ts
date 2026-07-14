import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { KbService } from './kb.service';
import { CreateKbArticleDto } from './create-kb-article.dto';

/**
 * Not guarded yet, matching Contacts/Journey (Guide §7 auth exists but the
 * web app has no real login flow to obtain a token from — see repo memory).
 * Add JwtGuard/PermissionsGuard here in the same pass that guards those.
 */
@Controller('kb')
export class KbController {
  constructor(private svc: KbService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Post()
  create(@Req() req: TenantScopedRequest, @Body() dto: CreateKbArticleDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Patch(':id/view')
  incrementView(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.incrementView(req.tenantId, id);
  }
}
