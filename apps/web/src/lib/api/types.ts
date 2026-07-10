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

// POST /api/v1/ai/ask
export interface AskAstraPayload {
  question: string;
  language?: string;
}

export interface AstraAnswer {
  answer: string | null;
  escalate: boolean;
  configured: boolean;
  sources: string[];
  ticketRef: string | null;
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

// GET /api/v1/journey
export interface JourneyStageMetric {
  label: string;
  value: string;
}
export interface JourneyStage {
  name: string;
  icon: string;
  color: string;
  description: string;
  metrics: JourneyStageMetric[];
}
export interface FrictionPoint {
  label: string;
  pct: number;
  color: string;
}
export interface ProactiveNudge {
  trigger: string;
  status: 'live' | 'draft';
}
export interface JourneyPayload {
  stages: JourneyStage[];
  friction: FrictionPoint[];
  nudges: ProactiveNudge[];
}

// GET /api/v1/qa/summary
export interface QaKpis {
  autoAuditedPct: number;
  avgScore: number;
  csatDeltaPct: number;
  flaggedCount: number;
}
export interface QaAuditRow {
  agentLabel: string;
  customerName: string;
  score: number;
  scoreClass: 'qa-hi' | 'qa-mid' | 'qa-lo';
  category: string;
  empathy: string;
  resolution: string;
}
export interface LeaderboardEntry {
  rank: number;
  name: string;
  initials: string;
  avatarColor: string;
  title: string;
  resolvedCount: number;
  avgScore: number;
}
export interface IntentBar {
  label: string;
  pct: number;
  color: string;
}
export interface QaPayload {
  kpis: QaKpis;
  recentAudits: QaAuditRow[];
  leaderboard: LeaderboardEntry[];
  intents: IntentBar[];
}

// GET /api/v1/analytics/detail
export interface AnalyticsKpis {
  conversations30d: number;
  costSavedLabel: string;
  avgHandleTimeLabel: string;
  slaMetPct: number;
}
export interface TrendPoint {
  label: string;
  total: number;
  aiResolved: number;
}
export interface ChannelCsat {
  label: string;
  avg: number;
  color: string;
}
export interface HourBar {
  label: string;
  pct: number;
}
export interface LanguageSplit {
  label: string;
  pct: number;
  color: string;
}
export interface AnalyticsPayload {
  kpis: AnalyticsKpis;
  trend: TrendPoint[];
  csatByChannel: ChannelCsat[];
  hourBars: HourBar[];
  languages: LanguageSplit[];
  heat: number[];
}

// GET /api/v1/portal/summary
export interface PortalCategory {
  icon: string;
  label: string;
  articleCount: number;
}
export interface LatestOrderStatus {
  extRef: string;
  status: string;
}
export interface PortalPayload {
  categories: PortalCategory[];
  latestOrder: LatestOrderStatus | null;
}

// GET /api/v1/campaigns/summary, POST /api/v1/campaigns
export type AudienceId = 'gold' | 'abandoned_cart' | 'festive';
export interface CampaignAudience {
  id: AudienceId;
  icon: string;
  iconClass: string;
  label: string;
  description: string;
  count: number;
  sampleName: string;
  defaultMessage: string;
}
export interface RecentCampaign {
  id: string;
  name: string;
  metricLabel: string;
}
export interface CampaignsPayload {
  audiences: CampaignAudience[];
  recent: RecentCampaign[];
}
export interface SendCampaignDto {
  audienceId: AudienceId;
  message: string;
}

// GET /api/v1/surveys/summary
export interface CsatSummary {
  avg: number;
  deltaVsPrevMonth: number;
  responseCount: number;
}
export interface NpsSummary {
  score: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
}
export interface CesSummary {
  avg: number;
  deltaVsPrevMonth: number;
}
export interface CsatTrendPoint {
  label: string;
  avg: number;
}
export interface VocTheme {
  label: string;
  pct: number;
  color: string;
}
export interface RecentSurveyResponse {
  contactName: string;
  score: number;
  channel: string | null;
  comment: string | null;
}
export interface SurveysPayload {
  csat: CsatSummary;
  nps: NpsSummary;
  ces: CesSummary;
  trend: CsatTrendPoint[];
  themes: VocTheme[];
  recent: RecentSurveyResponse[];
}

// GET /api/v1/activity/feed
export interface FeedItem {
  icon: string;
  iconClass: string; // b-green | b-amber | b-blue | b-sky | b-pink
  html: string; // server-sanitized rich text
  tag: 'res' | 'esc' | 'ai';
  time: string;
}

// POST /api/v1/contacts — request/response shapes mirror
// @aq/shared's CreateContactDto/ContactDto (Guide §10 pattern).
export type { ContactConsentDto, ContactDto, CreateContactDto, CreateContactOrderDto } from '@aq/shared';

// GET /api/v1/contacts/latest, GET /api/v1/contacts/:id — Customer 360 profile card.
export interface ContactProfile {
  id: string;
  name: string;
  location: string | null;
  memberSince: string; // ISO date
  orderCount: number;
  lifetimeValue: number;
  loyaltyTier: string | null;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  preferredChannel: string | null;
  openTickets: number;
}

// GET /api/v1/contacts/:id/orders
export interface ContactOrder {
  id: string;
  extRef: string | null;
  description: string | null;
  amount: number | null;
  status: string | null; // delivered | in_transit | refunded
  createdAt: string;
}

// GET /api/v1/contacts/:id/tickets
export interface ContactTicket {
  id: string;
  extRef: string | null;
  subject: string;
  channel: string | null;
  status: string;
  createdAt: string;
}

// GET /api/v1/contacts/:id/timeline — last 6 months, sentiment mix per month.
export interface SentimentMonth {
  label: string;
  pos: number;
  neu: number;
  neg: number;
  dominant: 'pos' | 'neu' | 'neg' | null;
}
