import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Analysis from './Analysis';
import {queryClient} from '../../lib/query';
vi.mock('./RateTable',()=>({default:()=> <p>Rate table view</p>,MoneyGaps:()=> <p>Money differences</p>}));
vi.mock('../../components/DayGridPanel',()=>({default:()=> <p>Daily grid view</p>}));
vi.mock('./LinkedTables',()=>({default:()=> <p>Linked evidence view</p>}));
vi.mock('./FollowUps',()=>({default:()=> <p>Follow-up view</p>}));
vi.mock('./CompareDialog',()=>({default:()=>null}));
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
const summary={days:['2026-10-20','2026-10-21'],outlets:['Harbor'],totals:{pos:10,matched:8,mismatched:1,review:1,open:2,amount:1000000,matched_amount:800000,cash:700000,credits_linked:3},unassigned:{credits:1,amount:100000},facets:{days:['2026-10-20','2026-10-21'],outlets:['Harbor','Central'],providers:['DANA'],reasons:{'Not in bank yet':1}}};
function mock(){const fetch=vi.fn(async(path:string)=>new Response(JSON.stringify(path.includes('/summary')?summary:{totals:{pos:10,pos_linked:9,stl:11,stl_bank:8},total:0,records:[],banks:{},status_counts:{}})));vi.stubGlobal('fetch',fetch);return fetch;}
it('shows factual selection counts, six monetary KPIs, scoped stage rings and all four tabs',async()=>{
  mock();render(<MemoryRouter><Analysis/></MemoryRouter>);
  expect(await screen.findByText('2 days, 1 outlet, 10 POS sales in this selection.')).toBeInTheDocument();
  expect(screen.getByText('Rp 800.000 (80% of sales value)')).toBeInTheDocument();
  expect(screen.getByText('Open without a sale')).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'POS to settlement: 90%'})).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByText('Daily grid view')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Table'}));
  expect(screen.getByText('Rate table view')).toBeInTheDocument();
});
it('asks Kira with the actual view scope and opens the POS-only Chains mode',async()=>{
  const fetch=mock(),ask=vi.fn();window.addEventListener('kira:ask',ask);
  render(<MemoryRouter initialEntries={['/analysis?tab=map&outlet=Harbor']}><Analysis/></MemoryRouter>);
  await screen.findByText(/10 POS sales in this selection/);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira about this view'}));
  expect(ask.mock.calls[0][0].detail.context).toMatchObject({page:'Match analysis',outlet:'Harbor',tab:'map'});
  fireEvent.click(screen.getByRole('button',{name:'Chains'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([path])=>path.includes('/records?')&&path.includes('pos_only=true'))).toBe(true));
  window.removeEventListener('kira:ask',ask);
});
