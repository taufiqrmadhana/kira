import {afterEach, expect, it, vi} from 'vitest';
import {streamProgress} from './progress';

const encoder = new TextEncoder();
const progress = {type:'progress', area:'pos', completed:1, total:3, unit:'checks', message:'Reading café.csv'};
function streamed(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({start(controller) {
    chunks.forEach(chunk => controller.enqueue(chunk));
    controller.close();
  }}), {headers:{'Content-Type':'application/x-ndjson'}});
}
afterEach(() => {vi.unstubAllGlobals(); localStorage.clear();});

it('decodes fragmented UTF-8 progress and returns only the committed result', async () => {
  const bytes = encoder.encode(JSON.stringify(progress)+'\n'+JSON.stringify({type:'complete',result:{run_id:7}})+'\n');
  vi.stubGlobal('fetch', vi.fn(async () => streamed(Array.from(bytes, byte => new Uint8Array([byte])))));
  const report = vi.fn();
  await expect(streamProgress('/convert/stream', {method:'POST'}, report)).resolves.toEqual({run_id:7});
  expect(report).toHaveBeenCalledExactlyOnceWith(progress);
});

it('preserves explicit workspace headers and sends session credentials', async () => {
  localStorage.setItem('kira-client','another');
  localStorage.setItem('kira-user','Andrew');
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamed([encoder.encode('{"type":"complete","result":{}}\n')]));
  vi.stubGlobal('fetch',fetch);
  await streamProgress('/matching/l2/run/stream', {method:'POST',headers:{'X-Kira-Client':'','X-Kira-User':'Reviewer'},body:'{"rule_ids":["SM1"]}'},vi.fn());
  const init = fetch.mock.calls[0][1] as RequestInit;
  expect(fetch.mock.calls[0][0]).toBe('/api/matching/l2/run/stream');
  expect(init.credentials).toBe('include');
  const headers = new Headers(init.headers);
  expect(headers.get('X-Kira-Client')).toBe('');
  expect(headers.get('X-Kira-User')).toBe('Reviewer');
  expect(headers.get('Content-Type')).toBe('application/json');
});

it('treats the last progress count as pending until a completion event arrives', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => streamed([encoder.encode('{"type":"progress","stage":"l1","completed":3,"total":3}\n')])));
  await expect(streamProgress('/matching/l1/run/stream',{},vi.fn())).rejects.toThrow('before completion');
});

it('retains server errors from HTTP and streaming responses', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('{"detail":"Run POS first"}',{status:409}))
    .mockResolvedValueOnce(streamed([encoder.encode('{"type":"error","detail":"KIRA is busy","status":409}\n')]));
  vi.stubGlobal('fetch',fetch);
  await expect(streamProgress('/matching/l2/run/stream',{},vi.fn())).rejects.toMatchObject({status:409,message:'Run POS first'});
  await expect(streamProgress('/matching/l2/run/stream',{},vi.fn())).rejects.toMatchObject({status:409,message:'KIRA is busy'});
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects malformed progress instead of claiming success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => streamed([encoder.encode('{"type":"progress","completed":9,"total":3}\n')])));
  await expect(streamProgress('/convert/stream',{},vi.fn())).rejects.toThrow('Invalid progress');
});

it('accepts a final event without a trailing newline', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => streamed([encoder.encode('{"type":"complete","result":{"ok":true}}')])));
  await expect(streamProgress('/convert/stream',{},vi.fn())).resolves.toEqual({ok:true});
});

it('stops reporting when the caller aborts and does not retry the write', async () => {
  const abort = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => streamed([encoder.encode(JSON.stringify(progress)+'\n{"type":"complete","result":{}}\n')])));
  const report = vi.fn(() => abort.abort());
  await expect(streamProgress('/convert/stream',{signal:abort.signal,method:'POST'},report)).rejects.toMatchObject({name:'AbortError'});
  expect(report).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});
