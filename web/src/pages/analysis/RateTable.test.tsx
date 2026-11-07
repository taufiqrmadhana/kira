import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import RateTable, {MoneyGaps, type Rate} from './RateTable';
const row:Rate={period:'2026-10-24',outlet:'Harbor',provider:'Pay',pos:142,pos_linked:142,full:0,stl:142,stl_pos:142,stl_bank:0,bank:0,bank_linked:0,pos_amount:9500000,stl_nett:9031421,bank_credit:0,gap_sale:0,gap_payout:9031421};
const gaps={explained:600,unexplained:9031471,latest_bank_date:'2026-10-27',kinds:[{kind:'fee',label:'Handling fee',explained:true,count:1,amount:100,samples:[{key:'fee-1'}]},{kind:'sale_diff',label:'Sale difference',explained:false,count:1,amount:-50,samples:[{key:'sale-1'}]},{kind:'rounding',label:'Rounding',explained:true,count:2,amount:500,samples:[{key:'round-1'}]},{kind:'not_in_bank',label:'Settled, not in the bank yet',explained:false,count:142,amount:9031421,samples:[{key:'harbor-1'}]}]};
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function setup(){const fetch=vi.fn(async(path:string)=>json(path.includes('/gaps')?gaps:{rows:[row],total:1,totals:row,unassigned:{credits:1,amount:1250000}}));vi.stubGlobal('fetch',fetch);return fetch;}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('groups rates with sentence controls, keeps the four directions readable, and opens the row scope',async()=>{
  const fetch=setup(),onOpen=vi.fn();render(<MemoryRouter initialEntries={['/analysis?c=demo']}><RateTable scope="outlet=Harbor" onOpen={onOpen}/></MemoryRouter>);
  const table=await screen.findByRole('table',{name:'Match rate'});
  expect(within(table).getByRole('columnheader',{name:'Date'})).toBeVisible();
  expect(within(table).getAllByRole('img')).toHaveLength(5);
  expect(within(table).getByRole('img',{name:'End to end: 0%'})).toBeVisible();
  fireEvent.click(within(table).getByText('Harbor'));expect(onOpen).toHaveBeenCalledWith(row);
  fireEvent.click(within(screen.getByRole('group',{name:'Group rates by period'})).getByRole('button',{name:'Week'}));
  fireEvent.click(screen.getByRole('button',{name:'Provider',pressed:false}));
  fireEvent.click(screen.getByRole('switch',{name:'Only rows under 100%'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([path])=>path.includes('period=week')&&path.includes('by_provider=true')&&path.includes('below=true'))).toBe(true));
});
it('sums ticked rows from evidence and keeps reduced-motion subtotals instant',async()=>{
  setup();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  render(<MemoryRouter><RateTable scope="" onOpen={()=>{}}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('checkbox',{name:'Select Match rate row 1'}));
  const subtotal=screen.getByRole('status',{name:'Ticked rows subtotal'});
  expect(subtotal).toHaveTextContent('1 ticked row');expect(subtotal).toHaveTextContent('142 sales');expect(subtotal).toHaveTextContent('Rp 9.031.421');
  fireEvent.click(screen.getByRole('checkbox',{name:'Select Match rate row 1'}));expect(screen.queryByRole('status',{name:'Ticked rows subtotal'})).not.toBeInTheDocument();
});
it('groups money differences by action and amount, preserves scope and names sampled evidence honestly',async()=>{
  setup();render(<MemoryRouter initialEntries={['/analysis?c=demo&view=grid']}><MoneyGaps scope="outlet=Harbor&date_from=2026-10-24"/></MemoryRouter>);
  const section=await screen.findByRole('region',{name:'Money differences'});
  await within(section).findByText('Bank data until Tue 27 Oct 2026');
  const links=within(section).getAllByRole('link');
  expect(links.map(link=>link.querySelector('strong')?.textContent)).toEqual(['Settled, not in the bank yet','Sale difference','Rounding','Handling fee']);
  expect(links[0]).toHaveAttribute('href',expect.stringContaining('reason=Not+in+bank+yet'));
  expect(links[0]).toHaveAttribute('href',expect.stringContaining('c=demo'));
  expect(links[1]).toHaveAttribute('href',expect.stringContaining('keys=sale-1'));
  expect(links[1]).toHaveTextContent('1 record');expect(links[2]).toHaveTextContent('Sample evidence');
});
it('links an unassigned bank credit to its real evidence without an outlet filter',async()=>{
  setup();render(<MemoryRouter initialEntries={['/analysis?c=demo&outlet=Harbor']}><RateTable scope="outlet=Harbor" onOpen={()=>{}}/></MemoryRouter>);
  const link=await screen.findByRole('link',{name:'See it'});
  expect(link).toHaveAttribute('href',expect.stringContaining('reason=Credit+with+no+settlement'));
  expect(link.getAttribute('href')).not.toContain('outlet=');
});
