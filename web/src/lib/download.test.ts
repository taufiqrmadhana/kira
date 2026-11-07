import { afterEach, expect, it, vi } from 'vitest';
import { downloadAnalysis } from './download';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
it('exports the selected workspace and preserves server errors', async () => {
  localStorage.setItem('kira-client', 'zestly-demo');
  const fetch = vi.fn().mockResolvedValue(new Response('{"detail":"Run both matching stages"}', { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  await expect(downloadAnalysis('outlet=Harbor')).rejects.toThrow('Run both matching stages');
  expect(fetch).toHaveBeenCalledWith('/api/analysis/export?outlet=Harbor', expect.objectContaining({ headers: expect.objectContaining({ 'X-Kira-Client': 'zestly-demo' }), credentials: 'include' }));
});
