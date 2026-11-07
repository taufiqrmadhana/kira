import { useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, identity, onMutation } from './api';

import { queryClient } from './queryClient';
export { queryClient } from './queryClient';

export type DataTag = 'analysis' | 'overview' | 'performance' | 'status' | 'workflow' | 'follow-ups' | 'learning' | 'clients';

export function normalizedPath(path: string) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  for (const [key, value] of [...params]) if (value === '') params.delete(key);
  params.sort();
  return pathname + (params.size ? '?' + params : '');
}
export function resourceTag(path: string): DataTag {
  if (path.startsWith('/analysis/follow-ups')) return 'follow-ups';
  if (path.startsWith('/analysis/') || path.startsWith('/matching/results')) return 'analysis';
  if (path.startsWith('/performance/')) return 'performance';
  if (path.startsWith('/overview')) return 'overview';
  if (path.startsWith('/learning')) return 'learning';
  if (path.startsWith('/status')) return 'status';
  if (path.startsWith('/clients')) return 'clients';
  return 'workflow';
}
export function resourceKey(path: string, client = identity.client()) {
  return ['kira', client, resourceTag(path), normalizedPath(path)] as const;
}
export function resourceOptions<T>(path: string, client = identity.client()) {
  return {
    queryKey: resourceKey(path, client),
    // A shared read survives a component unmount. Another observer can use the
    // same promise; stale results remain isolated by client and normalized scope.
    queryFn: () => api<T>(path, { headers: { 'X-Kira-Client': client } }),
  };
}
export function fetchResource<T>(path: string, client = identity.client()) {
  return queryClient.fetchQuery(resourceOptions<T>(path, client));
}
export function useEndpoint<T>(path: string | null, client = identity.client()) {
  const result = useQuery({
    ...resourceOptions<T>(path ?? '/disabled', client),
    enabled: path !== null,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === client && String(previousQuery.queryKey[3]).split('?')[0] === path?.split('?')[0] ? keepPreviousData(previous) : undefined,
  }, queryClient);
  const retry = useCallback(() => { void result.refetch(); }, [result.refetch]);
  return {
    path, data: path ? result.data : undefined,
    error: result.error?.message,
    loading: path !== null && result.isPending,
    updating: result.isFetching && !result.isPending,
    updatedAt: result.dataUpdatedAt,
    retry,
  };
}

export async function invalidateTags(tags: readonly DataTag[], client = identity.client()) {
  const predicate = (query: {queryKey: readonly unknown[]}) => query.queryKey[0] === 'kira' && query.queryKey[1] === client && tags.includes(query.queryKey[2] as DataTag);
  // A read started before the commit must never overwrite the post-write view.
  // Cancel even initial reads (no cached data yet), then restart active readers.
  await queryClient.cancelQueries({predicate});
  await queryClient.invalidateQueries({predicate});
}
export function mutationTags(path: string, method = 'POST'): DataTag[] {
  if (['GET', 'HEAD'].includes(method.toUpperCase())) return [];
  if (/\/(test|preview|draft)$/.test(path.split('?')[0])) return [];
  if (path.startsWith('/analysis/follow-ups')) return ['follow-ups', 'overview'];
  if (path.startsWith('/analysis/manual-links')) return ['analysis', 'overview', 'follow-ups', 'performance', 'workflow', 'status'];
  if (path.startsWith('/matching/')) return ['analysis', 'overview', 'performance', 'status', 'workflow', 'learning', 'follow-ups'];
  if (/^\/(files|convert|upload-rules|cleaning)/.test(path)) return ['workflow', 'status'];
  if (path.startsWith('/performance/outlet-profiles')) return ['performance'];
  if (path.startsWith('/reset')) return ['analysis', 'overview', 'performance', 'status', 'workflow', 'learning', 'follow-ups'];
  if (path.startsWith('/clients')) return ['clients'];
  return [];
}
export async function invalidateMutation(path: string, method: string, client: string) {
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && /^\/(files|convert|upload-rules|cleaning)/.test(path)) {
    // Conversion clears matching. Mark previous results stale without spending
    // work refetching screens that are now locked behind workflow completion.
    const predicate = (query: {queryKey: readonly unknown[]}) => query.queryKey[0] === 'kira' && query.queryKey[1] === client && ['analysis', 'overview', 'performance', 'learning', 'follow-ups'].includes(String(query.queryKey[2]));
    await queryClient.cancelQueries({predicate});
    await queryClient.invalidateQueries({predicate, refetchType: 'none'});
  }
  await invalidateTags(mutationTags(path, method), client);
}
const stopMutationObserver = onMutation(invalidateMutation);
if (import.meta.hot) import.meta.hot.dispose(stopMutationObserver);

const pageResources: Record<string, string[]> = {
  '/overview': ['/overview', '/status', '/analysis/summary'],
  '/workflow': ['/workflow?rows=5', '/status'],
  '/analysis': ['/status', '/analysis/summary', '/analysis/gaps', '/analysis/gaps?by_day=true'],
  '/insights': ['/performance/outlets?', '/performance/anomalies?', '/performance/outlet-profiles'],
};
export async function prefetchPage(path: string, client = identity.client()) {
  const pathname = path.split('?')[0];
  await Promise.all((pageResources[pathname] ?? []).map(resource => queryClient.prefetchQuery(resourceOptions(resource, client))));
}
export function prefetchWorkspace(client = identity.client()) { return prefetchPage('/overview', client); }
