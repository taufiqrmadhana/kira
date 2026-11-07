import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import DayGridPanel from './DayGridPanel';

vi.mock('./DayGrid',()=>({DayGrid:({rows,gaps,bankAsOf}: {rows:unknown[];gaps:unknown[];bankAsOf?:string})=><p>{rows.length} days, {gaps.length} flags{bankAsOf ? `, bank evidence through ${bankAsOf}` : ""}</p>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const json=(data:unknown)=>new Response(JSON.stringify(data));

it('loads every daily outlet page and flags with the current selection',async()=>{
  const fetch=vi.fn(async(url:string)=>{
    const params=new URL(url,'http://localhost').searchParams;
    expect(params.get('outlet')).toBe('Harbor');
    if(url.includes('/gaps') && !params.has('by_day')) return json({latest_bank_date:'2026-10-27'});
    if(url.includes('/gaps')) {expect(params.get('by_day')).toBe('true');return json({days:[{day:'2026-10-24',outlet:'Harbor',to_check:9031421,not_in_bank:9031421,review:0}]});}
    expect(params.get('period')).toBe('day');expect(params.get('by_outlet')).toBe('true');
    return json({rows:[{period:params.get('offset')==='0'?'2026-10-24':'2026-10-25',outlet:'Harbor',pos:1,full:0}],total:2});
  });
  vi.stubGlobal('fetch',fetch);
  render(<DayGridPanel scope="outlet=Harbor" onSelect={()=>{}}/>);
  expect(await screen.findByText('2 days, 1 flags, bank evidence through 2026-10-27')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('shows an API error and retries without presenting partial totals',async()=>{
  let fail=true;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>fail?new Response('{"detail":"Daily results unavailable"}',{status:409}):json(url.includes('/gaps')?{days:[]}:{rows:[],total:0})));
  render(<DayGridPanel onSelect={()=>{}}/>);
  await screen.findByText('Daily results unavailable');fail=false;
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByText('No daily results in this selection')).toBeInTheDocument();
});

it('ignores older scope responses while keeping shared reads alive',async()=>{
  const pending: {url:string; resolve:(value:Response)=>void}[]=[];
  vi.stubGlobal('fetch',vi.fn((url:string)=>new Promise<Response>(resolve=>pending.push({url,resolve}))));
  const view=render(<DayGridPanel scope="outlet=A" onSelect={()=>{}}/>);
  await waitFor(()=>expect(pending).toHaveLength(3));
  view.rerender(<DayGridPanel scope="outlet=B" onSelect={()=>{}}/>);
  await waitFor(()=>expect(pending).toHaveLength(6));
  for(const item of pending.slice(3)) item.resolve(json(item.url.includes('/gaps') ? {days:[]} : {rows:[{period:'2026-10-24',outlet:'B',pos:1,full:1}],total:1}));
  expect(await screen.findByText('1 days, 0 flags')).toBeInTheDocument();
  for(const item of pending.slice(0,3)) item.resolve(json(item.url.includes('/gaps') ? {days:[]} : {rows:[],total:0}));
  await waitFor(()=>expect(screen.getByText('1 days, 0 flags')).toBeInTheDocument());
});
