import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPrisma, withTenant, type AgentFlow } from '@aq/db';
import type { AgentFlowDefinition, AgentFlowDto, FlowNode, FlowNodeConfig, FlowNodeType } from '@aq/shared';
import { DEFAULT_FLOW_DEFINITION } from './default-flow';

/** null = insert at the very front; otherwise right after the node with that id (falls back to the end if it's not found). */
function insertionIndex(nodes: FlowNode[], afterNodeId: string | null): number {
  if (afterNodeId === null) return 0;
  const afterIndex = nodes.findIndex((n) => n.id === afterNodeId);
  return afterIndex === -1 ? nodes.length : afterIndex + 1;
}

function toDto(flow: AgentFlow): AgentFlowDto {
  return {
    id: flow.id,
    name: flow.name,
    kind: flow.kind,
    status: flow.status,
    definition: flow.definition as unknown as AgentFlowDefinition,
  };
}

/** Defaults for a freshly dragged-in block — mirrors the palette's icons/badges/labels. */
const NODE_TEMPLATES: Record<FlowNodeType, Omit<FlowNode, 'id' | 'nextId'>> = {
  trigger: {
    type: 'trigger',
    icon: '⚡',
    badge: 'b-blue',
    title: 'When customer messages',
    subtitle: 'Trigger · any channel',
    config: {},
  },
  detect_intent: {
    type: 'detect_intent',
    icon: '🧠',
    badge: 'b-indigo',
    title: 'Detect intent',
    subtitle: 'classify the message',
    config: { intents: ['other'] },
  },
  fetch_data: {
    type: 'fetch_data',
    icon: '🔗',
    badge: 'b-sky',
    title: 'Fetch order details',
    subtitle: 'from Order Management API',
    config: { source: 'latest_order', refundWindowDays: 7 },
  },
  ask_question: {
    type: 'ask_question',
    icon: '❓',
    badge: 'b-amber',
    title: 'Ask a question',
    subtitle: 'quick-reply buttons',
    config: { question: '', options: [] },
  },
  send_reply: {
    type: 'send_reply',
    icon: '💬',
    badge: 'b-green',
    title: 'Send reply',
    subtitle: 'personalised reply',
    config: {},
  },
  human_handoff: {
    type: 'human_handoff',
    icon: '🙋',
    badge: 'b-pink',
    title: 'Human handoff',
    subtitle: 'escalate to a human',
    config: { condition: '' },
  },
};

/** Real persistence for the Agent Builder's flow graph — Guide §1.3/§12. */
@Injectable()
export class AgentFlowService {
  /**
   * Short-lived in-process cache for the published chat flow. Each message from
   * Chatbot/WhatsApp/Voice calls findPublishedChatFlow(); without a cache that's
   * one full withTenant() transaction (~1 s from India → us-east-1) per message.
   * 30-second TTL is far shorter than any human can notice, but long enough to
   * serve a burst of messages in a single conversation from one fetch.
   * Cache is invalidated immediately when publish() is called.
   */
  private readonly flowCache = new Map<string, { flow: AgentFlow | null; expiresAt: number }>();
  private readonly FLOW_CACHE_TTL_MS = 30_000;
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
      // class-transformer's @Type() instantiates every declared field on the
      // incoming DTO, including ones the caller didn't set — those come
      // through as explicit `undefined` own properties. Spreading that
      // directly over the existing config would silently overwrite fields
      // the caller never touched (e.g. wiping fetch_data's `source` when only
      // `refundWindowDays` was sent), so only defined keys are merged in.
      const definedConfig = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined));
      node.config = { ...node.config, ...definedConfig };

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async addNode(tenantId: string, flowId: string, type: FlowNodeType, afterNodeId: string | null): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`Agent flow ${flowId} not found`);

      const definition = flow.definition as unknown as AgentFlowDefinition;
      const node: FlowNode = { ...NODE_TEMPLATES[type], id: randomUUID() };
      definition.nodes.splice(insertionIndex(definition.nodes, afterNodeId), 0, node);

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async deleteNode(tenantId: string, flowId: string, nodeId: string): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`Agent flow ${flowId} not found`);

      const definition = flow.definition as unknown as AgentFlowDefinition;
      if (definition.nodes.length <= 1) throw new BadRequestException('Cannot delete the only remaining node');
      const index = definition.nodes.findIndex((n) => n.id === nodeId);
      if (index === -1) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);

      definition.nodes.splice(index, 1);
      for (const n of definition.nodes) {
        if (n.nextId === nodeId) n.nextId = undefined;
      }

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async moveNode(tenantId: string, flowId: string, nodeId: string, afterNodeId: string | null): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`Agent flow ${flowId} not found`);

      const definition = flow.definition as unknown as AgentFlowDefinition;
      const fromIndex = definition.nodes.findIndex((n) => n.id === nodeId);
      if (fromIndex === -1) throw new NotFoundException(`Node ${nodeId} not found in flow ${flowId}`);

      const [node] = definition.nodes.splice(fromIndex, 1) as [FlowNode];
      definition.nodes.splice(insertionIndex(definition.nodes, afterNodeId), 0, node);

      const updated = await tx.agentFlow.update({
        where: { id: flowId },
        data: { definition: definition as object },
      });
      return toDto(updated);
    });
  }

  async setNext(tenantId: string, flowId: string, nodeId: string, nextId: string | null): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const flow = await tx.agentFlow.findUnique({ where: { id: flowId } });
      if (!flow) throw new NotFoundException(`Agent flow ${flowId} not found`);

      const definition = flow.definition as unknown as AgentFlowDefinition;
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

  async publish(tenantId: string, flowId: string): Promise<AgentFlowDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.agentFlow.update({ where: { id: flowId }, data: { status: 'published' } });
      // Invalidate immediately so the very next message sees the new flow.
      this.flowCache.delete(tenantId);
      return toDto(updated);
    });
  }

  /**
   * Used by AiService and FlowExecutionService on every incoming message.
   * Results are cached per-tenant for FLOW_CACHE_TTL_MS to eliminate a full
   * withTenant() round-trip (~1 s from India → us-east-1) on the hot path.
   */
  async findPublishedChatFlow(tenantId: string): Promise<AgentFlow | null> {
    const cached = this.flowCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.flow;
    }
    const flow = await withTenant(this.prisma, tenantId, (tx) =>
      tx.agentFlow.findFirst({ where: { kind: 'chat', status: 'published' }, orderBy: { id: 'asc' } }),
    );
    this.flowCache.set(tenantId, { flow, expiresAt: Date.now() + this.FLOW_CACHE_TTL_MS });
    return flow;
  }
}
