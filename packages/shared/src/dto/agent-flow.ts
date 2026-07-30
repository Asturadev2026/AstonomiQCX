/** Guide §1.3/§12 — the no-code Agent Builder's flow graph and its real executor. */

export type FlowNodeType = 'trigger' | 'detect_intent' | 'fetch_data' | 'ask_question' | 'send_reply' | 'human_handoff';

export interface FlowNodeConfig {
  /** detect_intent: the intents Astra classifies into. */
  intents?: string[];
  /** ask_question: the clarifying question to ask when intent is ambiguous. */
  question?: string;
  /** ask_question: the choices offered alongside the question. */
  options?: string[];
  /** fetch_data: what to fetch — only 'latest_order' is implemented. */
  source?: string;
  /** fetch_data: for refund intent — an order counts as refund-eligible only if delivered within this many days. */
  refundWindowDays?: number;
  /** human_handoff: shown for context; escalation logic itself is fixed. */
  condition?: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  icon: string;
  badge: string; // CSS class suffix, e.g. 'b-blue'
  title: string;
  subtitle: string;
  config: FlowNodeConfig;
  /** Branching override: jump to this node id after this one instead of the next array element. Unset = fall through in order. */
  nextId?: string | null;
}

export interface AgentFlowDefinition {
  nodes: FlowNode[];
}

export interface AgentFlowDto {
  id: string;
  name: string | null;
  kind: string;
  status: string;
  definition: AgentFlowDefinition;
}

export interface UpdateFlowNodeDto {
  config: FlowNodeConfig;
}

export interface AddFlowNodeDto {
  type: FlowNodeType;
  /** Insert right after this node id, or at the very front when null. */
  afterNodeId: string | null;
}

export interface MoveFlowNodeDto {
  /** Move the node to right after this node id, or to the very front when null. */
  afterNodeId: string | null;
}

export interface SetNextNodeDto {
  /** The node id to jump to after this one, or null to clear the override (fall through in order). */
  nextId: string | null;
}
