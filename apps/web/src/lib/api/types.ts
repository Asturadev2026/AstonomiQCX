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

// GET /api/v1/conversations?channel=
export interface ConversationSummary {
  id: string;
  contactName: string;
  initials: string;
  avatarColor: string;
  channel: string;
  preview: string;
  time: string;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  status: string;
}

// GET /api/v1/conversations/:id
export interface ThreadMessage {
  role: 'cust' | 'bot' | 'agent';
  text: string;
  time: string;
  sources?: string[];
}
export interface ConversationThread {
  id: string;
  contactName: string;
  initials: string;
  avatarColor: string;
  channel: string;
  location: string | null;
  phone: string | null;
  linkedOrderRef: string | null;
  status: string;
  assignedUserId: string | null;
  messages: ThreadMessage[];
  copilot: {
    sentiment: 'pos' | 'neu' | 'neg' | null;
    suggestions: string[];
    kbArticles: string[];
    configured: boolean;
    nextBestActions: string[];
  };
}

// POST /api/v1/conversations/:id/messages
export type { ReplyMessageDto } from '@aq/shared';

// GET /api/v1/tickets, POST /api/v1/tickets, PATCH /api/v1/tickets/:id/move
export type { CreateTicketDto, MoveTicketDto } from '@aq/shared';
export interface TicketRow {
  id: string;
  extRef: string | null;
  subject: string;
  priority: 'p1' | 'p2' | 'p3' | 'p4';
  status: 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  contact: { name: string | null } | null;
  assignedUser: { name: string; avatarColor: string | null } | null;
  createdAt: string;
}

// GET /api/v1/mentions/summary?group=
export interface ConvHubKpis {
  mentionsThisWeek: number;
  autoRepliedPct: number;
  escalatedCount: number;
  ticketsCreatedCount: number;
}
export interface MentionCard {
  id: string;
  source: string;
  authorName: string;
  authorHandle: string | null;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  time: string;
  tough: boolean;
  body: string;
  tags: string[];
  botReply: string | null;
  stage: 'detected' | 'bot_replied' | 'escalated' | 'ticket';
  ticketRef: string | null;
}
export interface ConvHubPayload {
  kpis: ConvHubKpis;
  mentions: MentionCard[];
}

// POST /api/v1/ai/ask
export interface AskAstraPayload {
  question: string;
  language?: string;
  channel?: 'chat' | 'whatsapp' | 'voice';
  contactId?: string;
}

// GET /api/v1/contacts?q= — "test as this customer" picker (Chatbot/WhatsApp/Voice AI).
export interface ContactOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AstraAnswer {
  answer: string | null;
  escalate: boolean;
  configured: boolean;
  sources: string[];
  ticketRef: string | null;
  clarifying?: boolean;
  /** IDs of the flow's nodes actually executed for this reply, in order — used by Agent Builder's Test panel to trace the run on canvas. */
  visitedNodeIds?: string[];
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
  id: string;
  agentLabel: string;
  customerName: string;
  score: number;
  scoreClass: 'qa-hi' | 'qa-mid' | 'qa-lo';
  category: string;
  empathy: string;
  resolution: string;
  flagged: boolean;
  createdAt: string;
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

// GET /api/v1/orders/:extRef — Self-Service Portal order tracking (public, no login)
export interface PublicOrderStatus {
  extRef: string;
  description: string | null;
  qty: number;
  amount: number | null;
  status: string | null;
  createdAt: string;
}

// GET /api/v1/tickets/by-ref/:extRef — Self-Service Portal ticket tracking (public, no login)
export interface PublicTicketStatus {
  extRef: string | null;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

// POST /api/v1/orders/:extRef/return — Self-Service Portal return/refund request (public, no login)
export interface ReturnRequestResult {
  ticketExtRef: string | null;
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
export type { OrderStatus } from '@aq/shared';

// POST /api/v1/contacts/:id/orders — Customer test panel (Chatbot/WhatsApp/Voice AI).
export type { AddContactOrderDto as AddContactOrderPayload } from '@aq/shared';

// GET/POST /api/v1/tenants, PATCH /api/v1/tenants/:id/status — login workspace
// picker + Tenants admin page.
export type { TenantDto } from '@aq/shared';
export type { CreateTenantDto as CreateTenantPayload } from '@aq/shared';
export type { UpdateTenantStatusDto as UpdateTenantStatusPayload } from '@aq/shared';

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

// GET /api/v1/agent-flows/active, POST /api/v1/agent-flows/:id/nodes/:nodeId, POST /api/v1/agent-flows/:id/publish
export type { AgentFlowDto, FlowNode, FlowNodeConfig, FlowNodeType, UpdateFlowNodeDto } from '@aq/shared';

// POST /api/v1/agent-flows/:id/nodes, /:nodeId/delete, /:nodeId/move, /:nodeId/next
export type { AddFlowNodeDto, MoveFlowNodeDto, SetNextNodeDto } from '@aq/shared';

// GET /api/v1/rules, PATCH /api/v1/rules/:id/toggle
export type { RuleAction, RuleCondition, RuleConditions, RuleDto } from '@aq/shared';

// GET /api/v1/kb, POST /api/v1/kb, PATCH /api/v1/kb/:id/view
export type { CreateKbArticleDto, UpdateKbArticleDto } from '@aq/shared';
export interface KbArticle {
  id: string;
  title: string;
  body: string;
  category: string | null;
  language: string;
  status: string;
  views: number;
  citedCount: number;
  createdAt: string;
  updatedAt: string;
}

// GET /api/v1/macros, POST /api/v1/macros, PATCH /api/v1/macros/:id/use
export type { CreateMacroDto, MacroDto } from '@aq/shared';

// GET /api/v1/sla/policies, /sla/kpis, /sla/scorecard, /sla/breaches, /sla/escalation-matrix
export type { EscalationLevelDto, SlaBreachRow, SlaKpis, SlaPolicyDto, SlaScorecardRow } from '@aq/shared';

// GET /api/v1/departments
export type { AgentStatus, DepartmentCardDto, DepartmentExecDto } from '@aq/shared';

// GET /api/v1/workforce/board, /workforce/roster
export type { RosterRowDto, WorkforceBoardDto, WorkforcePersonDto, WorkforceRosterDto, WorkforceStatusCounts } from '@aq/shared';

// GET /api/v1/contact-centre/kpis, /contact-centre/ivr-menu
export type { ContactCentreKpis, IvrMenuOptionDto } from '@aq/shared';

// GET /api/v1/telephony/*, POST /api/v1/telephony/test-call, /telephony/numbers
export type {
  BridgeCallDto,
  BridgeCallResultDto,
  CallWorkflowStepDto,
  CdrRowDto,
  CreateDialerCampaignDto,
  CreateNumberDidDto,
  DialerCampaignDto,
  LiveCallDto,
  NumberDidDto,
  SendTestCallDto,
  TelephonyIntegrationStatus,
  TelephonyKpis,
  TestCallResultDto,
} from '@aq/shared';

// GET /api/v1/telephony/ivr/active, POST /api/v1/telephony/ivr/:id/nodes, /:nodeId, /:nodeId/delete, /:nodeId/move, /:nodeId/next, /:nodeId/branch, /:id/publish
export type {
  AddIvrNodeDto,
  IvrFlowDto,
  IvrNode,
  IvrNodeConfig,
  IvrNodeType,
  MoveIvrNodeDto,
  SetIvrBranchDto,
  SetIvrNextDto,
  UpdateIvrNodeDto,
} from '@aq/shared';

// GET /api/v1/field-service/kpis, /field-service/visits
export type { FieldServiceKpis, ServiceVisitDto } from '@aq/shared';

// GET /api/v1/priority-matrix
export type { PriorityLevelInfoDto, PriorityMatrixCellDto, PriorityMatrixDto } from '@aq/shared';

// GET /api/v1/audit
export type { AuditLogRow } from '@aq/shared';

// GET /api/v1/billing/overview
export type { BillingPayload, InvoiceRow, PlanCard, UsageMeter } from '@aq/shared';

// GET /api/v1/settings, PATCH /api/v1/settings/toggles/:key, POST /api/v1/settings/invites
export type { CreateInviteDto, IntegrationCard, InviteDto, SettingsPayload, SettingsToggles, TeamMemberRow } from '@aq/shared';
