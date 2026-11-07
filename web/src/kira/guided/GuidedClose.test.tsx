import {afterEach,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import GuidedClose from './GuidedClose';
import type {GuidedController} from './useGuidedClose';
import type {WorkflowData} from '../../pages/workflow/types';
import {pickedFileKey} from './engine';
vi.mock('../../lib/query',()=>({useEndpoint:(path:string)=>({data:path==='/matching/results'?{totals:{pos:100,full:90,l1:98,l2:92,stl:100,credits:10,credits_linked:9}}:path==='/analysis/summary'?{totals:{mismatched:8,review:2,open:3},unassigned:{credits:1,amount:1250000}}:path==='/performance/anomalies'?{anomalies:[{kind:'missing_money',outlet:'Harbor Square',rupiah:9031421,why:'Settled, not in the bank yet',period:{from:'2026-10-24',to:'2026-10-24'},filter:{outlet:'Harbor Square',date_from:'2026-10-24',date_to:'2026-10-24',reason:'Not in bank yet'}},{kind:'missing_money',outlet:'Garden Mall',rupiah:171000,why:'No settlement',period:{from:'2026-10-22',to:'2026-10-22'},filter:{outlet:'Garden Mall'}}]}:{records:[]},loading:false,retry:vi.fn()})}));
afterEach(cleanup);
function controller(step:number):GuidedController{
 const data={status:{files:{pos:7,settlement:7,bank:7},upload_rules_pending:[]},files:[],tables:{parsed:{}},cleaning:{rules:{version:1},recommendations:[]}} as unknown as WorkflowData;
 return {client:'demo',user:'Taufiq',state:{active:true,paused:false,step,follow:true,completed:[]},step,data,area:null,busy:'',progress:{},wrong:[],error:'',workflow:{},request:vi.fn(async()=>({})),run:vi.fn(async(_label:string,action:()=>Promise<unknown>)=>{await action();return true;}),advance:vi.fn(),pause:vi.fn(),finish:vi.fn(),exportResults:vi.fn(async()=>{})} as unknown as GuidedController;
}
it('moves focus to a new step after a decision while preserving an active free-chat input',()=>{
 const first=controller(0),next={...controller(1),area:'pos' as const};
 const view=render(<><textarea aria-label="Free question"/><GuidedClose guide={first} onAsk={()=>{}}/></>);
 expect(screen.getByRole('heading',{name:/Step 1 of 10/})).not.toHaveFocus();
 fireEvent.click(screen.getByRole('button',{name:/^Start$/}));
 view.rerender(<><textarea aria-label="Free question"/><GuidedClose guide={next} onAsk={()=>{}}/></>);
 expect(screen.getByRole('heading',{name:/Step 2 of 10/})).toHaveFocus();
 screen.getByRole('textbox',{name:'Free question'}).focus();
 view.rerender(<><textarea aria-label="Free question"/><GuidedClose guide={{...controller(2),area:'settlement'}} onAsk={()=>{}}/></>);
 expect(screen.getByRole('textbox',{name:'Free question'})).toHaveFocus();
});
it('keeps the latest completed decision visible while earlier steps remain available in a disclosure',()=>{
 const guide=controller(4);guide.state.completed=['POS: 8 files, 9.982 source rows','Settlement: 8 files, 9.981 source rows','Bank: 8 files, 80 source rows'];
 render(<GuidedClose guide={guide} onAsk={()=>{}}/>);
 expect(screen.getByText('Bank: 8 files, 80 source rows')).toBeVisible();
 expect(screen.getByText('POS: 8 files, 9.982 source rows')).not.toBeVisible();
 fireEvent.click(screen.getByText('2 earlier steps'));
 expect(screen.getByText('POS: 8 files, 9.982 source rows')).toBeVisible();
});
it('requires an explicit local Keep or a client-bound Move before leaving wrong-area intake',async()=>{
 const guide=controller(1),file={id:45,type:'pos' as const,name:'SET.csv',folder:'day8',sheet:null,size:10,rows:2,looks_like:'settlement' as const,wrong_area:true,uploaded_by:'Taufiq',uploaded_at:''};
 guide.data!.files=[file];guide.area='pos';guide.wrong=[file];
 function Intake(){const [kept,setKept]=useState(false);return <GuidedClose guide={{...guide,wrong:kept?[]:[file],keep:()=>setKept(true)}} onAsk={()=>{}}/>;}
 const view=render(<Intake/>);
 expect(screen.getByRole('button',{name:/^Continue/})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Keep in POS'}));
 expect(screen.getByRole('button',{name:/^Continue/})).toBeEnabled();expect(guide.request).not.toHaveBeenCalled();
 view.unmount();render(<Intake/>);fireEvent.click(screen.getByRole('button',{name:'Move it to Settlement'}));
 await waitFor(()=>expect(guide.request).toHaveBeenCalledWith('/files/45/move',{to:'settlement'}));
});
it('keeps Continue disabled while newly picked files await upload even when older files already exist',()=>{
 const guide=controller(1);guide.area='pos';guide.data!.files=[{id:1,type:'pos',name:'old.csv',folder:'',sheet:null,size:10,rows:2,looks_like:null,wrong_area:false,uploaded_by:'Taufiq',uploaded_at:''}];
 const view=render(<GuidedClose guide={guide} onAsk={()=>{}}/>);
 expect(screen.getByRole('button',{name:/^Continue/})).toBeEnabled();
 const file=new File(['new sale'],'new.csv');fireEvent.change(screen.getByLabelText('POS files for Kira'),{target:{files:[file]}});
 expect(screen.getByRole('button',{name:/^Continue/})).toBeDisabled();
 view.rerender(<GuidedClose guide={{...guide,progress:{[pickedFileKey({file,folder:''})]:{state:'Uploaded',percent:100}}}} onAsk={()=>{}}/>);
 expect(screen.getByRole('button',{name:/^Continue/})).toBeEnabled();
});
it('preserves rejected recommendations and represents a rejected mapping with the backend omission value',async()=>{
 const guide=controller(6);guide.data!.cleaning.recommendations=[{id:'saved',table:'pos',column:'branch',kind:'map',title:'Already reviewed',why:'Saved choice',decision:'reject',items:[{from:'Old',to:'Garden Mall',rows:4}]},{id:'new',table:'pos',column:'branch',kind:'map',title:'New spelling',why:'Confirm standard',decision:null,items:[{from:'Harbor Sq',to:'Harbor Square',rows:3}]}];
 render(<GuidedClose guide={guide} onAsk={()=>{}}/>);
 expect(screen.getByRole('combobox',{name:'Decision for Already reviewed'})).toHaveValue('reject');
 const checkbox=screen.getAllByRole('checkbox',{name:'Accept this mapping'})[1];fireEvent.click(checkbox);expect(checkbox).not.toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Save cleaning rules (2)'}));
 await waitFor(()=>expect(guide.request).toHaveBeenCalledWith('/cleaning/save'));
 expect(guide.request).toHaveBeenCalledWith('/cleaning/recommendations/saved',expect.objectContaining({decision:'reject'}));
 expect(guide.request).toHaveBeenCalledWith('/cleaning/recommendations/new',{decision:'accept',mapping:{'Harbor Sq':''}});
});
it('shows a real mini summary and grouped issues, while export uses the pinned guided controller',async()=>{
 const guide=controller(9);render(<GuidedClose guide={guide} onAsk={()=>{}}/>);
 const summary=screen.getByRole('region',{name:'Match summary'});
 expect(within(summary).getByText('Mismatched').closest('.kpi')).toHaveTextContent('8');
 expect(within(summary).getByText('Open without a sale').closest('.kpi')).toHaveTextContent('3');
 const issues=screen.getByRole('list',{name:'Top issues to check'});expect(within(issues).getAllByRole('listitem')).toHaveLength(3);
 expect(within(issues).getByText('Harbor Square')).toBeVisible();expect(issues).toHaveTextContent('Sat 24 Oct 2026');expect(issues).toHaveTextContent('Rp 9.031.421');
 fireEvent.click(screen.getByRole('button',{name:'Export results'}));await waitFor(()=>expect(guide.exportResults).toHaveBeenCalledOnce());
});
