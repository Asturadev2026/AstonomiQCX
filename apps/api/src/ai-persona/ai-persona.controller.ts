import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AiPersonaService } from './ai-persona.service';
import { UpdateAiPersonaDto } from './update-ai-persona.dto';

/** Not guarded yet — same rationale as AiController/AgentFlowController. */
@Controller('ai/persona')
export class AiPersonaController {
  constructor(private svc: AiPersonaService) {}

  @Get()
  get(@Req() req: TenantScopedRequest) {
    return this.svc.get(req.tenantId);
  }

  @Post()
  update(@Req() req: TenantScopedRequest, @Body() dto: UpdateAiPersonaDto) {
    return this.svc.update(req.tenantId, dto);
  }
}
