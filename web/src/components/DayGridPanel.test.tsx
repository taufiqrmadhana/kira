import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import DayGridPanel from './DayGridPanel';

vi.mock('./DayGrid',()=>({DayGrid:({rows,gaps}: {rows:unknown[];gaps:unknown[]})=><p>{rows.length} days, {gaps.length} flags</p>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const json=(data:unknown)=>new Response(JSON.stringify(data));

it('loads every daily outlet page and flags with the current selection',async()=>{
  const fetch=vi.fn(async(url:string)=>{
    const params=new URL(url,'http://localhost').searchParams;
    expect(params.get('outlet')).toBe('Harbor');
    if(url.includes('/gaps')) {expect(params.get('by_day')).toBe('true');return json({days:[{day:'2026-10-24',outlet:'Harbor',to_check:9031421,not_in_bank:9031421,review:0}]});}
    expect(params.get('period')).toBe('day');expect(params.get('by_outlet')).toBe('true');
    return json({rows:[{period:params.get('offset')==='0'?'2026-10-24':'2026-10-25',outlet:'Harbor',pos:1,full:0}],total:2});
  });
  vi.stubGlobal('fetch',fetch);
  render(<DayGridPanel scope="outlet=Harbor" onSelect={()=>{}}/>);
  expect(await screen.findByText('2 days, 1 flags')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('shows an API error and retries without presenting partial totals',async()=>{
  let fail=true;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>fail?new Response('{"detail":"Daily results unavailable"}',{status:409}):json(url.includes('/gaps')?{days:[]}:{rows:[],total:0})));
  render(<DayGridPanel onSelect={()=>{}}/>);
  await screen.findByText('Daily results unavailable');fail=false;
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByText('No daily results in this selection')).toBeInTheDocument();
});

it('aborts old requests on a selection change',async()=>{
  const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>{signals.push(init.signal!);return new Promise(()=>{});}));
  const view=render(<DayGridPanel scope="outlet=A" onSelect={()=>{}}/>);
  await waitFor(()=>expect(signals).toHaveLength(2));
  view.rerender(<DayGridPanel scope="outlet=B" onSelect={()=>{}}/>);
  expect(signals.slice(0,2).every(s=>s.aborted)).toBe(true);
});
