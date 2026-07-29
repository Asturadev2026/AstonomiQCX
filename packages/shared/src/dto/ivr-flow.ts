/** Cloud Telephony — Call flow (IVR) visual flow builder. Same node-graph shape as Agent Builder's chat flows (@aq/db AgentFlow.kind = 'ivr'), see agent-flow.ts. */

export type IvrNodeType = 'play' | 'menu' | 'forward' | 'voicemail' | 'hangup';

export interface IvrNodeConfig {
  /** play / menu / voicemail: the prompt/greeting spoken to the caller. */
  message?: string;
  /** menu only: DTMF digit -> target node id, e.g. { "1": "<nodeId>", "2": "<nodeId>" }. */
  branches?: Record<string, string>;
  /** forward only: queue name, agent name, or phone number to route the call to. */
  forwardTo?: string;
}

export interface IvrNode {
  id: string;
  type: IvrNodeType;
  icon: string;
  badge: string; // CSS class suffix, e.g. 'b-blue'
  title: string;
  subtitle: string;
  config: IvrNodeConfig;
  /** Fallback next node (menu: used on timeout/invalid digit; others: linear fall-through). Unset = fall through in array order. */
  nextId?: string | null;
}

export interface IvrFlowDefinition {
  nodes: IvrNode[];
}

export interface IvrFlowDto {
  id: string;
  name: string | null;
  status: string;
  definition: IvrFlowDefinition;
}

export interface AddIvrNodeDto {
  type: IvrNodeType;
  /** Insert right after this node id, or at the very front when null. */
  afterNodeId: string | null;
}

export interface UpdateIvrNodeDto {
  config: IvrNodeConfig;
}

export interface MoveIvrNodeDto {
  /** Move the node to right after this node id, or to the very front when null. */
  afterNodeId: string | null;
}

export interface SetIvrNextDto {
  /** The node id to fall through to, or null to clear the override (fall through in order). */
  nextId: string | null;
}

export interface SetIvrBranchDto {
  /** Single DTMF digit, '0'-'9', '*' or '#'. */
  digit: string;
  /** The node id this digit routes to, or null to remove the branch. */
  nextId: string | null;
}
