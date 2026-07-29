import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { AddIvrNodeDto } from './add-ivr-node.dto';
import { IvrFlowService } from './ivr-flow.service';
import { MoveIvrNodeDto } from './move-ivr-node.dto';
import { SetIvrBranchDto } from './set-ivr-branch.dto';
import { SetIvrNextDto } from './set-ivr-next.dto';
import { UpdateIvrNodeDto } from './update-ivr-node.dto';

/** Not guarded yet — same rationale as AgentFlowController/KbController. */
@Controller('telephony/ivr')
export class IvrFlowController {
  constructor(private svc: IvrFlowService) {}

  @Get('active')
  getActive(@Req() req: TenantScopedRequest) {
    return this.svc.getActive(req.tenantId);
  }

  @Post(':id/nodes')
  addNode(@Req() req: TenantScopedRequest, @Param('id') id: string, @Body() dto: AddIvrNodeDto) {
    return this.svc.addNode(req.tenantId, id, dto.type, dto.afterNodeId);
  }

  @Post(':id/nodes/:nodeId')
  updateNode(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateIvrNodeDto,
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
    @Body() dto: MoveIvrNodeDto,
  ) {
    return this.svc.moveNode(req.tenantId, id, nodeId, dto.afterNodeId);
  }

  @Post(':id/nodes/:nodeId/next')
  setNext(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: SetIvrNextDto,
  ) {
    return this.svc.setNext(req.tenantId, id, nodeId, dto.nextId);
  }

  @Post(':id/nodes/:nodeId/branch')
  setBranch(
    @Req() req: TenantScopedRequest,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: SetIvrBranchDto,
  ) {
    return this.svc.setBranch(req.tenantId, id, nodeId, dto.digit, dto.nextId);
  }

  @Post(':id/publish')
  publish(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.publish(req.tenantId, id);
  }
}
