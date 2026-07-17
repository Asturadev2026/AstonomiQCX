import type { AgentFlowDefinition } from '@aq/shared';

/** The prototype's "Astra — Refund & Return agent" flow — Guide §1.3/§12. */
export const DEFAULT_FLOW_DEFINITION: AgentFlowDefinition = {
  nodes: [
    {
      id: 'trigger',
      type: 'trigger',
      icon: '⚡',
      badge: 'b-blue',
      title: 'When customer messages',
      subtitle: 'Trigger · any channel',
      config: {},
    },
    {
      id: 'detect_intent',
      type: 'detect_intent',
      icon: '🧠',
      badge: 'b-indigo',
      title: 'Detect intent',
      subtitle: 'refund · return · track · other',
      config: { intents: ['refund', 'return', 'track', 'other'] },
    },
    {
      id: 'fetch_data',
      type: 'fetch_data',
      icon: '🔗',
      badge: 'b-sky',
      title: 'Fetch order details',
      subtitle: 'from Order Management API',
      config: { source: 'latest_order' },
    },
    {
      id: 'ask_question',
      type: 'ask_question',
      icon: '❓',
      badge: 'b-amber',
      title: 'Ask: refund or exchange?',
      subtitle: 'quick-reply buttons',
      config: { question: 'Would you like a refund or an exchange?', options: ['Refund', 'Exchange'] },
    },
    {
      id: 'send_reply',
      type: 'send_reply',
      icon: '💬',
      badge: 'b-green',
      title: 'Confirm & send resolution',
      subtitle: 'personalised reply',
      config: {},
    },
    {
      id: 'human_handoff',
      type: 'human_handoff',
      icon: '🙋',
      badge: 'b-pink',
      title: 'Escalate if unhappy',
      subtitle: 'sentiment < negative',
      config: { condition: 'sentiment negative or customer asks for a human' },
    },
  ],
};
