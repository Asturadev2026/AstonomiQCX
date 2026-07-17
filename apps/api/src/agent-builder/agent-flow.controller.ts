import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AgentFlowService } from './agent-flow.service';
import { UpdateFlowNodeDto } from './update-flow-node.dto';

/** Not guarded yet — same rationale as KbController/AiController. */
@Controller('agent-flows')
export class AgentFlowController {
  constructor(private svc: AgentFlowService) {}

  @Get('active')
  getActive(@Req() req: TenantScopedRequest) {
    return this.svc.getActive(req.tenantId);
  }

  @Post(':id/nodes/:nodeId')
  updateNode(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateFlowNodeDto,
  ) {
    return this.svc.updateNodeConfig(req.tenantId, id, nodeId, dto.config);
  }

  @Post(':id/publish')
  publish(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.publish(req.tenantId, id);
  }
}
