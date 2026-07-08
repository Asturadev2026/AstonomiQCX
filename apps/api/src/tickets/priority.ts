import type { Priority } from '@aq/shared';

type Level = 'high' | 'medium' | 'low';

// Priority Matrix (urgency × impact) — Guide §8.3.
const MATRIX: Record<Level, Record<Level, Priority>> = {
  high: { low: 'p2', medium: 'p1', high: 'p1' },
  medium: { low: 'p3', medium: 'p2', high: 'p1' },
  low: { low: 'p4', medium: 'p3', high: 'p2' },
};

const PRIORITY_ORDER: Priority[] = ['p4', 'p3', 'p2', 'p1'];

/** Decides a ticket's priority from the words used and the customer's segment. */
export function priorityFromMatrix(input: { text?: string; segment?: string | null }): Priority {
  const text = (input.text || '').toLowerCase();

  const urgency: Level = /outage|not working|fraud|double charge|failed payment|locked/.test(text)
    ? 'high'
    : /delay|stuck|wrong|damaged|refund/.test(text)
      ? 'medium'
      : 'low';

  const isTopSegment = input.segment === 'premium' || input.segment === 'vip';
  const impact: Level = isTopSegment || /many|everyone|all users/.test(text) ? 'high' : 'medium';

  let priority = MATRIX[urgency][impact];
  // Premium/VIP customers get bumped up one level.
  if (isTopSegment && priority !== 'p1') {
    priority = PRIORITY_ORDER[Math.min(3, PRIORITY_ORDER.indexOf(priority) + 1)]!;
  }
  return priority;
}
