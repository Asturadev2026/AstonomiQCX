import type { Priority } from '@aq/shared';

export type Level = 'high' | 'medium' | 'low';

// Priority Matrix (urgency × impact) — Guide §8.3. Exported so the Priority
// Matrix screen can render the real matrix instead of a re-typed copy.
export const MATRIX: Record<Level, Record<Level, Priority>> = {
  high: { low: 'p2', medium: 'p1', high: 'p1' },
  medium: { low: 'p3', medium: 'p2', high: 'p1' },
  low: { low: 'p4', medium: 'p3', high: 'p2' },
};

// Named + exported for the same reason — the classification keywords, not just the matrix.
export const HIGH_URGENCY_KEYWORDS = ['outage', 'not working', 'fraud', 'double charge', 'failed payment', 'locked'];
export const MEDIUM_URGENCY_KEYWORDS = ['delay', 'stuck', 'wrong', 'damaged', 'refund'];
export const HIGH_IMPACT_KEYWORDS = ['many', 'everyone', 'all users'];

const PRIORITY_ORDER: Priority[] = ['p4', 'p3', 'p2', 'p1'];

/** Decides a ticket's priority from the words used and the customer's segment. */
export function priorityFromMatrix(input: { text?: string; segment?: string | null }): Priority {
  const text = (input.text || '').toLowerCase();

  const urgency: Level = new RegExp(HIGH_URGENCY_KEYWORDS.join('|')).test(text)
    ? 'high'
    : new RegExp(MEDIUM_URGENCY_KEYWORDS.join('|')).test(text)
      ? 'medium'
      : 'low';

  const isTopSegment = input.segment === 'premium' || input.segment === 'vip';
  const impact: Level = isTopSegment || new RegExp(HIGH_IMPACT_KEYWORDS.join('|')).test(text) ? 'high' : 'medium';

  let priority = MATRIX[urgency][impact];
  // Premium/VIP customers get bumped up one level.
  if (isTopSegment && priority !== 'p1') {
    priority = PRIORITY_ORDER[Math.min(3, PRIORITY_ORDER.indexOf(priority) + 1)]!;
  }
  return priority;
}
