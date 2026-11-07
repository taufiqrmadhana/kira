import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {api} from '../../lib/api';
import Step2 from './Step2';
import {areas, type Proposal, type RunAction, type WorkflowData} from './types';

vi.mock('../../lib/api', async importOriginal => ({...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn()}));
const request = vi.mocked(api);
function data(converted=false):WorkflowData {
  const table = {columns:[],rows:[],total:0};
  const proposal:Proposal = {proposed:[{name:'outlet',type:'text',keep:true},{name:'branch',type:'text',keep:true},{name:'payment_amount',type:'number',keep:true},{name:'sales_datetime_out',type:'datetime',keep:true}],delimiter:',',diff:null,rows:2,files:1,samples:{outlet:'Menteng',branch:'Menteng',payment_amount:'100',sales_datetime_out:'2026-10-20'},rename:{outlet:{to:'branch',by:'alias'}}};
  return {status:{step:2,files:{pos:1,settlement:1,bank:1},converted,upload_rules_pending:converted?['pos','settlement','bank']:[],cleaning:{open:0,rules_version:null},matching:{}},files:areas.map((type,i)=>({id:i+1,type,name:`${type}-october.csv`,folder:'October',sheet:null,size:100,rows:2,looks_like:null,wrong_area:false,uploaded_by:'Andrew',uploaded_at:''})),conversion:converted?{at:'2026-11-07T10:00:00Z',stale:false,decisions:{},proposals:{pos:proposal,settlement:{...proposal},bank:{...proposal}}}:null,upload_rules:{pos:null,settlement:null,bank:null},cleaning:{rules:null,recommendations:[]},tables:{parsed:{pos:table,settlement:table,bank:table},clean:{pos:table,settlement:table,bank:table}}};
}
const run:RunAction=async(_label,action)=>{try{await action();return true;}catch{return false;}};
const props={busy:'',run,onBack:vi.fn(),onNext:vi.fn()};
beforeEach(()=>{request.mockReset();});
afterEach(cleanup);

describe('Convert visualization',()=>{
  it('shows actual file names before scanning without invented source rows',()=>{
    render(<Step2 {...props} data={data()}/>);
    expect(screen.getByText('pos-october.csv')).toBeInTheDocument();
    expect(screen.getByText('settlement-october.csv')).toBeInTheDocument();
    expect(screen.queryByText('Menteng')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Next: Clean'})).toBeDisabled();
  });

  it('keeps scanning indeterminate for the actual pending request then reveals rules',async()=>{
    let resolve!:()=>void;
    request.mockReturnValue(new Promise<void>(done=>{resolve=done;}));
    const view=render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith('/convert',{method:'POST'}));
    const progress=screen.getAllByRole('progressbar');
    expect(progress).toHaveLength(3);
    progress.forEach(bar=>{expect(bar).not.toHaveAttribute('value');expect(bar).not.toHaveAttribute('aria-valuenow');});
    expect(screen.getByRole('button',{name:'Converting…'})).toBeDisabled();
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    await act(async()=>resolve());
    view.rerender(<Step2 {...props} data={data(true)}/>);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Upload rules'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Create rule'})).toHaveLength(3);
    expect(screen.getByRole('table',{name:'Detected column samples for POS'})).toBeInTheDocument();
  });

  it('reveals actual parsed rows after completion and marks samples as samples',async()=>{
    request.mockResolvedValue({});
    const view=render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await waitFor(()=>expect(request).toHaveBeenCalled());
    const converted=data(true);
    converted.tables.parsed.pos={columns:[{name:'branch',type:'text'},{name:'payment_amount',type:'number'}],rows:[{branch:'Actual outlet',payment_amount:246000}],total:2};
    view.rerender(<Step2 {...props} data={converted}/>);
    const preview=screen.getByRole('table',{name:'Converted POS rows'});
    expect(within(preview).getByText('Actual outlet')).toBeInTheDocument();
    expect(within(preview).getByText('246.000')).toBeInTheDocument();
    expect(within(preview).queryByText('Menteng')).not.toBeInTheDocument();
  });

  it('stops scanning on failure without showing success or rules',async()=>{
    request.mockRejectedValue(new Error('Could not read file'));
    render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await waitFor(()=>expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Conversion did not finish');
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Convert files'})).toBeEnabled();
  });

  it('hides the prior rule cards while converting again',()=>{
    render(<Step2 {...props} data={data(true)} busy="Converting files"/>);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
  });
});

describe('Saved upload rules',()=>{
  function withSavedPOS(decision='created') {
    const current=data(true);
    current.status.upload_rules_pending=['settlement','bank'];
    current.conversion!.decisions.pos=decision;
    current.upload_rules.pos={version:1,delimiter:';',columns:[{name:'outlet',type:'text',keep:true},{name:'payment_amount',type:'number',keep:true},{name:'unused_note',type:'text',keep:false}],rename:{outlet:'branch',unused_note:''},created_at:'2026-11-07',created_by:'Andrew'};
    current.tables.parsed.pos={columns:[{name:'outlet',type:'text'},{name:'payment_amount',type:'number'}],rows:[{outlet:'Menteng',payment_amount:100}],total:2};
    return current;
  }

  it('collapses only the successfully saved POS rule after refreshed data arrives',async()=>{
    request.mockResolvedValue({});
    const view=render(<Step2 {...props} data={data(true)}/>);
    const pos=screen.getByRole('article',{name:'Create an upload rule for POS?'});
    fireEvent.click(within(pos).getByRole('button',{name:'Create rule'}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith('/upload-rules/pos',expect.objectContaining({method:'POST'})));
    view.rerender(<Step2 {...props} data={withSavedPOS()}/>);
    expect(screen.getByRole('heading',{name:'POS · Created rule v1'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'View POS upload rule'})).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('table',{name:'Saved POS upload rule columns'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Create an upload rule for Settlement?'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Create rule'})).toHaveLength(2);
  });

  it('opens read-only persisted rule details and reports its saved delimiter',()=>{
    render(<Step2 {...props} data={withSavedPOS()}/>);
    const summary=screen.getByRole('article',{name:'POS · Created rule v1'});
    expect(within(summary).getByText('Semicolon (;)')).toBeInTheDocument();
    expect(within(summary).getByText('2 parsed rows')).toBeInTheDocument();
    const disclosure=within(summary).getByRole('button',{name:'View POS upload rule'});
    expect(disclosure).toHaveAttribute('type','button');
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded','true');
    const table=screen.getByRole('table',{name:'Saved POS upload rule columns'});
    expect(within(table).getByRole('row',{name:'unused_note Text Not kept'})).toBeInTheDocument();
    expect(within(summary).getByText('outlet → branch')).toBeInTheDocument();
    expect(within(summary).getByText('unused_note → Do not fill')).toBeInTheDocument();
    expect(within(summary).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(summary).queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(within(summary).getByRole('button',{name:'Hide POS upload rule'}));
    expect(disclosure).toHaveAttribute('aria-expanded','false');
  });

  it.each([['updated','Updated'],['kept','Kept'],['same','Reused']])('labels a %s rule using the persisted decision', (decision,label)=>{
    render(<Step2 {...props} data={withSavedPOS(decision)}/>);
    expect(screen.getByRole('heading',{name:`POS · ${label} rule v1`})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'View POS upload rule'})).toHaveAttribute('aria-expanded','false');
  });

  it('keeps the decision and edits open when saving fails',async()=>{
    request.mockRejectedValue(new Error('Save rejected'));
    render(<Step2 {...props} data={data(true)}/>);
    const pos=screen.getByRole('article',{name:'Create an upload rule for POS?'});
    fireEvent.change(within(pos).getByRole('combobox',{name:'Type of POS payment_amount'}),{target:{value:'text'}});
    await act(async()=>{fireEvent.click(within(pos).getByRole('button',{name:'Create rule'}));});
    expect(within(pos).getByRole('combobox',{name:'Type of POS payment_amount'})).toHaveValue('text');
    expect(within(pos).getByRole('button',{name:'Create rule'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'View POS upload rule'})).not.toBeInTheDocument();
  });
});
