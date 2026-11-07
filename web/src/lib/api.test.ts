import {afterEach,expect,it,vi} from 'vitest';
import {api} from './api';
afterEach(()=>vi.unstubAllGlobals());
it('sends client, actor and session credentials',async()=>{const fetch=vi.fn().mockResolvedValue(new Response('{"user":"Andrew"}'));vi.stubGlobal('fetch',fetch);await api('/me');expect(fetch).toHaveBeenCalledWith('/api/me',expect.objectContaining({credentials:'include'}));const options=fetch.mock.calls[0][1];expect(options.headers.get('X-Kira-User')).toBe('Andrew');});
it('preserves workflow conflict details',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"detail":"Run stage 1 first"}',{status:409})));await expect(api('/overview')).rejects.toThrow('Run stage 1 first');});
