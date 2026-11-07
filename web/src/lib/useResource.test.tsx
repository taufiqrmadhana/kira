import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useResource } from './useResource';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
