import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import ConversionPreview from './ConversionPreview';
import type {Table} from './types';
afterEach(cleanup);
it('puts business fields first and removes empty ledger rows from the transaction preview',()=>{
  const table:Table={total:3,columns:[{name:'matchmade_bq_id',type:'text'},{name:'reference',type:'text'},{name:'transaction_date',type:'date'},{name:'nett_amount',type:'number'},{name:'branch',type:'text'}],rows:[{matchmade_bq_id:'empty-uuid',transaction_date:'2026-10-20'},{matchmade_bq_id:'real-uuid',reference:'PAY-1',transaction_date:'2026-10-20',nett_amount:120000,branch:'Menteng'}]};
  render(<ConversionPreview area="settlement" files={[]} fileCount={1} table={table} current scanning={false} reveal={false}/>);
  const preview=screen.getByRole('table',{name:'Converted Settlement rows'});
  expect(within(preview).getAllByRole('columnheader').map(el=>el.textContent)).toEqual(['Nett amount','Transaction date','Reference','Outlet']);
  expect(within(preview).getAllByRole('row')).toHaveLength(2);
  expect(within(preview).getByText('PAY-1')).toBeInTheDocument();
  expect(within(preview).queryByText('empty-uuid')).not.toBeInTheDocument();
});
it('shows source samples with useful values ahead of internal identifiers',()=>{
  render(<ConversionPreview area="pos" files={[]} fileCount={1} table={{total:0,rows:[],columns:[]}} current scanning={false} reveal={false} proposal={{rows:2,files:1,delimiter:',',rename:{},diff:null,proposed:[{name:'matchmade_bq_id',type:'text'},{name:'payment_amount',type:'number'}],samples:{matchmade_bq_id:'hidden-uuid',payment_amount:'123000'}}}/>);
  expect(screen.queryByText('hidden-uuid')).not.toBeInTheDocument();
  expect(within(screen.getByRole('table',{name:'Detected column samples for POS'})).getByText('Payment amount')).toBeInTheDocument();
});
