import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AddFlowNodeDto } from './add-flow-node.dto';
import { AgentFlowService } from './agent-flow.service';
import { MoveFlowNodeDto } from './move-flow-node.dto';
import { SetNextNodeDto } from './set-next-node.dto';
import { UpdateFlowNodeDto } from './update-flow-node.dto';

/** Not guarded yet — same rationale as KbController/AiController. */
@Controller('agent-flows')
export class AgentFlowController {
  constructor(private svc: AgentFlowService) {}

  @Get('active')
  getActive(@Req() req: TenantScopedRequest) {
    return this.svc.getActive(req.tenantId);
  }

  @Post(':id/nodes')
  addNode(@Req() req: TenantScopedRequest, @Param('id') id: string, @Body() dto: AddFlowNodeDto) {
    return this.svc.addNode(req.tenantId, id, dto.type, dto.afterNodeId);
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

  @Post(':id/nodes/:nodeId/delete')
  deleteNode(@Req() req: TenantScopedRequest, @Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.svc.deleteNode(req.tenantId, id, nodeId);
  }

  @Post(':id/nodes/:nodeId/move')
  moveNode(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveFlowNodeDto,
  ) {
    return this.svc.moveNode(req.tenantId, id, nodeId, dto.afterNodeId);
  }

  @Post(':id/nodes/:nodeId/next')
  setNext(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: SetNextNodeDto,
  ) {
    return this.svc.setNext(req.tenantId, id, nodeId, dto.nextId);
  }

  @Post(':id/publish')
  publish(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.publish(req.tenantId, id);
  }
}
