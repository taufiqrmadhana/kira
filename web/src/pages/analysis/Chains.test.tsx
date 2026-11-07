import {useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import Chains from './Chains';
import {queryClient} from '../../lib/query';
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
const record={i:0,g:0,rid:'pos:SALE-1',key:'SALE-1',day:'2026-10-24',outlet:'Harbor',provider:'SHOPEEPAY',status:'Mismatched',reason:'Not in bank yet',r1:'PS1',r2:'',group_size:142,group_nett:null,bank_i:null,pos:{sales_number:'SALE-1',payment_amount:100},stl:{reference:'STL-1',nett_amount:100}};
it('requests only POS sales before pagination and identifies the missing stage',async()=>{
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify({total:142,records:[record],banks:{},status_counts:{Mismatched:142}})));vi.stubGlobal('fetch',fetch);
  render(<Chains scope="outlet=Harbor"/>);
  expect(await screen.findByText('SALE-1')).toBeInTheDocument();
  expect(fetch.mock.calls[0][0]).toContain('pos_only=true');
  expect(screen.getByText('No bank credit yet')).toBeInTheDocument();
  expect(screen.getByLabelText('Stage 1 linked by PS1')).toBeInTheDocument();
  expect(screen.getByLabelText('Stage 2 missing')).toBeInTheDocument();
  expect(screen.getByText('142 POS sales in this selection')).toBeInTheDocument();
});
it('uses the server difference filter and explains that expected fees remain included',async()=>{
  const fetch=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify({total:142,records:[record],banks:{},status_counts:{Mismatched:142}})));vi.stubGlobal('fetch',fetch);
  function View(){const[scope,setScope]=useState('');return <Chains scope={scope} onScopeChange={setScope}/>;}
  render(<View/>);await screen.findByText('SALE-1');
  fireEvent.click(screen.getByRole('switch',{name:'Only rows with differences'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([path])=>path.includes('only_differences=true')&&path.includes('pos_only=true'))).toBe(true));
  expect(screen.getByText(/Expected rounding and fees are included/)).toBeInTheDocument();
});
