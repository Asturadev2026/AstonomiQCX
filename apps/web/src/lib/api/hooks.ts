import { useQuery } from '@tanstack/react-query';
import type {
  FeedItem,
  NavCounts,
  OverviewPayload,
  SessionUser,
} from './types';

/**
 * Data hooks — the ONLY way components get data.
 * Every hook is a real HTTP call to /api/v1 (proxied to the NestJS API by
 * Vite, see vite.config.ts). There is no mock/fixture path: until the API
 * and database are running, hooks are in error state and components render
 * their loading/error UI. That is correct behaviour for a real application.
 */

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`);
  if (!res.ok) {
    throw new Error(`GET /api/v1${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
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
