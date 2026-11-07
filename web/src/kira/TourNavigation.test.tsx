import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {BrowserRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from '../App';
import {streamProgress} from '../lib/progress';
import {areas,type WorkflowData} from '../pages/workflow/types';

vi.mock('../lib/progress',()=>({streamProgress:vi.fn()}));

const original='/analysis?tab=follow&c=demo&outlet=Harbor';
const status={step:4,next:{say:'Review the reconciled results.'},files:{pos:1,settlement:1,bank:1},converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true,rules:1},l2:{done:true,rules:1}}};
let workflow:WorkflowData|null=null;
const request=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>{
  const path=new URL(String(input),'http://localhost').pathname;
  const body=path==='/api/me'?{user:'Review',auth:false}
    :path==='/api/clients'?[{id:'demo',name:'Demo'}]
    :path==='/api/status'?workflow?.status||status
    :path==='/api/workflow'?workflow
    :path==='/api/analysis/summary'?{totals:{pos:1,matched:0,mismatched:1,review:0},facets:{days:['2026-10-24'],outlets:['Harbor'],providers:['DANA']}}
    :path==='/api/analysis/follow-ups'?{total:1,offset:0,counts:{open:1,investigating:0,resolved:0},records:[{i:0,rid:'pos:1',key:'HARBOR-1',day:'2026-10-24',outlet:'Harbor',provider:'DANA',reason:'Not in bank yet',status:'Mismatched',amount:100000,follow_up:{status:'open',assignee:'',note:''}}]}
    :path==='/api/matching/rules'?[{id:'PS1',stage:'l1',kind:'composite',params:{window:1},name:'Outlet and amount',conditions:['Same outlet']}]
    :path==='/api/matching/results'?null
    :path==='/api/matching/l1/test'?{stage:'l1',matched:1,total:1,unmatched_left:0,unmatched_right:0,hits:{PS1:1},rules:['PS1']}
    :path==='/api/overview'?{status,results:null}
    :path==='/api/learning'?{closes:[],knowledge:{}}:[];
  return new Response(JSON.stringify(body));
});

beforeEach(()=>{
  history.replaceState(null,'',original);request.mockClear();workflow=null;vi.mocked(streamProgress).mockReset();
  vi.stubGlobal('fetch',request);
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener(){},removeEventListener(){}})));
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal('scrollTo',vi.fn());
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();history.replaceState(null,'','/');});

async function renderApp(){
  // Flush the immediately mocked sign-in, client, status and page reads before
  // asserting readiness; their cascading renders must not race a polling timer.
  await act(async()=>{render(<BrowserRouter><App/></BrowserRouter>);});
}

async function openTourEntry(){
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));});
  const button=screen.getByRole('button',{name:'Take a tour'});
  expect(button).toBeEnabled();
  return button;
}

it('preserves an unsaved follow-up when tour navigation is declined and starts only after discard is confirmed',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await renderApp();
  const note=screen.getByLabelText('Note for HARBOR-1');
  fireEvent.change(note,{target:{value:'Ask DANA about the delayed payout.'}});
  expect(screen.getByText('1 unsaved notes')).toBeInTheDocument();
  const tour=await openTourEntry();fireEvent.click(tour);
  expect(confirm).toHaveBeenCalledWith('You have unsaved follow-up notes. Discard them and leave this view?');
  expect(location.pathname+location.search).toBe(original);
  expect(screen.getByLabelText('Note for HARBOR-1')).toHaveValue('Ask DANA about the delayed payout.');
  expect(screen.queryByRole('heading',{name:'Choose a client'})).not.toBeInTheDocument();
  confirm.mockReturnValue(true);fireEvent.click(tour);
  expect(await screen.findByRole('heading',{name:'Choose a client'})).toBeInTheDocument();
  expect(location.pathname).toBe('/overview');expect(new URLSearchParams(location.search).get('c')).toBe('demo');
  expect(request.mock.calls.filter(([,init])=>init?.method&&init.method!=='GET')).toHaveLength(0);
});

it('starts directly when follow-up notes have no unsaved changes',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await renderApp();
  expect(screen.getByLabelText('Note for HARBOR-1')).toBeInTheDocument();
  fireEvent.click(await openTourEntry());
  expect(await screen.findByRole('heading',{name:'Choose a client'})).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
  expect(request.mock.calls.filter(([,init])=>init?.method&&init.method!=='GET')).toHaveLength(0);
});

it('keeps an in-flight conversion mounted and un-aborted when a tour is requested',async()=>{
  const table={columns:[],rows:[],total:0};
  workflow={status:{...status,step:2,converted:false,cleaning:{open:0,rules_version:null},matching:{l1:{done:false},l2:{done:false}}},files:areas.map((type,index)=>({id:index+1,type,name:`${type}.csv`,folder:'',sheet:null,size:20,rows:1,looks_like:type,wrong_area:false,uploaded_by:'Review',uploaded_at:'2026-11-07'})),conversion:null,upload_rules:{pos:null,settlement:null,bank:null},cleaning:{rules:null,recommendations:[]},tables:{parsed:{pos:table,settlement:table,bank:table},clean:{pos:table,settlement:table,bank:table}}};
  vi.mocked(streamProgress).mockImplementation(()=>new Promise(()=>{}));
  history.replaceState(null,'','/workflow?step=2&c=demo');
  await renderApp();
  fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
  await waitFor(()=>expect(streamProgress).toHaveBeenCalledTimes(1));
  const signal=vi.mocked(streamProgress).mock.calls[0][1].signal;
  expect(signal).toBeDefined();expect(signal?.aborted).toBe(false);
  fireEvent.click(await openTourEntry());
  expect(await screen.findByText('Finish the current workflow action before starting the tour.')).toBeInTheDocument();
  expect(location.pathname+location.search).toBe('/workflow?step=2&c=demo');
  expect(screen.getByRole('button',{name:'Converting…'})).toBeDisabled();
  expect(screen.queryByRole('heading',{name:'Choose a client'})).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(false);expect(streamProgress).toHaveBeenCalledTimes(1);
});

it('keeps a matching generation in flight when the tour is requested',async()=>{
  const table={columns:[],rows:[],total:0};
  workflow={status:{...status,matching:{l1:{done:false},l2:{done:false}}},files:[],conversion:{at:'2026-11-07',stale:false,proposals:{},decisions:{}},upload_rules:{pos:null,settlement:null,bank:null},cleaning:{rules:{version:1,maps:{},exclude:{}},recommendations:[]},tables:{parsed:{pos:table,settlement:table,bank:table},clean:{pos:table,settlement:table,bank:table}}};
  vi.mocked(streamProgress).mockImplementation(()=>new Promise(()=>{}));
  history.replaceState(null,'','/workflow?step=4&c=demo');
  await renderApp();
  const stage=screen.getByRole('region',{name:'POS to settlement'});
  const test=within(stage).getByRole('button',{name:'Test selected rules'});
  await waitFor(()=>expect(test).toBeEnabled());fireEvent.click(test);
  fireEvent.click(await within(stage).findByRole('button',{name:'No, generate matching result'}));
  await waitFor(()=>expect(streamProgress).toHaveBeenCalledTimes(1));
  const signal=vi.mocked(streamProgress).mock.calls[0][1].signal;
  expect(vi.mocked(streamProgress).mock.calls[0][0]).toBe('/matching/l1/run/stream');
  expect(signal).toBeDefined();expect(signal?.aborted).toBe(false);
  const writeCount=request.mock.calls.filter(([,init])=>init?.method&&init.method!=='GET').length;
  fireEvent.click(await openTourEntry());
  expect(await screen.findByText('Finish the current matching action before starting the tour.')).toBeInTheDocument();
  expect(location.pathname+location.search).toBe('/workflow?step=4&c=demo');
  expect(screen.queryByRole('heading',{name:'Choose a client'})).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(false);expect(streamProgress).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.filter(([,init])=>init?.method&&init.method!=='GET')).toHaveLength(writeCount);
});
