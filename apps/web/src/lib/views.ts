/**
 * View registry — one entry per prototype `data-view`.
 * Titles/subtitles are UI copy (allowed in code, Plan §0.2).
 * Badge counts are NOT here — they come from useNavCounts() (no hardcoded data).
 */

export type NavGroup =
  | 'Operate'
  | 'AI Studio'
  | 'Service Ops'
  | 'Engage & Analyse'
  | 'Admin';

export interface ViewDef {
  id: string; // prototype data-view value = route path segment
  title: string;
  sub: string;
  group: NavGroup;
  /** key into NavCounts for the sidebar badge, if this item shows one */
  badge?: 'inbox' | 'mentions' | 'slaAtRisk';
}

export const VIEWS: ViewDef[] = [
  // Operate
  // "{tenant}" is interpolated with the session tenant name in Topbar — never hardcoded
  { id: 'overview', title: 'Command Centre', sub: 'Live view of every customer signal — {tenant}', group: 'Operate' },
  { id: 'inbox', title: 'Omni Inbox', sub: 'One thread per customer across WhatsApp, chat, email, voice & social', group: 'Operate', badge: 'inbox' },
  { id: 'convhub', title: 'Conversation Hub', sub: 'Everything said about you on Meta, LinkedIn & Google — bot replies, escalates, tickets', group: 'Operate', badge: 'mentions' },
  { id: 'tickets', title: 'Tickets Board', sub: 'Track every support case through to resolution', group: 'Operate' },
  // AI Studio
  { id: 'chatbot', title: 'AI Chatbot', sub: 'Astra — the customer-facing assistant', group: 'AI Studio' },
  { id: 'whatsapp', title: 'WhatsApp Bot', sub: 'Your highest-volume channel, automated', group: 'AI Studio' },
  { id: 'voice', title: 'Voice AI', sub: 'Astra takes calls, transcribes & summarises in real time', group: 'AI Studio' },
  { id: 'builder', title: 'Agent Builder', sub: 'Design AI agents with no code', group: 'AI Studio' },
  { id: 'automations', title: 'Automations', sub: 'Business rules that run on every ticket', group: 'AI Studio' },
  { id: 'kb', title: 'Knowledge Base', sub: "The brain behind Astra's answers", group: 'AI Studio' },
  { id: 'macros', title: 'Macros', sub: 'One-click canned responses', group: 'AI Studio' },
  // Service Ops
  { id: 'sla', title: 'SLA & Escalation', sub: 'Targets, adherence and the auto-escalation matrix', group: 'Service Ops', badge: 'slaAtRisk' },
  { id: 'departments', title: 'Departments', sub: 'Team hierarchy, heads and live department load', group: 'Service Ops' },
  { id: 'workforce', title: 'Workforce', sub: 'Live agent status, roster and forecast', group: 'Service Ops' },
  { id: 'contactcentre', title: 'Contact Centre', sub: 'IVR, live call queue and supervisor monitoring', group: 'Service Ops' },
  { id: 'telephony', title: 'Cloud Telephony', sub: 'Numbers, IVR, live console, masking & call records — end to end', group: 'Service Ops' },
  { id: 'fieldservice', title: 'Field Service', sub: 'On-site visits, installs & warranty repairs', group: 'Service Ops' },
  { id: 'priomatrix', title: 'Priority Matrix', sub: 'How urgency × impact sets ticket priority', group: 'Service Ops' },
  // Engage & Analyse
  { id: 'campaigns', title: 'Campaigns', sub: 'Proactively reach customers on WhatsApp', group: 'Engage & Analyse' },
  { id: 'surveys', title: 'Surveys & VoC', sub: 'CSAT, NPS, CES and the voice of the customer', group: 'Engage & Analyse' },
  { id: 'journey', title: 'Customer Journey', sub: 'The full lifecycle, touchpoints and friction', group: 'Engage & Analyse' },
  { id: 'customer', title: 'Customer 360', sub: 'The full story of one customer, in one place', group: 'Engage & Analyse' },
  { id: 'portal', title: 'Self-Service Portal', sub: 'The customer-facing help centre', group: 'Engage & Analyse' },
  { id: 'qa', title: 'Auto QA', sub: 'Every interaction scored — no sampling', group: 'Engage & Analyse' },
  { id: 'analytics', title: 'Analytics', sub: 'Trends, cost savings and SLA performance', group: 'Engage & Analyse' },
  // Admin
  { id: 'audit', title: 'Audit Log', sub: 'Who did what, and when', group: 'Admin' },
  { id: 'billing', title: 'Billing & Plans', sub: 'Subscription, usage and invoices', group: 'Admin' },
  { id: 'settings', title: 'Team & Settings', sub: 'Manage your workspace', group: 'Admin' },
];

export const NAV_GROUPS: NavGroup[] = [
  'Operate',
  'AI Studio',
  'Service Ops',
  'Engage & Analyse',
  'Admin',
];

export function viewById(id: string): ViewDef | undefined {
  return VIEWS.find((v) => v.id === id);
}
