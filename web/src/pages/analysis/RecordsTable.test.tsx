import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {useState} from 'react';
import {MemoryRouter} from 'react-router-dom';
import RecordsTable from './RecordsTable';
import {download} from '../../lib/api';
import {queryClient} from '../../lib/query';

vi.mock('../../lib/api',async original=>({...await original<typeof import('../../lib/api')>(),download:vi.fn()}));
afterEach(()=>{cleanup();queryClient.clear();localStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
const first={i:0,g:0,rid:'pos:SALE-001',key:'SALE-001',day:'2026-10-20',outlet:'Central Plaza',provider:'SHOPEEPAY',status:'Matched',reason:'',r1:'PS1',r2:'SM1',group_size:92,group_nett:5852773,bank_i:0,pos:{sales_number:'SALE-001',payment_amount:175000},stl:{reference:'STL-001',nett_amount:175000}};
const response={total:8787,offset:0,limit:20,status_counts:{Matched:8639,Mismatched:148},columns:{pos:[],settlement:[],bank:[]},records:[first,{...first,i:1,rid:'pos:SALE-002',key:'SALE-002',pos:{sales_number:'SALE-002',payment_amount:75000},stl:{reference:'STL-002',nett_amount:75000}}],banks:{'0':{reference:'BANK-OWN-REFERENCE',keterangan:'Batch credit for Central Plaza',kredit:5853000,tanggal_transaksi:'2026-10-21'}}};
function mount(props:Parameters<typeof RecordsTable>[0]={}){return render(<MemoryRouter><RecordsTable {...props}/></MemoryRouter>);}

it('shows the bank’s own reference and credit once beside its group of sales',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response))));
  mount();
  expect(await screen.findByText('SALE-001')).toBeInTheDocument();
  expect(screen.getByText('STL-001')).toBeInTheDocument();
  expect(screen.getAllByText('BANK-OWN-REFERENCE')).toHaveLength(1);
  expect(screen.getAllByText('Rp 5.853.000')).toHaveLength(1);
  expect(screen.getByText('M2-0001')).toBeInTheDocument();
  expect(screen.getByText('pays 92')).toBeInTheDocument();
  expect(screen.getByText('SM1')).toBeInTheDocument();
  expect(screen.getByText('Same bank credit (M2-0001)')).toBeInTheDocument();
  for(const name of ['Result','POS sale','Settlement','Bank credit'])expect(screen.getByRole('columnheader',{name})).toBeInTheDocument();
  expect(screen.getByText('1–2 of 8.787')).toBeInTheDocument();
});

it('uses the statement description when no bank reference exists and never copies a sale reference',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...response,records:[first],banks:{'0':{keterangan:'TRANSFER FROM PROVIDER',kredit:5853000}}}))));
  mount();
  const description=await screen.findByText('TRANSFER FROM PROVIDER');
  expect(description).toHaveAttribute('title','TRANSFER FROM PROVIDER');
  expect(screen.getAllByText('SALE-001')).toHaveLength(1);
});

it('keeps absent evidence explicit instead of inventing references or zero amounts',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...response,total:1,records:[{...first,bank_i:null,stl:null,status:'Mismatched',reason:'No settlement',r1:'',r2:''}],banks:{}}))));
  mount();
  expect(await screen.findByText('No settlement')).toBeInTheDocument();
  expect(screen.getByText('No bank credit')).toBeInTheDocument();
  expect(screen.queryByText('Rp 0')).not.toBeInTheDocument();
  expect(screen.queryByText('M2-0001')).not.toBeInTheDocument();
});

it('keeps record context available through Columns without crowding the payment trail',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response))));
  mount();await screen.findByText('SALE-001');
  expect(screen.queryByRole('columnheader',{name:'Outlet'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Columns'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Outlet'}));
  expect(screen.getByRole('columnheader',{name:'Outlet'})).toBeInTheDocument();
});

it('paginates and sorts on the server while preserving scope and client',async()=>{
  localStorage.setItem('kira-client','wrong');
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(response)));vi.stubGlobal('fetch',fetch);
  mount({scope:'outlet=Central+Plaza&date_from=2026-10-20',client:'zestly-demo'});
  await screen.findByText('SALE-001');
  fireEvent.click(screen.getByRole('button',{name:'Records next page'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([path])=>new URL(String(path),'http://localhost').searchParams.get('offset')==='20')).toBe(true));
  fireEvent.click(screen.getByRole('button',{name:'Sale amount'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([path])=>new URL(String(path),'http://localhost').searchParams.get('sort')==='pos.payment_amount')).toBe(true));
  const last=fetch.mock.calls.at(-1)!;
  expect(new URL(String(last[0]),'http://localhost').searchParams.get('outlet')).toBe('Central Plaza');
  expect(new URL(String(last[0]),'http://localhost').searchParams.get('offset')).toBe('0');
  expect(new Headers(last[1].headers).get('X-Kira-Client')).toBe('zestly-demo');
});

it('exports the complete filtered selection with the captured client and no page offset',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response))));
  mount({scope:'outlet=Central+Plaza&status=Mismatched',client:'zestly-demo'});
  await screen.findByText('SALE-001');
  fireEvent.click(screen.getByRole('button',{name:'Export records'}));
  expect(download).toHaveBeenCalledWith('/analysis/export?outlet=Central+Plaza&status=Mismatched','kira-records.csv','zestly-demo');
});

it('restarts at the first page when filters change',async()=>{
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(response)));vi.stubGlobal('fetch',fetch);
  const view=mount({scope:'outlet=First'});
  await screen.findByText('SALE-001');
  fireEvent.click(screen.getByRole('button',{name:'Records next page'}));
  await waitFor(()=>expect(fetch.mock.calls.length).toBe(2));
  view.rerender(<MemoryRouter><RecordsTable scope="outlet=Second"/></MemoryRouter>);
  await waitFor(()=>expect(fetch.mock.calls.length).toBe(3));
  const params=new URL(String(fetch.mock.calls.at(-1)![0]),'http://localhost').searchParams;
  expect(params.get('outlet')).toBe('Second');expect(params.get('offset')).toBe('0');
});

it('provides Records filters, status counts, grouping and export of the full selection',async()=>{
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(response)));vi.stubGlobal('fetch',fetch);
  function View(){const[scope,setScope]=useState('');return <RecordsTable view="records" scope={scope} onScopeChange={setScope} facets={{providers:['SHOPEEPAY'],reasons:['Not in bank yet']}}/>;}
  render(<MemoryRouter><View/></MemoryRouter>);
  await screen.findByText('SALE-001');
  expect(screen.getByRole('button',{name:'Export 8.787 rows'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Mismatched 148'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.includes('status=Mismatched'))).toBe(true));
  fireEvent.change(screen.getByRole('searchbox',{name:'Search records'}),{target:{value:'SALE'}});
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.includes('q=SALE'))).toBe(true));
  fireEvent.click(screen.getByText('More filters'));
  fireEvent.change(screen.getByLabelText('Minimum amount (Rp)'),{target:{value:'100000'}});
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.includes('amount_min=100000'))).toBe(true));
  fireEvent.click(screen.getByRole('switch',{name:'Group by bank credit'}));
  await waitFor(()=>expect(screen.getAllByText('BANK-OWN-REFERENCE')).toHaveLength(2));
});

it('opens the exact record and bank context from a reference or row',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response))));const compare=vi.fn();
  mount({view:'records',onCompare:compare});
  const reference=await screen.findByRole('button',{name:'Compare SALE-001'});
  fireEvent.click(reference);
  expect(compare).toHaveBeenCalledWith(expect.objectContaining({rid:'pos:SALE-001'}),response.banks,reference);
  fireEvent.click(screen.getAllByText('Rp 75.000')[0].closest('tr')!);
  expect(compare.mock.calls.at(-1)?.[0].rid).toBe('pos:SALE-002');
});
