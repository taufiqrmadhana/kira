import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import CompareDialog from './CompareDialog';
import type {ResultRecord} from './RecordsTable';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const record:ResultRecord={i:0,g:1,rid:'pos:SALE-1',key:'SALE-1',day:'2026-10-24',outlet:'Menteng',provider:'QRIS',status:'Matched',reason:'',r1:'PS1',r2:'SM1',group_size:92,group_nett:999000,bank_i:2,pos:{branch:'Menteng',payment_amount:10000,sales_datetime_out:'2026-10-24'},stl:{branch:'Menteng',gross_amount:11000,nett_amount:9500,transaction_date:'2026-10-24'}};
const banks={'2':{kredit:1000000,tanggal_transaksi:'2026-10-25',keterangan:'BCA payout 24 October'}};
it('compares the full settlement batch to its bank credit and treats later bank dates as information',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({records:[]}))));
  render(<CompareDialog record={record} banks={banks} onClose={()=>{}}/>);
  const table=screen.getByRole('table',{name:'Payment comparison'});
  const net=within(table).getByRole('row',{name:/Net settlement/});
  expect(net).toHaveTextContent('Rp 999.000');expect(net).toHaveTextContent('Rp 1.000.000');expect(net).toHaveTextContent('Differs');
  expect(within(table).getByRole('row',{name:/Date/})).toHaveTextContent('Information');
  expect(within(table).getByRole('row',{name:/Amount/})).toHaveTextContent('Differs');
  expect(screen.getByText(/92 settlements in the whole payout/)).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Follow-up note'})).toBeEnabled());
});
it('loads existing note and assignee before explicitly saving with the stable record identity',async()=>{
  const fetch=vi.fn(async(_path:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='POST'?{status:'investigating',note:'Updated note',assignee:'Ayu',by:'Taufiq'}:{records:[{rid:record.rid,follow_up:{status:'investigating',note:'Existing note',assignee:'Ayu'}}]})));
  vi.stubGlobal('fetch',fetch);render(<CompareDialog record={record} banks={banks} client="client-a" onClose={()=>{}}/>);
  const input=await screen.findByRole('textbox',{name:'Follow-up note'});
  await waitFor(()=>expect(input).toHaveValue('Existing note'));
  expect(screen.getByRole('textbox',{name:'Assignee'})).toHaveValue('Ayu');
  expect(fetch.mock.calls.every(([,init])=>init?.method!=='POST')).toBe(true);
  fireEvent.change(input,{target:{value:'Updated note'}});fireEvent.click(screen.getByRole('button',{name:'Save follow-up'}));
  await screen.findByText('Follow-up saved.');
  const request=fetch.mock.calls.find(([,init])=>init?.method==='POST')!;
  expect(JSON.parse(String(request[1]?.body))).toEqual({rid:'pos:SALE-1',status:'investigating',note:'Updated note',assignee:'Ayu'});
  expect(new Headers(request[1]?.headers).get('X-Kira-Client')).toBe('client-a');
});
it('blocks note saving if the existing follow-up cannot be read',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:'Read unavailable'}),{status:503})));
  render(<CompareDialog record={record} banks={banks} onClose={()=>{}}/>);
  expect(await screen.findByText('Read unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Save follow-up'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Try again'})).toBeInTheDocument();
});
it('opens a record-specific Kira draft without sending or saving',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({records:[]}))));
  const ask=vi.fn(),close=vi.fn();window.addEventListener('kira:ask',ask);
  render(<CompareDialog record={record} banks={banks} onClose={close}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira about this record'}));
  expect(ask.mock.calls[0][0].detail.context.record).toBe('pos:SALE-1');expect(close).toHaveBeenCalledOnce();
  window.removeEventListener('kira:ask',ask);
});
