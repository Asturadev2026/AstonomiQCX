import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type {
  AgentFlowDto,
  AskAstraPayload,
  AstraAnswer,
  AnalyticsPayload,
  CallWorkflowStepDto,
  CampaignsPayload,
  CdrRowDto,
  ContactDto,
  ContactOrder,
  ContactProfile,
  ContactTicket,
  ConversationSummary,
  ConversationThread,
  ConvHubPayload,
  CreateContactDto,
  CreateKbArticleDto,
  CreateNumberDidDto,
  ContactCentreKpis,
  CreateMacroDto,
  CreateTicketDto,
  DepartmentCardDto,
  EscalationLevelDto,
  FeedItem,
  FieldServiceKpis,
  FlowNodeConfig,
  IvrMenuOptionDto,
  JourneyPayload,
  KbArticle,
  MacroDto,
  MentionCard,
  MoveTicketDto,
  NavCounts,
  NumberDidDto,
  OverviewPayload,
  PortalPayload,
  PriorityMatrixDto,
  QaPayload,
  RecentCampaign,
  RuleDto,
  SendTestCallDto,
  ServiceVisitDto,
  SlaBreachRow,
  SlaKpis,
  SlaPolicyDto,
  SlaScorecardRow,
  SendCampaignDto,
  SentimentMonth,
  SessionUser,
  SurveysPayload,
  TelephonyIntegrationStatus,
  TelephonyKpis,
  TestCallResultDto,
  ThreadMessage,
  TicketRow,
  WorkforceBoardDto,
  WorkforceRosterDto,
} from './types';

/**
 * Data hooks — the ONLY way components get data.
 * Every hook is a real HTTP call to /api/v1 (proxied to the NestJS API by
 * Vite, see vite.config.ts). There is no mock/fixture path: until the API
 * and database are running, hooks are in error state and components render
 * their loading/error UI. That is correct behaviour for a real application.
 */

// Dev-only stand-in for real subdomain routing (Guide §6.2): the Vite proxy
// strips the browser's real Host before forwarding to the API, so there is
// no subdomain for TenantMiddleware to read. Replace with the tenant from
// the logged-in session once login (Guide §7) is wired into the web app.
const DEV_TENANT_HEADER = { 'x-tenant': 'shopnova' };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { headers: DEV_TENANT_HEADER });
  if (!res.ok) {
    throw new Error(`GET /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

async function post<TBody, TResult>(path: string, payload: TBody): Promise<TResult> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...DEV_TENANT_HEADER },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`POST /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: TResult };
  return body.data
}

async function patch<TResult>(path: string): Promise<TResult> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'PATCH',
    headers: DEV_TENANT_HEADER,
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: TResult };
  return body.data;
}

async function postAction<TResult>(path: string): Promise<TResult> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: DEV_TENANT_HEADER,
  });
  if (!res.ok) {
    throw new Error(`POST /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: TResult };
  return body.data;
}

async function patchBody<TBody, TResult>(path: string, payload: TBody): Promise<TResult> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...DEV_TENANT_HEADER },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: TResult };
  return body.data;
}

export function useNavCounts() {
  return useQuery<NavCounts>({
    queryKey: ['nav', 'counts'],
    queryFn: () => api('/nav/counts'),
    refetchInterval: 30_000,
  });
}

export function useOverview() {
  return useQuery<OverviewPayload>({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api('/analytics/overview'),
  });
}

export function useJourney() {
  return useQuery<JourneyPayload>({
    queryKey: ['journey'],
    queryFn: () => api('/journey/summary'),
  });
}

export function useSurveys() {
  return useQuery<SurveysPayload>({
    queryKey: ['surveys'],
    queryFn: () => api('/surveys/summary'),
  });
}

export function useCampaigns() {
  return useQuery<CampaignsPayload>({
    queryKey: ['campaigns'],
    queryFn: () => api('/campaigns/summary'),
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();
  return useMutation<RecentCampaign, Error, SendCampaignDto>({
    mutationFn: (payload) => post('/campaigns', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function usePortal() {
  return useQuery<PortalPayload>({
    queryKey: ['portal'],
    queryFn: () => api('/portal/summary'),
  });
}

export function useQa() {
  return useQuery<QaPayload>({
    queryKey: ['qa'],
    queryFn: () => api('/qa/summary'),
  });
}

export function useAnalytics() {
  return useQuery<AnalyticsPayload>({
    queryKey: ['analytics', 'detail'],
    queryFn: () => api('/analytics/detail'),
  });
}

export function useActivityFeed() {
  return useQuery<FeedItem[]>({
    queryKey: ['activity', 'feed'],
    queryFn: () => api('/activity/feed'),
  });
}

export function useSessionUser() {
  return useQuery<SessionUser>({
    queryKey: ['session', 'user'],
    queryFn: () => api('/me'),
    staleTime: Infinity,
  });
}

export function useLatestContact() {
  return useQuery<ContactProfile>({
    queryKey: ['contacts', 'latest'],
    queryFn: () => api('/contacts/latest'),
  });
}

export function useContactOrders(contactId: string | undefined) {
  return useQuery<ContactOrder[]>({
    queryKey: ['contacts', contactId, 'orders'],
    queryFn: () => api(`/contacts/${contactId}/orders`),
    enabled: !!contactId,
  });
}

export function useContactTickets(contactId: string | undefined) {
  return useQuery<ContactTicket[]>({
    queryKey: ['contacts', contactId, 'tickets'],
    queryFn: () => api(`/contacts/${contactId}/tickets`),
    enabled: !!contactId,
  });
}

export function useContactTimeline(contactId: string | undefined) {
  return useQuery<SentimentMonth[]>({
    queryKey: ['contacts', contactId, 'timeline'],
    queryFn: () => api(`/contacts/${contactId}/timeline`),
    enabled: !!contactId,
  });
}

export function useConversations(channel?: string) {
  return useQuery<ConversationSummary[]>({
    queryKey: ['conversations', channel ?? 'all'],
    queryFn: () => api(`/conversations${channel ? `?channel=${channel}` : ''}`),
    refetchInterval: 15_000,
  });
}

export function useConversationThread(id: string | undefined) {
  return useQuery<ConversationThread>({
    queryKey: ['conversations', 'thread', id],
    queryFn: () => api(`/conversations/${id}`),
    enabled: !!id,
  });
}

function invalidateConversation(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: ['conversations', 'thread', id] });
  void queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
  void queryClient.invalidateQueries({ queryKey: ['nav', 'counts'] });
}

export function useSendReply(id: string) {
  const queryClient = useQueryClient();
  return useMutation<ThreadMessage, Error, string>({
    mutationFn: (text) => post(`/conversations/${id}/messages`, { text }),
    onSuccess: () => invalidateConversation(queryClient, id),
  });
}

export function useAssignToMe(id: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; assignedUserId: string }, Error, void>({
    mutationFn: () => patch(`/conversations/${id}/assign`),
    onSuccess: () => invalidateConversation(queryClient, id),
  });
}

export function useResolveConversation(id: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; status: string }, Error, void>({
    mutationFn: () => patch(`/conversations/${id}/resolve`),
    onSuccess: () => invalidateConversation(queryClient, id),
  });
}

export function useConvHub(group?: string) {
  return useQuery<ConvHubPayload>({
    queryKey: ['mentions', group ?? 'all'],
    queryFn: () => api(`/mentions/summary${group ? `?group=${group}` : ''}`),
    refetchInterval: 15_000,
  });
}

export function useEscalateMention() {
  const queryClient = useQueryClient();
  return useMutation<MentionCard, Error, string>({
    mutationFn: (id) => postAction(`/mentions/${id}/escalate`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mentions'] }),
  });
}

export function useCreateMentionTicket() {
  const queryClient = useQueryClient();
  return useMutation<MentionCard, Error, string>({
    mutationFn: (id) => postAction(`/mentions/${id}/ticket`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mentions'] });
      void queryClient.invalidateQueries({ queryKey: ['nav', 'counts'] });
    },
  });
}

export function useTickets() {
  return useQuery<TicketRow[]>({
    queryKey: ['tickets'],
    queryFn: () => api('/tickets'),
    refetchInterval: 15_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation<TicketRow, Error, CreateTicketDto>({
    mutationFn: (payload) => post('/tickets', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['nav', 'counts'] });
    },
  });
}

export function useMoveTicket() {
  const queryClient = useQueryClient();
  return useMutation<TicketRow, Error, { id: string; status: MoveTicketDto['status'] }>({
    mutationFn: ({ id, status }) => patchBody(`/tickets/${id}/move`, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation<ContactDto, Error, CreateContactDto>({
    mutationFn: (payload) => post('/contacts', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nav', 'counts'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts', 'latest'] });
    },
  });
}

export function useAskAstra() {
  return useMutation<AstraAnswer, Error, AskAstraPayload>({
    mutationFn: (payload) => post('/ai/ask', payload),
  });
}

export function useAgentFlow() {
  return useQuery<AgentFlowDto>({
    queryKey: ['agent-flows', 'active'],
    queryFn: () => api('/agent-flows/active'),
  });
}

export function useUpdateFlowNode() {
  const queryClient = useQueryClient();
  return useMutation<AgentFlowDto, Error, { flowId: string; nodeId: string; config: FlowNodeConfig }>({
    mutationFn: ({ flowId, nodeId, config }) => post(`/agent-flows/${flowId}/nodes/${nodeId}`, { config }),
    onSuccess: (data) => {
      queryClient.setQueryData(['agent-flows', 'active'], data);
    },
  });
}

export function usePublishFlow() {
  const queryClient = useQueryClient();
  return useMutation<AgentFlowDto, Error, { flowId: string }>({
    mutationFn: ({ flowId }) => post(`/agent-flows/${flowId}/publish`, {}),
    onSuccess: (data) => {
      queryClient.setQueryData(['agent-flows', 'active'], data);
    },
  });
}

export function useRules() {
  return useQuery<RuleDto[]>({
    queryKey: ['rules'],
    queryFn: () => api('/rules'),
  });
}

export function useToggleRule() {
  const queryClient = useQueryClient();
  return useMutation<RuleDto, Error, { id: string }>({
    mutationFn: ({ id }) => patch(`/rules/${id}/toggle`),
    onSuccess: (updated) => {
      queryClient.setQueryData<RuleDto[]>(['rules'], (rules) =>
        rules?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
  });
}

export function useKbArticles() {
  return useQuery<KbArticle[]>({
    queryKey: ['kb'],
    queryFn: () => api('/kb'),
  });
}

export function useCreateKbArticle() {
  const queryClient = useQueryClient();
  return useMutation<KbArticle, Error, CreateKbArticleDto>({
    mutationFn: (payload) => post('/kb', payload),
    onSuccess: (created) => {
      queryClient.setQueryData<KbArticle[]>(['kb'], (articles) => [created, ...(articles ?? [])]);
    },
  });
}

export function useIncrementKbView() {
  const queryClient = useQueryClient();
  return useMutation<KbArticle, Error, { id: string }>({
    mutationFn: ({ id }) => patch(`/kb/${id}/view`),
    onSuccess: (updated) => {
      queryClient.setQueryData<KbArticle[]>(['kb'], (articles) =>
        articles?.map((a) => (a.id === updated.id ? updated : a)),
      );
    },
  });
}

export function useMacros() {
  return useQuery<MacroDto[]>({
    queryKey: ['macros'],
    queryFn: () => api('/macros'),
  });
}

export function useCreateMacro() {
  const queryClient = useQueryClient();
  return useMutation<MacroDto, Error, CreateMacroDto>({
    mutationFn: (payload) => post('/macros', payload),
    onSuccess: (created) => {
      queryClient.setQueryData<MacroDto[]>(['macros'], (macros) => [created, ...(macros ?? [])]);
    },
  });
}

export function useUseMacro() {
  const queryClient = useQueryClient();
  return useMutation<MacroDto, Error, { id: string }>({
    mutationFn: ({ id }) => patch(`/macros/${id}/use`),
    onSuccess: (updated) => {
      queryClient.setQueryData<MacroDto[]>(['macros'], (macros) =>
        macros?.map((m) => (m.id === updated.id ? updated : m)),
      );
    },
  });
}

export function useSlaPolicies() {
  return useQuery<SlaPolicyDto[]>({
    queryKey: ['sla', 'policies'],
    queryFn: () => api('/sla/policies'),
  });
}

export function useSlaKpis() {
  return useQuery<SlaKpis>({
    queryKey: ['sla', 'kpis'],
    queryFn: () => api('/sla/kpis'),
    refetchInterval: 30_000,
  });
}

export function useSlaScorecard(by: 'exec' | 'dept') {
  return useQuery<SlaScorecardRow[]>({
    queryKey: ['sla', 'scorecard', by],
    queryFn: () => api(`/sla/scorecard?by=${by}`),
  });
}

export function useSlaBreaches() {
  return useQuery<SlaBreachRow[]>({
    queryKey: ['sla', 'breaches'],
    queryFn: () => api('/sla/breaches'),
    refetchInterval: 30_000,
  });
}

export function useEscalationMatrix() {
  return useQuery<EscalationLevelDto[]>({
    queryKey: ['sla', 'escalation-matrix'],
    queryFn: () => api('/sla/escalation-matrix'),
  });
}

export function useDepartments() {
  return useQuery<DepartmentCardDto[]>({
    queryKey: ['departments'],
    queryFn: () => api('/departments'),
  });
}

export function useWorkforceBoard() {
  return useQuery<WorkforceBoardDto>({
    queryKey: ['workforce', 'board'],
    queryFn: () => api('/workforce/board'),
    refetchInterval: 30_000,
  });
}

export function useWorkforceRoster() {
  return useQuery<WorkforceRosterDto>({
    queryKey: ['workforce', 'roster'],
    queryFn: () => api('/workforce/roster'),
    refetchInterval: 30_000,
  });
}

export function useContactCentreKpis() {
  return useQuery<ContactCentreKpis>({
    queryKey: ['contact-centre', 'kpis'],
    queryFn: () => api('/contact-centre/kpis'),
    refetchInterval: 30_000,
  });
}

export function useIvrMenu() {
  return useQuery<IvrMenuOptionDto[]>({
    queryKey: ['contact-centre', 'ivr-menu'],
    queryFn: () => api('/contact-centre/ivr-menu'),
  });
}

export function useTelephonyKpis() {
  return useQuery<TelephonyKpis>({
    queryKey: ['telephony', 'kpis'],
    queryFn: () => api('/telephony/kpis'),
  });
}

export function useCallWorkflowSteps() {
  return useQuery<CallWorkflowStepDto[]>({
    queryKey: ['telephony', 'workflow-steps'],
    queryFn: () => api('/telephony/workflow-steps'),
  });
}

export function useTelephonyIntegrationStatus() {
  return useQuery<TelephonyIntegrationStatus>({
    queryKey: ['telephony', 'integration-status'],
    queryFn: () => api('/telephony/integration-status'),
  });
}

export function useSendTestCall() {
  return useMutation<TestCallResultDto, Error, SendTestCallDto>({
    mutationFn: (payload) => post('/telephony/test-call', payload),
  });
}

export function useTelephonyNumbers() {
  return useQuery<NumberDidDto[]>({
    queryKey: ['telephony', 'numbers'],
    queryFn: () => api('/telephony/numbers'),
  });
}

export function useCreateTelephonyNumber() {
  const queryClient = useQueryClient();
  return useMutation<NumberDidDto, Error, CreateNumberDidDto>({
    mutationFn: (payload) => post('/telephony/numbers', payload),
    onSuccess: (created) => {
      queryClient.setQueryData<NumberDidDto[]>(['telephony', 'numbers'], (rows) =>
        [...(rows ?? []), created].sort((a, b) => a.number.localeCompare(b.number)),
      );
    },
  });
}

export function useCdr() {
  return useQuery<CdrRowDto[]>({
    queryKey: ['telephony', 'cdr'],
    queryFn: () => api('/telephony/cdr'),
  });
}

export function useFieldServiceKpis() {
  return useQuery<FieldServiceKpis>({
    queryKey: ['field-service', 'kpis'],
    queryFn: () => api('/field-service/kpis'),
  });
}

export function useFieldServiceVisits() {
  return useQuery<ServiceVisitDto[]>({
    queryKey: ['field-service', 'visits'],
    queryFn: () => api('/field-service/visits'),
  });
}

export function usePriorityMatrix() {
  return useQuery<PriorityMatrixDto>({
    queryKey: ['priority-matrix'],
    queryFn: () => api('/priority-matrix'),
  });
}
