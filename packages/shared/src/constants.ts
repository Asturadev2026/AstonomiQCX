/**
 * Enum DEFINITIONS shared by frontend + backend.
 * Per Implementation Plan §0.2 these may live in code; any business DATA
 * (records, counts, metrics) must come from the database.
 */

export const PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = [
  'new',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CHANNELS = [
  'whatsapp',
  'chat',
  'email',
  'voice',
  'instagram',
  'facebook',
  'x',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const MENTION_SOURCES = [
  'facebook',
  'instagram',
  'whatsapp',
  'linkedin',
  'google',
  'x',
] as const;
export type MentionSource = (typeof MENTION_SOURCES)[number];

export const MENTION_STAGES = [
  'detected',
  'bot_replied',
  'escalated',
  'ticket',
] as const;
export type MentionStage = (typeof MENTION_STAGES)[number];

export const SENTIMENTS = ['pos', 'neu', 'neg'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SENDER_TYPES = ['customer', 'bot', 'agent'] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export const AGENT_STATUSES = [
  'available',
  'on_call',
  'on_break',
  'offline',
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const DEFAULT_ROLES = [
  'Admin',
  'Manager',
  'TeamLead',
  'Agent',
  'QA',
  'Viewer',
] as const;
export type RoleName = (typeof DEFAULT_ROLES)[number];

/**
 * Permission strings (Guide §8). Seeded onto roles.permissions (JSONB);
 * checked by PermissionsGuard via @Perms(...).
 */
export const PERMISSIONS = [
  // tickets
  'ticket.view.all',
  'ticket.view.assigned',
  'ticket.create',
  'ticket.move',
  'ticket.assign',
  // conversations
  'conversation.view',
  'conversation.reply',
  'conversation.assign',
  // sla
  'sla.view',
  'sla.edit',
  // kb / macros / flows / rules
  'kb.view',
  'kb.edit',
  'macro.use',
  'macro.edit',
  'flow.edit',
  'rule.edit',
  // admin
  'user.invite',
  'user.edit',
  'role.edit',
  'channel.connect',
  'settings.edit',
  'billing.view',
  'audit.view',
  // approvals & qa
  'refund.approve',
  'qa.view',
  'qa.audit',
  // analytics
  'analytics.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Human-ID prefixes used with nextRef() (Guide D.1). */
export const REF_PREFIXES = {
  ticket: 'AQ-T-',
  order: 'AQ-O-',
  invoice: 'AQ-INV-',
} as const;
