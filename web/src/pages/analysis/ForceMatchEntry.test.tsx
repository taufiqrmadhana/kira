import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Analysis from './Analysis';
import {sideResponse} from './test-fixtures';
import type {ComponentProps} from 'react';
import type DayGridPanel from '../../components/DayGridPanel';
import type RateTable from './RateTable';
import type PayoutComparison from './PayoutComparison';
vi.mock('../../components/DayGridPanel',()=>({default:({onSelect}:ComponentProps<typeof DayGridPanel>)=><>{[0,90,100].map(rate=><button key={rate} onClick={()=>onSelect({day:'2026-10-24',outlet:'Harbor',rate,pos:142,pos_linked:142,full:rate===100?142:0,bank_credit:0,to_check:0,review:0,mismatched:142,not_in_bank:rate===100?0:9031421})}>{rate}% cell</button>)}</>}));
vi.mock('./RateTable',()=>({default:({onOpen}:ComponentProps<typeof RateTable>)=><button onClick={()=>onOpen({period:'2026-10-24',outlet:'Harbor',provider:'',pos:142,pos_linked:142,full:0,stl:142,stl_pos:142,stl_bank:0,bank:0,bank_linked:0,pos_amount:9031421,stl_nett:9031421,bank_credit:0,gap_sale:0,gap_payout:9031421})}>Red table rate</button>}));
vi.mock('./PayoutComparison',()=>({default:({scope,allowForceMatch}:ComponentProps<typeof PayoutComparison>)=><section aria-label="Payout comparison" data-scope={scope} data-force={String(allowForceMatch)}/>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function open(path='/analysis'){
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('/summary')?{days:['2026-10-24'],totals:{pos:142,matched:0,mismatched:142,review:0},facets:{days:['2026-10-24'],outlets:['Harbor'],providers:[]}}:sideResponse(url)))));
 render(<MemoryRouter initialEntries={[path]}><Analysis/></MemoryRouter>);
}
it('offers Force Match only inside Match map after a red-rate drilldown',async()=>{
 open();await screen.findByText('142 POS sales',{exact:false});
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'0% cell'}));
 const map=screen.getByRole('tabpanel',{name:'Match map'});
 fireEvent.click(await within(map).findByRole('button',{name:'Force Match'}));
 expect(screen.getByRole('region',{name:'Payout comparison'})).toHaveAttribute('data-force','true');
 expect(screen.getByRole('region',{name:'Payout comparison'}).getAttribute('data-scope')).toContain('outlet=Harbor');
 fireEvent.click(screen.getByRole('tab',{name:'Match rate'}));
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'100% cell'}));
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
});
it('keeps Force Match hidden for direct map visits and amber-rate drilldowns',async()=>{
 open('/analysis?tab=map&stage=l2');await screen.findByText('142 settlements');
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Match rate'}));
 fireEvent.click(screen.getByRole('button',{name:'90% cell'}));
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
});
it('supports red table-rate drilldowns and clears the action when the scope is cleared',async()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'Red table rate'}));
 expect(await screen.findByRole('button',{name:'Force Match'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
 expect(screen.queryByRole('button',{name:'Force Match'})).not.toBeInTheDocument();
});
