import { afterEach, expect, it, vi } from 'vitest';
import { api,download } from './api';
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
it('keeps an export on its captured client while another workspace becomes active',async()=>{
  vi.useFakeTimers();
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response('reference,amount\nPAY-1,100'));
  vi.stubGlobal('fetch',fetch);
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:test'),revokeObjectURL:vi.fn()});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  try{
    await download('/analysis/export','records.csv','captured-client');
    expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Kira-Client')).toBe('captured-client');
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
  }finally{click.mockRestore();vi.useRealTimers();}
});
it('marks a guided export with its original client, user and approval origin',async()=>{
 vi.useFakeTimers();const fetch=vi.fn(async()=>new Response('csv'));vi.stubGlobal('fetch',fetch);vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:guided'),revokeObjectURL:vi.fn()});const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{await download('/matching/export','close.csv','latihan',{'X-Kira-Origin':'guided','X-Kira-User':'Taufiq'});const options=fetch.mock.calls[0] as unknown as [string,RequestInit];const headers=new Headers(options[1].headers);expect(headers.get('X-Kira-Origin')).toBe('guided');expect(headers.get('X-Kira-Client')).toBe('latihan');expect(headers.get('X-Kira-User')).toBe('Taufiq');vi.advanceTimersByTime(1000);}finally{click.mockRestore();vi.useRealTimers();}
});
