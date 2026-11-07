import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { useResource } from './useResource';
afterEach(async () => { cleanup(); await act(async () => {}); vi.unstubAllGlobals(); localStorage.clear(); });

function pendingFetch() {
  const calls: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>(resolve => calls.push({signal: init.signal as AbortSignal, resolve})));
  vi.stubGlobal('fetch', fetch);
  const respond = (index: number, name: string) => act(async () => calls[index].resolve(new Response(JSON.stringify({name}))));
  return {fetch, calls, respond};
}

it('shares one pending request between subscribers and does not keep a settled response cache', async () => {
  const {fetch, respond} = pendingFetch();
  const first = renderHook(() => useResource<{name: string}>('/shared'));
  const second = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(1);
  await respond(0, 'first');
  expect(first.result.current.data?.name).toBe('first');
  expect(second.result.current.data?.name).toBe('first');
  const third = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(1, 'fresh');
  expect(third.result.current.data?.name).toBe('fresh');
});

it('shares a request across the development StrictMode effect replay', async () => {
  const {fetch, calls, respond} = pendingFetch();
  const view = renderHook(() => useResource<{name: string}>('/strict'), {wrapper: StrictMode});
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(calls[0].signal.aborted).toBe(false);
  await respond(0, 'ready');
  expect(view.result.current.data?.name).toBe('ready');
});

it('keeps a shared request alive when one subscriber leaves', async () => {
  const {fetch, calls, respond} = pendingFetch();
  const first = renderHook(() => useResource<{name: string}>('/shared'));
  const second = renderHook(() => useResource<{name: string}>('/shared'));
  first.unmount();
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(calls[0].signal.aborted).toBe(false);
  await respond(0, 'remaining');
  expect(second.result.current.data?.name).toBe('remaining');
});

it('aborts after the last subscriber leaves and starts a new request on a later mount', async () => {
  const {fetch, calls, respond} = pendingFetch();
  const first = renderHook(() => useResource<{name: string}>('/shared'));
  first.unmount();
  expect(calls[0].signal.aborted).toBe(false);
  await act(async () => {});
  expect(calls[0].signal.aborted).toBe(true);
  const next = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(0, 'old');
  const another = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(1, 'fresh');
  expect(next.result.current.data?.name).toBe('fresh');
  expect(another.result.current.data?.name).toBe('fresh');
});

it('keeps users and client workspaces isolated when sharing pending requests', async () => {
  const {fetch, respond} = pendingFetch();
  localStorage.setItem('kira-client', 'client-a');
  localStorage.setItem('kira-user', 'Nurwan');
  const first = renderHook(() => useResource<{name: string}>('/shared'));
  localStorage.setItem('kira-client', 'client-b');
  const second = renderHook(() => useResource<{name: string}>('/shared'));
  localStorage.setItem('kira-user', 'Andrew');
  const third = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(3);
  first.unmount();
  second.unmount();
  await respond(0, 'client-a Nurwan');
  await respond(1, 'client-b Nurwan');
  await respond(2, 'client-b Andrew');
  expect(third.result.current.data?.name).toBe('client-b Andrew');
});

it('clears the previous client data when identity changes without changing the resource path', async () => {
  const {fetch, respond} = pendingFetch();
  const observed: (string | undefined)[] = [];
  localStorage.setItem('kira-client', 'client-a');
  const view = renderHook(() => {
    const resource = useResource<{name: string}>('/shared');
    observed.push(resource.data?.name);
    return resource;
  });
  await respond(0, 'client-a');
  observed.length = 0;
  localStorage.setItem('kira-client', 'client-b');
  view.rerender();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(observed.every(value => value === undefined)).toBe(true);
  expect(view.result.current.data).toBeUndefined();
  await respond(1, 'client-b');
  expect(view.result.current.data?.name).toBe('client-b');
});

it('starts a fresh request on manual retry and ignores its older pending reply', async () => {
  const {fetch, respond} = pendingFetch();
  const view = renderHook(() => useResource<{name: string}>('/shared'));
  act(() => view.result.current.retry());
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(0, 'obsolete');
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.loading).toBe(true);
  const another = renderHook(() => useResource<{name: string}>('/shared'));
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(1, 'fresh');
  expect(view.result.current.data?.name).toBe('fresh');
  expect(another.result.current.data?.name).toBe('fresh');
});

it('shares one fresh request after data changes and ignores the old reply for every subscriber', async () => {
  const {fetch, respond} = pendingFetch();
  const first = renderHook(() => useResource<{name: string}>('/shared'));
  const second = renderHook(() => useResource<{name: string}>('/shared'));
  act(() => window.dispatchEvent(new Event('kira:data-changed')));
  expect(fetch).toHaveBeenCalledTimes(2);
  await respond(0, 'obsolete');
  expect(first.result.current.data).toBeUndefined();
  expect(second.result.current.data).toBeUndefined();
  await respond(1, 'fresh');
  expect(first.result.current.data?.name).toBe('fresh');
  expect(second.result.current.data?.name).toBe('fresh');
});

it('retains current data during refresh and ignores an aborted older response', async () => {
  const resolvers: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve))));
  const { result, rerender } = renderHook(({ path }) => useResource<{ name: string }>(path), { initialProps: { path: '/first' } });
  await act(async () => resolvers[0](new Response(JSON.stringify({ name: 'first' }))));
  await waitFor(() => expect(result.current.data?.name).toBe('first'));
  act(() => result.current.retry());
  expect(result.current.data?.name).toBe('first');
  rerender({ path: '/second' });
  await act(async () => resolvers[2](new Response(JSON.stringify({ name: 'second' }))));
  await act(async () => resolvers[1](new Response(JSON.stringify({ name: 'obsolete' }))));
  expect(result.current.data?.name).toBe('second');
});
