import type { IvrMenuOptionDto } from '@aq/shared';

/**
 * The prototype's IVR menu — static reference config, not DB-persisted.
 * Unlike Automations/SLA's escalation matrix, there's no natural existing
 * table for this (and no edit UI in the prototype either — it's read-only
 * reference), so it lives in code, same treatment Priority Matrix's rules
 * will get. Still a real endpoint returning real, accurate content.
 */
export const IVR_MENU: IvrMenuOptionDto[] = [
  { key: '1', label: 'Order status & tracking', destination: 'Astra voice bot (self-serve)' },
  { key: '2', label: 'Payments, refunds & EMI', destination: 'Payments queue' },
  { key: '3', label: 'Delivery & logistics', destination: 'Logistics queue' },
  { key: '4', label: 'Returns & replacement', destination: 'Returns queue' },
  { key: '0', label: 'Talk to an agent', destination: 'Skills-based routing' },
  { key: '#', label: 'हिन्दी / regional language', destination: 'Language detected, routed' },
];
