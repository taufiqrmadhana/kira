import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';
afterEach(() => vi.unstubAllGlobals());
it('sends client, actor and session credentials', async () => { const fetch = vi.fn().mockResolvedValue(new Response('{"user":"Andrew"}')); vi.stubGlobal('fetch', fetch); await api('/me'); expect(fetch).toHaveBeenCalledWith('/api/me', expect.objectContaining({ credentials: 'include' })); const options = fetch.mock.calls[0][1]; expect(options.headers.get('X-Kira-User')).toBe('Andrew'); });
it('preserves workflow conflict details', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Run stage 1 first"}', { status: 409 }))); await expect(api('/overview')).rejects.toThrow('Run stage 1 first'); });
it('keeps rejected sign-in credentials inline on a bookmarked workspace page', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', {pathname:'/overview', search:'?c=demo', assign});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Incorrect username or password"}', {status:401})));
  await expect(api('/login', {method:'POST', body:JSON.stringify({username:'kira',password:'wrong'})})).rejects.toThrow('Incorrect username or password');
  expect(assign).not.toHaveBeenCalled();
});
