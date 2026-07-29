import type { IvrFlowDefinition } from '@aq/shared';

/**
 * Minimal starting point for a freshly created IVR flow: greet, then hang up.
 * `welcome` deliberately leaves `nextId` unset rather than pointing it at
 * `hangup` explicitly — an explicit nextId is a hard override that bypasses
 * array order, so a node later dragged in between (e.g. a menu) would
 * silently never run unless the override were also manually repointed. With
 * nextId unset, execution just falls through to whatever the next array
 * element is, which is exactly "hangup" today and the newly-inserted node
 * once someone adds one — no relinking needed for the common case.
 */
export const DEFAULT_IVR_FLOW_DEFINITION: IvrFlowDefinition = {
  nodes: [
    {
      id: 'welcome',
      type: 'play',
      icon: '🔊',
      badge: 'b-blue',
      title: 'Play welcome message',
      subtitle: 'greeting',
      config: { message: 'Thank you for calling. Please hold while we connect you.' },
    },
    {
      id: 'hangup',
      type: 'hangup',
      icon: '📴',
      badge: 'b-pink',
      title: 'Hang up',
      subtitle: 'end call',
      config: {},
    },
  ],
};
