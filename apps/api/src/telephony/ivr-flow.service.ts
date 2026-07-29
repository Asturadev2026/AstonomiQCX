import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPrisma, withTenant, type AgentFlow } from '@aq/db';
import type { IvrFlowDefinition, IvrFlowDto, IvrNode, IvrNodeConfig, IvrNodeType } from '@aq/shared';
import { DEFAULT_IVR_FLOW_DEFINITION } from './default-ivr-flow';

/** null = insert at the very front; otherwise right after the node with that id (falls back to the end if it's not found). */
function insertionIndex(nodes: IvrNode[], afterNodeId: string | null): number {
  if (afterNodeId === null) return 0;
  const afterIndex = nodes.findIndex((n) => n.id === afterNodeId);
  return afterIndex === -1 ? nodes.length : afterIndex + 1;
}

function toDto(flow: AgentFlow): IvrFlowDto {
  return {
    id: flow.id,
    name: flow.name,
    status: flow.status,
    definition: flow.definition as unknown as IvrFlowDefinition,
  };
}

/** Defaults for a freshly dragged-in block — mirrors the palette's icons/badges/labels. */
const NODE_TEMPLATES: Record<IvrNodeType, Omit<IvrNode, 'id' | 'nextId'>> = {
  play: {
    type: 'play',
    icon: '🔊',
    badge: 'b-blue',
    title: 'Play message',
    subtitle: 'speak a prompt',
    config: { message: '' },
  },
  menu: {
    type: 'menu',
    icon: '🔢',
    badge: 'b-amber',
    title: 'Menu (DTMF)',
    subtitle: 'collect a keypress',
    config: { message: '', branches: {} },
  },
  forward: {
    type: 'forward',
    icon: '📞',
    badge: 'b-green',
    title: 'Forward call',
    subtitle: 'route to a queue, agent or number',
    config: { forwardTo: '' },
  },
  voicemail: {
    type: 'voicemail',
    icon: '📼',
    badge: 'b-indigo',
    title: 'Send to voicemail',
    subtitle: 'record a message',
    config: { message: '' },
  },
  hangup: {
    type: 'hangup',
    icon: '📴',
    badge: 'b-pink',
    title: 'Hang up',
    subtitle: 'end call',
    config: {},
  },
};

/** Real persistence for the Cloud Telephony IVR call-flow builder — same node-graph shape as Agent Builder (AgentFlow.kind = 'ivr'). */
@Injectable()
export class IvrFlowService {
  private prisma = getPrisma();

  /** The tenant's IVR flow, auto-created from the default template if none exists yet. */
  async getActive(tenantId: string): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.agentFlow.findFirst({ where: { kind: 'ivr' }, orderBy: { id: 'asc' } });
      if (existing) return toDto(existing);

      const created = await tx.agentFlow.create({
        data: {
          tenantId,
          name: 'Main IVR',
          kind: 'ivr',
          status: 'draft',
          definition: DEFAULT_IVR_FLOW_DEFINITION as object,
        },
      });
      return toDto(created);
    });
  }

  async updateNodeConfig(tenantId: string, flowId: string, nodeId: string, config: IvrNodeConfig): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const node = definition.nodes.find((n) => n.id === nodeId);
      if (!node) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);
      // class-transformer's @Type() instantiates every declared field on the
      // incoming DTO, including ones the caller didn't set — those come
      // through as explicit `undefined` own properties. Spreading that
      // directly over the existing config would silently overwrite fields
      // the caller never touched (e.g. wiping a menu's `branches` when only
      // `message` was sent), so only defined keys are merged in.
      const definedConfig = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined));
      node.config = { ...node.config, ...definedConfig };

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async addNode(tenantId: string, flowId: string, type: IvrNodeType, afterNodeId: string | null): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const node: IvrNode = { ...NODE_TEMPLATES[type], id: randomUUID(), config: { ...NODE_TEMPLATES[type].config } };
      definition.nodes.splice(insertionIndex(definition.nodes, afterNodeId), 0, node);

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async deleteNode(tenantId: string, flowId: string, nodeId: string): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      if (definition.nodes.length <= 1) throw new BadRequestException('Cannot delete the only remaining node');
      const index = definition.nodes.findIndex((n) => n.id === nodeId);
      if (index === -1) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);

      definition.nodes.splice(index, 1);
      for (const n of definition.nodes) {
        if (n.nextId === nodeId) n.nextId = undefined;
        if (n.config.branches) {
          for (const [digit, target] of Object.entries(n.config.branches)) {
            if (target === nodeId) delete n.config.branches[digit];
          }
        }
      }

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async moveNode(tenantId: string, flowId: string, nodeId: string, afterNodeId: string | null): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const fromIndex = definition.nodes.findIndex((n) => n.id === nodeId);
      if (fromIndex === -1) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);

      const [node] = definition.nodes.splice(fromIndex, 1) as [IvrNode];
      definition.nodes.splice(insertionIndex(definition.nodes, afterNodeId), 0, node);

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async setNext(tenantId: string, flowId: string, nodeId: string, nextId: string | null): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const node = definition.nodes.find((n) => n.id === nodeId);
      if (!node) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);
      node.nextId = nextId ?? undefined;

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  /** menu nodes only — sets or clears a single DTMF digit's target node. */
  async setBranch(tenantId: string, flowId: string, nodeId: string, digit: string, nextId: string | null): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`IVR flow ${flowId} not found`);

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const node = definition.nodes.find((n) => n.id === nodeId);
      if (!node) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);
      if (node.type !== 'menu') throw new BadRequestException('Branches can only be set on menu nodes');

      const branches = { ...(node.config.branches ?? {}) };
      if (nextId === null) delete branches[digit];
      else branches[digit] = nextId;
      node.config = { ...node.config, branches };

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async publish(tenantId: string, flowId: string): Promise<IvrFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.agentFlow.update({ where: { id: flowId }, data: { status: 'published' } });
      return toDto(updated);
    });
  }

  /** Used by IvrFlowExecutionService / the Exotel webhook — null if the tenant has no published IVR flow with this name. */
  async findPublishedFlowByName(tenantId: string, name: string): Promise<AgentFlow | null> {
    return withTenant(this.prisma, tenantId, (tx) =>
      tx.agentFlow.findFirst({ where: { kind: 'ivr', status: 'published', name }, orderBy: { id: 'asc' } }),
    );
  }
}
