import { Body, Controller, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AiService } from './ai.service';
import { AskAstraDto } from './ask-astra.dto';

/** Not guarded yet — same rationale as KbController (see its comment). */
@Controller('ai')
export class AiController {
  constructor(private svc: AiService) {}

  @Post('ask')
  ask(@Req() req: TenantScopedRequest, @Body() dto: AskAstraDto) {
    return this.svc.ask(req.tenantId, dto.question, dto.language);
  }
}
