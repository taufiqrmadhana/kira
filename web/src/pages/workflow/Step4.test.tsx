import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within, waitFor} from '@testing-library/react';
import Step4 from './Step4';
const rules = [{id:'M1-A',stage:'l1',kind:'id',params:{},name:'First ID rule',conditions:[]},{id:'M1-B',stage:'l1',kind:'id',params:{},name:'Second ID rule',conditions:[]}];
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async (path:string)=>({ok:true,json:async()=> path.endsWith('/rules') ? rules : path.endsWith('/status') ? {converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true,matched:100,total:100},l2:{done:true,matched:90,total:100}}} : {totals:{pos:100,full:90,matched:90,mismatched:8,review:2,stl:100,l1:100,l2:90,cash:1000000,credits:10,credits_linked:9}}}))));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('explains the result ring with its actual totals and legend',async()=>{
  render(<Step4/>);
  const results=await screen.findByRole('region',{name:'Matching results'});
  expect(within(results).getByText('Green arc: traced to bank')).toBeInTheDocument();
  expect(within(results).getByText('Pale track: total POS sales')).toBeInTheDocument();
  expect(within(results).getByText(/90 of 100 sales reached the bank/)).toHaveTextContent('8 mismatched and 2 need review');
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
