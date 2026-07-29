import { Injectable } from '@nestjs/common';
import type { IvrFlowDefinition, IvrNode } from '@aq/shared';

export type IvrStep =
  | { kind: 'gather'; say: string[]; waitingNodeId: string }
  | { kind: 'forward'; say: string[]; forwardTo: string }
  | { kind: 'voicemail'; say: string[] }
  | { kind: 'hangup'; say: string[] };

// Guards a misconfigured flow (e.g. a menu branch pointing back at an earlier
// play node) from looping forever within one webhook round-trip.
const MAX_STEPS_PER_TURN = 20;

/**
 * Real routing logic for a published IVR flow — advances through consecutive
 * play nodes (collecting what to say) until it hits a decision point (menu)
 * or a terminal action (forward/voicemail/hangup), mirroring how
 * FlowExecutionService walks a chat flow's nextId chain. Pure/stateless: the
 * caller (ExotelWebhookController) is responsible for remembering
 * `waitingNodeId` between one webhook hit and the next (a call is a
 * multi-turn conversation across several HTTP requests, unlike a chat
 * message which resolves in one).
 */
export function resolveIvrStep(definition: IvrFlowDefinition, currentNodeId: string | null, digit?: string): IvrStep {
  const byId = new Map(definition.nodes.map((n) => [n.id, n]));
  const fallThrough = (node: IvrNode): IvrNode | undefined => {
    if (node.nextId) return byId.get(node.nextId);
    return definition.nodes[definition.nodes.indexOf(node) + 1];
  };

  let node: IvrNode | undefined = (currentNodeId && byId.get(currentNodeId)) || definition.nodes[0];
  if (!node) return { kind: 'hangup', say: [] };

  // Resuming at a menu we already prompted — resolve the caller's digit before continuing.
  if (node.type === 'menu' && digit !== undefined) {
    const branchTarget = node.config.branches?.[digit];
    const resolved = branchTarget ? byId.get(branchTarget) : undefined;
    node = resolved ?? fallThrough(node) ?? node; // invalid digit with no fallback -> re-prompt the same menu
  }

  const say: string[] = [];
  for (let steps = 0; steps < MAX_STEPS_PER_TURN; steps++) {
    if (!node) return { kind: 'hangup', say };

    switch (node.type) {
      case 'play': {
        if (node.config.message) say.push(node.config.message);
        node = fallThrough(node);
        continue;
      }
      case 'menu': {
        if (node.config.message) say.push(node.config.message);
        return { kind: 'gather', say, waitingNodeId: node.id };
      }
      case 'forward': {
        return { kind: 'forward', say, forwardTo: node.config.forwardTo ?? '' };
      }
      case 'voicemail': {
        if (node.config.message) say.push(node.config.message);
        return { kind: 'voicemail', say };
      }
      case 'hangup': {
        return { kind: 'hangup', say };
      }
    }
  }
  return { kind: 'hangup', say };
}

/**
 * Tracks which node each in-progress call is waiting at, between one Exotel
 * webhook hit and the next. Deliberately in-memory (same "shallow, no queue/
 * durable-state engine" level as CampaignsService) — an in-flight call's
 * position is lost on a server restart, which just ends that one call at the
 * next digit press; acceptable for this app's scale, and avoids a second
 * schema migration for what is genuinely transient per-call state.
 */
@Injectable()
export class IvrFlowExecutionService {
  private waitingNodeByCallSid = new Map<string, string>();

  step(definition: IvrFlowDefinition, callSid: string, digit?: string): IvrStep {
    const currentNodeId = this.waitingNodeByCallSid.get(callSid) ?? null;
    const result = resolveIvrStep(definition, currentNodeId, digit);
    if (result.kind === 'gather') this.waitingNodeByCallSid.set(callSid, result.waitingNodeId);
    else this.waitingNodeByCallSid.delete(callSid);
    return result;
  }
}
