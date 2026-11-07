import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { api } from './api';
import { fetchResource, invalidateMutation, queryClient, resourceKey, useEndpoint } from './query';

afterEach(() => { cleanup(); queryClient.clear(); localStorage.clear(); vi.unstubAllGlobals(); });

it('normalizes query order and empty parameters without sharing different clients', () => {
  expect(resourceKey('/analysis/gaps?provider=&outlet=Harbor&date_from=2026-10-24', 'a'))
    .toEqual(resourceKey('/analysis/gaps?date_from=2026-10-24&outlet=Harbor', 'a'));
  expect(resourceKey('/status?', 'a')).toEqual(resourceKey('/status', 'a'));
  expect(resourceKey('/status', 'a')).not.toEqual(resourceKey('/status', 'b'));
});

it('deduplicates concurrent readers and strict-mode remounts', async () => {
  const fetch = vi.fn(async () => new Response('{"total":7}'));
  vi.stubGlobal('fetch', fetch);
  const {result} = renderHook(() => [useEndpoint<{total:number}>('/status'), useEndpoint<{total:number}>('/status?')], {wrapper: StrictMode});
  await waitFor(() => expect(result.current.every(value => value.data?.total === 7)).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  await fetchResource('/status');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps displayed data while scope changes, and never retains it for another client', async () => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))));
  const {result, rerender} = renderHook(({path, client}) => useEndpoint<{total:number}>(path, client), {initialProps:{path:'/analysis/summary?outlet=A',client:'a'}});
  await act(async () => pending[0](new Response('{"total":7}')));
  await waitFor(() => expect(result.current.data?.total).toBe(7));
  rerender({path:'/analysis/summary?outlet=B',client:'a'});
  expect(result.current.data?.total).toBe(7);
  expect(result.current.updating).toBe(true);
  rerender({path:'/analysis/summary?outlet=B',client:'b'});
  expect(result.current.data).toBeUndefined();
  await act(async () => pending[2](new Response('{"total":9}')));
  await waitFor(() => expect(result.current.data?.total).toBe(9));
  await act(async () => pending[1](new Response('{"total":8}')));
  expect(result.current.data?.total).toBe(9);
});

it('invalidates follow-up and overview queries only for the changed client', async () => {
  const paths = ['/analysis/follow-ups', '/overview', '/analysis/rates', '/status'];
  for (const client of ['a','b']) for (const path of paths) queryClient.setQueryData(resourceKey(path, client), {old:true});
  await invalidateMutation('/analysis/follow-ups/bulk', 'POST', 'a');
  expect(queryClient.getQueryState(resourceKey('/analysis/follow-ups','a'))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(resourceKey('/overview','a'))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(resourceKey('/analysis/rates','a'))?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(resourceKey('/status','a'))?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(resourceKey('/overview','b'))?.isInvalidated).toBe(false);
});

it('does not invalidate for tests, previews or follow-up drafts', async () => {
  queryClient.setQueryData(resourceKey('/overview','a'), {old:true});
  for (const path of ['/matching/l1/test','/matching/l1/preview','/analysis/follow-ups/draft']) await invalidateMutation(path,'POST','a');
  expect(queryClient.getQueryState(resourceKey('/overview','a'))?.isInvalidated).toBe(false);
});

it('refreshes embedded workflow results after a manual link or undo in only that client',async()=>{
  for(const client of ['a','b'])queryClient.setQueryData(resourceKey('/workflow?rows=5',client),{old:true});
  await invalidateMutation('/analysis/manual-links/7','DELETE','a');
  expect(queryClient.getQueryState(resourceKey('/workflow?rows=5','a'))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(resourceKey('/workflow?rows=5','b'))?.isInvalidated).toBe(false);
});

it('successful writes invalidate their tags and failed writes leave cached data alone', async () => {
  queryClient.setQueryData(resourceKey('/workflow?rows=5',''), {old:true});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status:409})));
  await expect(api('/convert',{method:'POST'})).rejects.toThrow();
  expect(queryClient.getQueryState(resourceKey('/workflow?rows=5',''))?.isInvalidated).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  await api('/convert',{method:'POST'});
  expect(queryClient.getQueryState(resourceKey('/workflow?rows=5',''))?.isInvalidated).toBe(true);
});

it('marks derived results stale after uploads without fetching locked screens', async () => {
  queryClient.setQueryData(resourceKey('/analysis/summary','a'), {old:true});
  queryClient.setQueryData(resourceKey('/overview','a'), {old:true});
  queryClient.setQueryData(resourceKey('/status','a'), {old:true});
  await invalidateMutation('/files/pos', 'POST', 'a');
  for (const path of ['/analysis/summary','/overview','/status']) expect(queryClient.getQueryState(resourceKey(path,'a'))?.isInvalidated).toBe(true);
});

it('uses the client captured by the query even if navigation switches workspaces', async () => {
  localStorage.setItem('kira-client','b');
  const fetch = vi.fn(async (_path: string, _init: RequestInit) => new Response('{"total":7}'));
  vi.stubGlobal('fetch', fetch);
  await fetchResource('/status','a');
  expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Kira-Client')).toBe('a');
});

it('restarts an in-flight read after a write and ignores the pre-write response', async () => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))));
  const {result} = renderHook(() => useEndpoint<{total:number}>('/status', 'a'));
  await waitFor(() => expect(pending).toHaveLength(1));
  let invalidated: Promise<void>;
  act(() => { invalidated = invalidateMutation('/matching/l1/run', 'POST', 'a'); });
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => { pending[1](new Response('{"total":9}')); await invalidated; });
  await waitFor(() => expect(result.current.data?.total).toBe(9));
  await act(async () => pending[0](new Response('{"total":7}')));
  expect(result.current.data?.total).toBe(9);
});
