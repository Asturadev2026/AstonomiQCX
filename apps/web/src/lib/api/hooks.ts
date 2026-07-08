import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type {
  AskAstraPayload,
  AstraAnswer,
  ContactDto,
  ContactOrder,
  ContactProfile,
  ContactTicket,
  CreateContactDto,
  FeedItem,
  JourneyPayload,
  NavCounts,
  OverviewPayload,
  SentimentMonth,
  SessionUser,
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
