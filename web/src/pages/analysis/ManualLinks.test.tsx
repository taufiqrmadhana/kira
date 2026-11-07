import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import ManualLinks from './ManualLinks';
import type {SideRow} from './types';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const row=(n:number,status:SideRow['status']='Not found'):SideRow=>({n,rec:200+n,key:`PAY-${n}`,day:'2026-10-24',outlet:'Harbor',rule:'',link:'',status,row:{nett_amount:100,kredit:200}});
it('requires both unlinked sides and a reason, then sends source indices only after confirmation',async()=>{
  const fetch=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='POST'?{id:9}:[])));
  vi.stubGlobal('fetch',fetch);const done=vi.fn();
  render(<ManualLinks stage="l2" left={[row(3),row(7)]} right={[row(4)]} onSaved={done}/>);
  fireEvent.click(screen.getByRole('button',{name:'Link by hand'}));
  const save=screen.getByRole('button',{name:'Create manual link'});expect(save).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Reason for linking'}),{target:{value:'Confirmed bank payout with provider'}});
  expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
  fireEvent.click(save);await waitFor(()=>expect(done).toHaveBeenCalledOnce());
  const request=fetch.mock.calls.find(([,init])=>init?.method==='POST')!;
  expect(JSON.parse(String(request[1]?.body))).toEqual({stage:'l2',left:[3,7],right:[4],note:'Confirmed bank payout with provider'});
});
it('disables linking when any row is already linked or the stage cardinality is invalid',()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]')));
  const view=render(<ManualLinks stage="l1" left={[row(1),row(2)]} right={[row(3)]} onSaved={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Link by hand'})).toBeDisabled();
  view.rerender(<ManualLinks stage="l2" left={[row(1,'Linked')]} right={[row(3)]} onSaved={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Link by hand'})).toBeDisabled();
});
it('keeps a failed link editable and undoes only the selected saved link',async()=>{
  const link={id:9,stage:'l2',left:[3],right:[4],left_keys:['PAY-3'],right_keys:['Bank'],note:'Confirmed',by:'Taufiq',at:'2026-11-07',valid:true};
  const fetch=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='POST'?{detail:'Evidence changed. Reselect rows.'}:init?.method==='DELETE'?{ok:true}:[link]),{status:init?.method==='POST'?409:200}));
  vi.stubGlobal('fetch',fetch);const done=vi.fn();render(<ManualLinks stage="l2" left={[row(3)]} right={[row(4)]} onSaved={done}/>);
  fireEvent.click(screen.getByRole('button',{name:'Link by hand'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Reason for linking'}),{target:{value:'Check'}});fireEvent.click(screen.getByRole('button',{name:'Create manual link'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Evidence changed');expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  fireEvent.click(screen.getByText(/Saved manual links/));
  fireEvent.click(await screen.findByRole('button',{name:'Undo manual link 9'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([url,init])=>url==='/api/analysis/manual-links/9'&&init?.method==='DELETE')).toBe(true));
  expect(done).toHaveBeenCalledOnce();
});
