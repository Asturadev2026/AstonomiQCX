/**
 * API response types (contract with the backend — Plan §5).
 * These are TYPE definitions only; every VALUE comes from the API.
 */

// GET /api/v1/nav/counts
export interface NavCounts {
  inbox: number;
  mentions: number;
  slaAtRisk: number;
  agentsLive: number;
  unreadNotifications: number;
}

// GET /api/v1/me
export interface SessionUser {
  name: string;
  initials: string;
  title: string;
  tenantName: string;
}

// GET /api/v1/analytics/overview
export interface OverviewKpis {
  conversationsToday: number;
  conversationsTrendPct: number;
  aiResolvedPct: number;
  aiResolvedTrendPct: number;
  avgCsat: number;
  csatTrend: number;
  avgFirstResponseSecs: number;
  firstResponseTrendSecs: number;
}
export interface ChannelSplit {
  name: string;
  pct: number;
  color: string;
  icon: string;
}
export interface ResolutionMix {
  totalLabel: string;
  aiPct: number;
  agentPct: number;
  inProgressPct: number;
}
export interface OverviewPayload {
  kpis: OverviewKpis;
  channels: ChannelSplit[];
  resolution: ResolutionMix;
}

// GET /api/v1/activity/feed
export interface FeedItem {
  icon: string;
  iconClass: string; // b-green | b-amber | b-blue | b-sky | b-pink
  html: string; // server-sanitized rich text
  tag: 'res' | 'esc' | 'ai';
  time: string;
}
