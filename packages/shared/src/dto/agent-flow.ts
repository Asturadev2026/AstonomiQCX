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
