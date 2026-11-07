import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within, waitFor} from '@testing-library/react';
import Step4 from './Step4';
const rules = [{id:'M1-A',stage:'l1',kind:'id',params:{},name:'First ID rule',conditions:[]},{id:'M1-B',stage:'l1',kind:'id',params:{},name:'Second ID rule',conditions:[]}];
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async (path:string)=>({ok:true,json:async()=> path.endsWith('/rules') ? rules : path.endsWith('/status') ? {converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true,matched:100,total:100},l2:{done:true,matched:90,total:100}}} : path.endsWith('/analysis/summary')?{totals:{pos:100,matched:90,mismatched:8,review:2,open:3,records:103,amount:1200000,matched_amount:1000000}}:{totals:{rows:103,pos:100,full:90,matched:90,mismatched:11,review:2,stl:100,l1:100,l2:90,cash:1000000,credits:10,credits_linked:9}}}))));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps a rejected delete visible inside its confirmation dialog',async()=>{
  const original=vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(((path:string,init?:RequestInit)=>init?.method==='DELETE'?Promise.resolve(new Response('{"detail":"Matching is busy"}',{status:409})):original(path,init)) as typeof fetch);
  render(<Step4/>);fireEvent.click(await screen.findByRole('button',{name:'Actions for M1-A'}));
  fireEvent.click(screen.getByRole('menuitem',{name:'Delete rule'}));
  const dialog=screen.getByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'Delete rule'}));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Matching is busy');
  expect(within(dialog).getByRole('button',{name:'Delete rule'})).toBeEnabled();
});
it('explains the result ring with its actual totals and legend',async()=>{
  render(<Step4/>);
  const results=await screen.findByRole('region',{name:'Results'});
  expect(within(results).getByText('Green arc: traced to bank')).toBeInTheDocument();
  expect(within(results).getByText('Pale track: total POS sales')).toBeInTheDocument();
  expect(within(results).getByText(/90 of 100 sales reached the bank/)).toHaveTextContent('8 mismatched and 2 need review');
});

it('uses a single matching header and separates POS mismatches from records without sales',async()=>{
  const onBack=vi.fn(),onOpenAnalysis=vi.fn();render(<Step4 onBack={onBack} onOpenAnalysis={onOpenAnalysis}/>);
  expect(await screen.findByRole('heading',{name:'Run matching',level:2})).toBeVisible();
  expect(screen.getByText('Step 4 of 4')).toBeVisible();expect(screen.queryByRole('button',{name:'Refresh'})).not.toBeInTheDocument();
  const band=await screen.findByRole('region',{name:'Match summary'});
  expect(within(band).getByText('Mismatched').closest('.kpi')).toHaveTextContent('8');
  expect(within(band).getByText('Open without a sale').closest('.kpi')).toHaveTextContent('3');
  expect(screen.getByRole('button',{name:'Show the combined table (103 rows)'})).toBeVisible();
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/analysis/records'))).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Back'}));expect(onBack).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'Open match analysis'}));expect(onOpenAnalysis).toHaveBeenCalledOnce();
});

it('explains real unmatched rows and batch payouts instead of folding them into POS mismatches',async()=>{
  const original=vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(((path:string,init?:RequestInit)=>path.endsWith('/status')?Promise.resolve({ok:true,json:async()=>({converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true,matched:8781,total:8784,summary:{matched:8781,total:8784,hits:{'M1-A':8781},unmatched_left:3,unmatched_right:2}},l2:{done:true,matched:8641,total:8783,summary:{matched:8641,total:8783,hits:{},unmatched_left:142,unmatched_right:1,batches:69}}}})}):original(path,init)) as typeof fetch);
  render(<Step4/>);
  expect(await screen.findByText('8.781 of 8.784 POS sales linked; 3 not linked; 2 settlement rows left over.')).toBeVisible();
  expect(screen.getByText(/69 batch payouts \(many → 1\)/)).toHaveTextContent('142 not linked');
  expect(screen.getByLabelText('M1-A: 8.781 confirmed matches')).toBeInTheDocument();
});

it('puts destructive and reorder actions in a keyboard menu and requires delete confirmation',async()=>{
  render(<Step4/>);fireEvent.click(await screen.findByRole('button',{name:'Actions for M1-A'}));
  const menu=screen.getByRole('menu',{name:'Actions for M1-A'});
  expect(within(menu).getByRole('menuitem',{name:'Move up'})).toBeDisabled();
  expect(within(menu).getByRole('menuitem',{name:'Move down'})).toBeEnabled();
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Delete rule'}));
  const dialog=screen.getByRole('dialog',{name:'Delete M1-A?'});
  expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(false);
  fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('reorders by saved rule IDs from the overflow menu and opens the selected rule for editing',async()=>{
  render(<Step4/>);fireEvent.click(await screen.findByRole('button',{name:'Actions for M1-A'}));
  fireEvent.click(screen.getByRole('menuitem',{name:'Move down'}));
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([path,init])=>String(path).endsWith('/matching/l1/order')&&init?.body===JSON.stringify({rule_ids:['M1-B','M1-A']}))).toBe(true));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Actions for M1-B'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Actions for M1-B'}));fireEvent.click(screen.getByRole('menuitem',{name:'Edit rule'}));
  expect(screen.getByRole('heading',{name:'Edit M1-B'})).toBeVisible();
  expect(screen.getByRole('textbox',{name:'Rule name'})).toHaveValue('Second ID rule');
});

it('deletes the selected rule only after the dialog confirms it',async()=>{
  render(<Step4 clientId="demo"/>);fireEvent.click(await screen.findByRole('button',{name:'Actions for M1-A'}));
  fireEvent.click(screen.getByRole('menuitem',{name:'Delete rule'}));
  fireEvent.click(within(screen.getByRole('dialog',{name:'Delete M1-A?'})).getByRole('button',{name:'Delete rule'}));
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([path,init])=>String(path).endsWith('/matching/rules/M1-A')&&init?.method==='DELETE'&&new Headers(init.headers).get('X-Kira-Client')==='demo')).toBe(true));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('opens an editable Kira question with matching context and keeps the glossary available',async()=>{
  const ask=vi.fn();window.addEventListener('kira:ask',ask);
  render(<Step4/>);fireEvent.click(await screen.findByRole('button',{name:'Why not 100%? Ask Kira'}));
  expect((ask.mock.calls[0][0] as CustomEvent).detail).toMatchObject({message:'Why is the match rate not 100%?',context:{page:'Workflow',step:4}});
  expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes('/kira/chat'))).toBe(false);
  fireEvent.click(screen.getByText('Glossary',{selector:'summary'}));
  expect(screen.getByText('Batch payout',{selector:'dt'})).toBeVisible();
  window.removeEventListener('kira:ask',ask);
});
it('moves among rule selection ticks with arrows and Home/End',async()=>{
  render(<Step4/>);
  const first=await screen.findByRole('checkbox',{name:'Select M1-A: First ID rule'});
  const second=screen.getByRole('checkbox',{name:'Select M1-B: Second ID rule'});
  expect(first.tabIndex).toBe(0);expect(second.tabIndex).toBe(-1);
  fireEvent.keyDown(first,{key:'ArrowDown'});
  expect(second).toHaveFocus();expect(first.tabIndex).toBe(-1);
  fireEvent.keyDown(second,{key:'Home'});expect(first).toHaveFocus();
});

it('animates only the pending stage without inventing intermediate matching results',async()=>{
  const original=vi.mocked(fetch).getMockImplementation()!;
  let finish:(value:Response)=>void=()=>{};
  vi.mocked(fetch).mockImplementation(((path:string,init?:RequestInit)=>path.endsWith('/l1/run')?new Promise(resolve=>{finish=resolve;}):original(path,init)) as typeof fetch);
  const view=render(<Step4/>);
  const stage=await screen.findByRole('region',{name:'POS to settlement'});
  fireEvent.click(within(stage).getByRole('button',{name:'Run matching'}));
  const flow=screen.getByRole('group',{name:'Matching flow'});
  expect(within(flow).getByRole('status')).toHaveTextContent('Matching POS to settlement');
  expect(view.container.querySelectorAll('.wf-flow-dot')).toHaveLength(3);
  expect(within(flow).queryByRole('progressbar')).not.toBeInTheDocument();
  expect(view.container.querySelector('.step4-rule-hits')).toBeNull();
  finish({ok:true,json:async()=>({matched:96,total:100,hits:{'M1-A':90,'M1-B':6}})} as Response);
  await waitFor(()=>expect(view.container.querySelector('.wf-flow-dot')).toBeNull());
  expect(await screen.findByText('POS to settlement complete: 96 of 100 linked.')).toBeVisible();
  expect(view.container.querySelectorAll('.step4-rule-hits')).toHaveLength(2);
  expect(screen.getByLabelText('M1-A: 90 confirmed matches')).toBeInTheDocument();
});

it('keeps pending matching readable and its final counts instant with reduced motion',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  const original=vi.mocked(fetch).getMockImplementation()!;
  let finish:(value:Response)=>void=()=>{};
  vi.mocked(fetch).mockImplementation(((path:string,init?:RequestInit)=>path.endsWith('/l1/run')?new Promise(resolve=>{finish=resolve;}):original(path,init)) as typeof fetch);
  const view=render(<Step4/>);
  const stage=await screen.findByRole('region',{name:'POS to settlement'});
  fireEvent.click(within(stage).getByRole('button',{name:'Run matching'}));
  expect(screen.getByRole('group',{name:'Matching flow'})).toHaveTextContent('Matching POS to settlement');
  expect(view.container.querySelector('.wf-flow-dot')).toBeNull();
  finish({ok:true,json:async()=>({matched:96,total:100,hits:{'M1-A':90,'M1-B':6}})} as Response);
  const hits=await screen.findByLabelText('M1-A: 90 confirmed matches');
  expect(hits).toHaveTextContent('90');
});

it('shows both saved stage rates alongside the result summary',async()=>{
 render(<Step4/>);expect(await screen.findByRole('img',{name:'POS to settlement: 100%'})).toBeVisible();expect(screen.getByRole('img',{name:'Settlement to bank: 90%'})).toBeVisible();
});
