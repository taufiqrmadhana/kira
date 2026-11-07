import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {api} from '../../lib/api';
import {streamProgress, type ProgressUpdate} from '../../lib/progress';
import Step2 from './Step2';
import {areas, type Proposal, type RunAction, type WorkflowData} from './types';

vi.mock('../../lib/api', () => ({api:vi.fn()}));
vi.mock('../../lib/progress', () => ({streamProgress:vi.fn()}));
const request = vi.mocked(api);
const stream = vi.mocked(streamProgress);
function data(converted=false):WorkflowData {
  const table = {columns:[],rows:[],total:0};
  const proposal:Proposal = {proposed:[{name:'outlet',type:'text',keep:true},{name:'branch',type:'text',keep:true},{name:'payment_amount',type:'number',keep:true},{name:'sales_datetime_out',type:'datetime',keep:true}],delimiter:',',diff:null,rows:2,files:1,samples:{outlet:'Menteng',branch:'Menteng',payment_amount:'100',sales_datetime_out:'2026-10-20'},rename:{outlet:{to:'branch',by:'alias'}}};
  return {status:{step:2,files:{pos:1,settlement:1,bank:1},converted,upload_rules_pending:converted?['pos','settlement','bank']:[],cleaning:{open:0,rules_version:null},matching:{}},files:areas.map((type,i)=>({id:i+1,type,name:`${type}-october.csv`,folder:'October',sheet:null,size:100,rows:2,looks_like:null,wrong_area:false,uploaded_by:'Andrew',uploaded_at:''})),conversion:converted?{at:'2026-11-07T10:00:00Z',stale:false,decisions:{},proposals:{pos:proposal,settlement:{...proposal},bank:{...proposal}}}:null,upload_rules:{pos:null,settlement:null,bank:null},cleaning:{rules:null,recommendations:[]},tables:{parsed:{pos:table,settlement:table,bank:table},clean:{pos:table,settlement:table,bank:table}}};
}
const run:RunAction=async(_label,action)=>{try{await action();return true;}catch{return false;}};
const props={busy:'',run,onBack:vi.fn(),onNext:vi.fn()};
beforeEach(()=>{request.mockReset();stream.mockReset();});
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

  it('scans only the current area and reports completed work in POS, Settlement, Mutation order',async()=>{
    let resolve!:(value:unknown)=>void;
    let update!:(event:ProgressUpdate)=>void;
    stream.mockImplementation((_path,_init,onProgress)=>{update=onProgress;return new Promise(done=>{resolve=done;});});
    const view=render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await waitFor(()=>expect(stream).toHaveBeenCalledWith('/convert/stream',expect.objectContaining({method:'POST',signal:expect.any(AbortSignal)}),expect.any(Function)));
    const pos=screen.getByRole('article',{name:'POS conversion'});
    const settlement=screen.getByRole('article',{name:'Settlement conversion'});
    const bank=screen.getByRole('article',{name:'Mutation conversion'});
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    screen.getAllByRole('progressbar').forEach(bar=>expect(bar).toHaveAttribute('value','0'));
    act(()=>update({type:'progress',area:'pos',completed:0,total:4,unit:'files',message:'Reading POS files'}));
    expect(pos).toHaveClass('is-scanning');
    expect(settlement).not.toHaveClass('is-scanning');
    expect(bank).not.toHaveClass('is-scanning');
    act(()=>update({type:'progress',area:'pos',completed:1,total:4,unit:'files'}));
    expect(within(pos).getByRole('progressbar')).toHaveAttribute('value','25');
    expect(within(pos).getByText('1 / 4 files')).toBeInTheDocument();
    expect(within(settlement).getByRole('progressbar')).toHaveAttribute('value','0');
    act(()=>update({type:'progress',area:'pos',completed:4,total:4,unit:'files'}));
    act(()=>update({type:'progress',area:'settlement',completed:1,total:2,unit:'files'}));
    expect(pos).not.toHaveClass('is-scanning');
    expect(within(pos).getByRole('progressbar')).toHaveAttribute('value','100');
    expect(settlement).toHaveClass('is-scanning');
    expect(within(settlement).getByRole('progressbar')).toHaveAttribute('value','50');
    expect(within(bank).getByRole('progressbar')).toHaveAttribute('value','0');
    act(()=>update({type:'progress',area:'settlement',completed:2,total:2,unit:'files'}));
    act(()=>update({type:'progress',area:'bank',completed:0,total:1,unit:'files'}));
    expect(bank).toHaveClass('is-scanning');
    expect(settlement).not.toHaveClass('is-scanning');
    expect(screen.getByRole('button',{name:'Converting…'})).toBeDisabled();
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    act(()=>update({type:'progress',area:'bank',completed:1,total:1,unit:'files'}));
    await act(async()=>resolve({}));
    view.rerender(<Step2 {...props} data={data(true)}/>);
    screen.getAllByRole('progressbar').forEach(bar=>expect(bar).toHaveAttribute('value','100'));
    expect(screen.getByRole('heading',{name:'Upload rules'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Create rule'})).toHaveLength(3);
    expect(screen.getByRole('table',{name:'Detected column samples for POS'})).toBeInTheDocument();
  });

  it('waits for the workflow refresh before revealing tables and rule decisions',async()=>{
    let refresh!:()=>void;
    stream.mockResolvedValue({});
    const refreshRun:RunAction=async(_label,action)=>{await action();await new Promise<void>(resolve=>{refresh=resolve;});return true;};
    const view=render(<Step2 {...props} run={refreshRun} data={data(true)}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert again'}));
    await screen.findByText('Conversion saved. Refreshing tables…');
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    expect(screen.queryByRole('table',{name:'Detected column samples for POS'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Next: Clean'})).toBeDisabled();
    await act(async()=>refresh());
    view.rerender(<Step2 {...props} run={refreshRun} data={data(true)}/>);
    expect(screen.getByRole('heading',{name:'Upload rules'})).toBeInTheDocument();
  });

  it('reports a saved conversion when table refresh fails and restores results after a later refresh',async()=>{
    const converted=data(true);
    stream.mockResolvedValue(converted.conversion);
    const failedRefresh:RunAction=async(_label,action)=>{await action();return false;};
    const view=render(<Step2 {...props} run={failedRefresh} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conversion saved, but tables could not be refreshed. Refresh workflow to continue.');
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    expect(stream).toHaveBeenCalledTimes(1);
    view.rerender(<Step2 {...props} run={failedRefresh} data={converted}/>);
    expect(await screen.findByRole('heading',{name:'Upload rules'})).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('shows global finalization without starting another area or revealing unsaved previews',async()=>{
    let update!:(event:ProgressUpdate)=>void;
    stream.mockImplementation((_path,_init,onProgress)=>{update=onProgress;return new Promise(()=>{});});
    render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    act(()=>areas.forEach(area=>update({type:'progress',area,completed:3,total:3,unit:'steps'})));
    act(()=>update({type:'progress',completed:0,total:1,unit:'steps',message:'Refreshing cleaned tables'}));
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing cleaned tables');
    screen.getAllByRole('article').forEach(lane=>expect(lane).not.toHaveClass('is-scanning'));
    expect(screen.getAllByText('Processed')).toHaveLength(3);
    expect(screen.queryByText('Converted',{exact:true})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
  });

  it('reveals actual parsed rows after completion and marks samples as samples',async()=>{
    stream.mockResolvedValue({});
    const view=render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await waitFor(()=>expect(stream).toHaveBeenCalled());
    const converted=data(true);
    converted.tables.parsed.pos={columns:[{name:'branch',type:'text'},{name:'payment_amount',type:'number'}],rows:[{branch:'Actual outlet',payment_amount:246000}],total:2};
    view.rerender(<Step2 {...props} data={converted}/>);
    const preview=screen.getByRole('table',{name:'Converted POS rows'});
    expect(within(preview).getByText('Actual outlet')).toBeInTheDocument();
    expect(within(preview).getByText('246.000')).toBeInTheDocument();
    expect(within(preview).queryByText('Menteng')).not.toBeInTheDocument();
  });

  it('stops scanning on failure without showing success or rules',async()=>{
    stream.mockImplementation(async(_path,_init,onProgress)=>{
      onProgress({type:'progress',area:'pos',completed:1,total:1,unit:'files'});
      onProgress({type:'progress',area:'settlement',completed:1,total:2,unit:'files'});
      throw new Error('Could not read file');
    });
    render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Conversion could not be confirmed');
    const settlement=screen.getByRole('article',{name:'Settlement conversion'});
    expect(settlement).not.toHaveClass('is-scanning');
    expect(within(settlement).getByRole('progressbar')).toHaveAttribute('value','50');
    expect(within(settlement).getByText('Stopped')).toBeInTheDocument();
    expect(within(screen.getByRole('article',{name:'Mutation conversion'})).getByRole('progressbar')).toHaveAttribute('value','0');
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Convert files'})).toBeEnabled();
  });

  it('hides the prior rule cards while converting again',()=>{
    render(<Step2 {...props} data={data(true)} busy="Converting files"/>);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.queryByRole('heading',{name:'Upload rules'})).not.toBeInTheDocument();
  });

  it('does not invent a percentage when the total is unknown',async()=>{
    stream.mockImplementation((_path,_init,onProgress)=>{
      onProgress({type:'progress',area:'pos',completed:0,total:0,message:'Inspecting files'});
      return new Promise(()=>{});
    });
    render(<Step2 {...props} data={data()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    const pos=screen.getByRole('article',{name:'POS conversion'});
    await waitFor(()=>expect(pos).toHaveClass('is-scanning'));
    expect(within(pos).getByRole('progressbar')).not.toHaveAttribute('value');
    expect(within(pos).queryByText('100%')).not.toBeInTheDocument();
    expect(within(pos).queryByText('0 / 0 files')).not.toBeInTheDocument();
  });

  it('cancels the stream when leaving the workspace and ignores a late completion',async()=>{
    let finish!:(value:unknown)=>void;
    let update!:(event:ProgressUpdate)=>void;
    let signal:AbortSignal|null|undefined;
    const settled=vi.fn();
    stream.mockImplementation((_path,init,onProgress)=>{
      signal=init.signal;update=onProgress;
      return new Promise(resolve=>{finish=resolve;});
    });
    const observedRun:RunAction=async(_label,action)=>{
      try{await action();settled('saved');return true;}catch{settled('cancelled');return false;}
    };
    const view=render(<Step2 {...props} data={data()} run={observedRun}/>);
    fireEvent.click(screen.getByRole('button',{name:'Convert files'}));
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async()=>{
      update({type:'progress',area:'bank',completed:3,total:3,unit:'steps'});
      finish(data(true).conversion);
    });
    expect(settled).toHaveBeenCalledWith('cancelled');
    expect(settled).not.toHaveBeenCalledWith('saved');
    expect(stream).toHaveBeenCalledTimes(1);
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
