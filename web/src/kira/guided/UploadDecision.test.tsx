import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import UploadDecision from './UploadDecision';
import type {Proposal} from '../../pages/workflow/types';
afterEach(cleanup);
const proposal:Proposal={proposed:[{name:'outlet_old',type:'text'},{name:'outlet_new',type:'text'},{name:'branch',type:'text'},{name:'payment_amount',type:'number'},{name:'sales_datetime_out',type:'datetime'}],delimiter:',',diff:{added:['outlet_new'],missing:[],types:[],delimiter:false,rename:{}},rows:40,files:2,samples:{outlet_old:'Garden Mall',outlet_new:'Harbor Square',payment_amount:'2000',sales_datetime_out:'2026-10-27'},rename:{outlet_old:{to:'branch'},outlet_new:{to:'branch'}}};
it('shows every source alias and changes one without losing the other',()=>{
 const save=vi.fn();render(<UploadDecision area="pos" proposal={proposal} version={1} busy={false} onSave={save} onReview={()=>{}}/>);
 expect(screen.getByRole('combobox',{name:'Guided POS source for branch'})).toHaveValue('outlet_old');
 fireEvent.change(screen.getByRole('combobox',{name:'Guided POS source for branch 2'}),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Save rule v2'}));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({choice:'update',rename:{outlet_old:'branch',outlet_new:''}}));
});
it('prevents saving when an essential field has no source and offers page review',()=>{
 const save=vi.fn(),review=vi.fn();render(<UploadDecision area="pos" proposal={{...proposal,rename:{},proposed:proposal.proposed.filter(column=>column.name!=='branch')}} busy={false} onSave={save} onReview={review}/>);
 expect(screen.getByRole('button',{name:'Save rule v1'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('Choose a source for Outlet');
 fireEvent.click(screen.getByRole('button',{name:'Review on the page'}));expect(review).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
});
