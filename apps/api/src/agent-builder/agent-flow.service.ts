import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant, type AgentFlow } from '@aq/db';
import type { AgentFlowDefinition, AgentFlowDto, FlowNodeConfig } from '@aq/shared';
import { DEFAULT_FLOW_DEFINITION } from './default-flow';

function toDto(flow: AgentFlow): AgentFlowDto {
  return {
    id: flow.id,
    name: flow.name,
    kind: flow.kind,
    status: flow.status,
    definition: flow.definition as unknown as AgentFlowDefinition,
  };
}

/** Real persistence for the Agent Builder's flow graph — Guide §1.3/§12. */
@Injectable()
export class AgentFlowService {
  private prisma = getPrisma();

  /** The tenant's chat flow, auto-created from the default template if none exists yet. */
  async getActive(tenantId: string): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.agentFlow.findFirst({ where: { kind: 'chat' }, orderBy: { id: 'asc' } });
      if (existing) return toDto(existing);

      const created = await tx.agentFlow.create({
        data: {
          tenantId,
          name: 'Astra — Refund & Return agent',
          kind: 'chat',
          status: 'published',
          definition: DEFAULT_FLOW_DEFINITION as object,
        },
      });
      return toDto(created);
    });
  }

  async updateNodeConfig(tenantId: string, flowId: string, nodeId: string, config: FlowNodeConfig): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`Agent flow ${flowId} not found`);

      const definition = flow.definition as unknown as AgentFlowDefinition;
      const node = definition.nodes.find((n) => n.id === nodeId);
      if (!node) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);
      node.config = { ...node.config, ...config };

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async publish(tenantId: string, flowId: string): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.agentFlow.update({ where: { id: flowId }, data: { status: 'published' } });
      return toDto(updated);
    });
  }

  /** Used by FlowExecutionService — null if the tenant has no published chat flow. */
  async findPublishedChatFlow(tenantId: string): Promise<AgentFlow | null> {
    return withTenant(this.prisma, tenantId, (tx) =>
      tx.agentFlow.findFirst({ where: { kind: 'chat', status: 'published' }, orderBy: { id: 'asc' } }),
    );
  }
}
