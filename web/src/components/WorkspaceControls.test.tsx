import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {queryClient} from '../lib/query';
import {ClientSwitcher,WorkspaceActions} from './WorkspaceControls';

const clients=[{id:'zestly-demo',name:'Zestly Demo'},{id:'coffee',name:'Kopi Nusantara'}];
const overview={status:{files:{pos:7,settlement:7,bank:7},tables:{pos:{rows:8784},settlement:{rows:8654},bank:{rows:70}}},results:{totals:{pos:8784,full:8639},by_day:{'2026-10-26':{pos:100,matched:98}}}};
beforeEach(()=>{localStorage.setItem('kira-client','wrong-workspace');});
afterEach(()=>{cleanup();queryClient.clear();localStorage.clear();vi.unstubAllGlobals();});
function mount(children:React.ReactNode){return render(<MemoryRouter>{children}</MemoryRouter>);}
function mockApi(extra?:(path:string,init:RequestInit)=>Response|undefined){
  const fetch=vi.fn(async(path:string,init:RequestInit)=>extra?.(path,init)??new Response(JSON.stringify(overview)));
  vi.stubGlobal('fetch',fetch);return fetch;
}

it('uses the requested client for the card and lazily loads other menu rates',async()=>{
  const fetch=mockApi(),changed=vi.fn();
  mount(<ClientSwitcher client="zestly-demo" clients={clients} onClient={changed}/>);
  expect(await screen.findByText('98,3% on Mon 26 Oct')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Kira-Client')).toBe('zestly-demo');
  fireEvent.click(screen.getByRole('button',{name:/Choose client: Zestly Demo/}));
  const coffee=await screen.findByRole('menuitemradio',{name:/Kopi Nusantara/});
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
  expect(new Headers(fetch.mock.calls[1][1].headers).get('X-Kira-Client')).toBe('coffee');
  fireEvent.click(coffee);expect(changed).toHaveBeenCalledWith('coffee');
  expect(screen.queryByRole('menu',{name:'Clients'})).not.toBeInTheDocument();
});

it('creates a client only on submit and announces the saved client for the shell',async()=>{
  const fetch=mockApi(path=>path==='/api/clients'?new Response(JSON.stringify({id:'baru',name:'Baru'})):undefined),changed=vi.fn(),created=vi.fn();
  window.addEventListener('kira:clients-changed',created);
  mount(<ClientSwitcher client="zestly-demo" clients={clients} onClient={changed}/>);
  fireEvent.click(screen.getByRole('button',{name:/Choose client/}));
  fireEvent.click(screen.getByRole('menuitem',{name:'Add client'}));
  expect(fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);
  fireEvent.change(screen.getByRole('textbox',{name:'Client name'}),{target:{value:'  Baru  '}});
  fireEvent.click(screen.getByRole('button',{name:'Create client'}));
  await waitFor(()=>expect(changed).toHaveBeenCalledWith('baru'));
  expect(fetch.mock.calls.find(([path])=>path==='/api/clients')?.[1].body).toBe(JSON.stringify({name:'Baru'}));
  expect(created.mock.calls[0][0].detail).toEqual({client:{id:'baru',name:'Baru'}});
  window.removeEventListener('kira:clients-changed',created);
});

it('moves through the client menu without changing clients and restores the trigger on Escape',async()=>{
  mockApi();const changed=vi.fn();
  mount(<ClientSwitcher client="zestly-demo" clients={clients} onClient={changed}/>);
  const trigger=screen.getByRole('button',{name:/Choose client/});
  fireEvent.click(trigger);
  const first=screen.getByRole('menuitemradio',{name:/Zestly Demo/});
  expect(first).toHaveFocus();
  fireEvent.keyDown(first,{key:'ArrowDown'});
  expect(screen.getByRole('menuitemradio',{name:/Kopi Nusantara/})).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!,{key:'End'});
  expect(screen.getByRole('menuitem',{name:'Switch client'})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});
  expect(trigger).toHaveFocus();
});

it('requires the exact demo ID, shows real counts and reports the backup after reset',async()=>{
  const fetch=mockApi(path=>path==='/api/reset'?new Response(JSON.stringify({ok:true,backup:'zestly-demo.bak-reset.db'})):undefined),reset=vi.fn();
  window.addEventListener('kira:workspace-reset',reset);
  mount(<WorkspaceActions client="zestly-demo" user={{user:'Nadia Aulia',auth:true}} onSignOut={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Reset demo'}));
  const dialog=screen.getByRole('dialog',{name:'Reset demo'});
  expect(await within(dialog).findByText('8.784')).toBeInTheDocument();
  expect(within(dialog).getByText('21')).toBeInTheDocument();
  const confirm=within(dialog).getByRole('button',{name:'Back up and reset'});
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Client ID'}),{target:{value:'ZESTLY-DEMO'}});
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Client ID'}),{target:{value:'zestly-demo'}});
  fireEvent.click(confirm);
  expect(await screen.findByText('zestly-demo.bak-reset.db')).toBeInTheDocument();
  const request=fetch.mock.calls.find(([path])=>path==='/api/reset')!;
  expect(request[1].body).toBe(JSON.stringify({confirmation:'zestly-demo'}));
  expect(new Headers(request[1].headers).get('X-Kira-Client')).toBe('zestly-demo');
  expect(reset.mock.calls[0][0].detail).toEqual({client:'zestly-demo',backup:'zestly-demo.bak-reset.db'});
  window.removeEventListener('kira:workspace-reset',reset);
});

it.each(['','coffee','customer-demo','zestly-demo-copy'])('does not offer reset for %s',client=>{
  mockApi();mount(<WorkspaceActions client={client} user={{user:'Local',auth:false}} onSignOut={()=>{}}/>);
  expect(screen.queryByRole('button',{name:'Reset demo'})).not.toBeInTheDocument();
});

it('keeps a failed reset open and never announces success',async()=>{
  mockApi(path=>path==='/api/reset'?new Response(JSON.stringify({detail:'Backup could not be created'}),{status:409}):undefined);
  const reset=vi.fn();window.addEventListener('kira:workspace-reset',reset);
  mount(<WorkspaceActions client="zestly-demo-latihan" user={{user:'Local',auth:false}} onSignOut={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Reset demo'}));
  await screen.findByText('8.784');
  fireEvent.change(screen.getByRole('textbox',{name:'Client ID'}),{target:{value:'zestly-demo-latihan'}});
  fireEvent.click(screen.getByRole('button',{name:'Back up and reset'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Backup could not be created');
  expect(screen.getByRole('button',{name:'Back up and reset'})).toBeEnabled();
  expect(reset).not.toHaveBeenCalled();window.removeEventListener('kira:workspace-reset',reset);
});

it('opens the tutorial menu and signs out only from the account menu',async()=>{
  const fetch=mockApi(()=>new Response('{}')),signedOut=vi.fn(),tutorial=vi.fn();
  window.addEventListener('kira:open-tutorial-menu',tutorial);
  mount(<WorkspaceActions client="coffee" user={{user:'Nadia Aulia',auth:true}} onSignOut={signedOut}/>);
  fireEvent.click(screen.getByRole('button',{name:'Tutorial'}));expect(tutorial).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'Account: Nadia Aulia'}));
  expect(screen.getByText('Reconciliation workspace')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem',{name:'Sign out'}));
  await waitFor(()=>expect(signedOut).toHaveBeenCalledOnce());
  expect(fetch.mock.calls[0][0]).toBe('/api/logout');
  window.removeEventListener('kira:open-tutorial-menu',tutorial);
});
