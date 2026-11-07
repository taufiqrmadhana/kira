import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ChatPanel} from './ChatPanel';
import type {ChatReply} from './protocol';

const json=(value:unknown)=>new Response(JSON.stringify(value));
const props={client:'test-floating',user:'Taufiq',onDataChanged:vi.fn(),onHighlight:vi.fn()};
beforeEach(()=>{
  localStorage.clear();
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener(){},removeEventListener(){}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});

it('starts collapsed without loading history and keeps its launcher visible while the popup is open',async()=>{
  const fetch=vi.fn(async()=>json([]));vi.stubGlobal('fetch',fetch);
  render(<ChatPanel {...props}/>);
  const launcher=screen.getByRole('button',{name:'Ask Kira'});
  expect(launcher).toHaveAttribute('aria-haspopup','dialog');
  expect(launcher).toHaveAttribute('aria-expanded','false');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(launcher);
  expect(await screen.findByRole('dialog',{name:'Kira'})).toBeInTheDocument();
  expect(launcher).toHaveAttribute('aria-expanded','true');
  expect(launcher).toBeVisible();
  expect(launcher).toHaveAttribute('aria-controls',screen.getByRole('dialog').id);
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Ask Kira'})).toHaveFocus());
  fireEvent.keyDown(screen.getByRole('textbox',{name:'Ask Kira'}),{key:'Escape'});
  await waitFor(()=>expect(launcher).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('preserves an unsent draft and the loaded conversation when minimizing',async()=>{
  const fetch=vi.fn(async()=>json([{who:'kira',text:'There are 142 missing-bank records.'}]));vi.stubGlobal('fetch',fetch);
  render(<ChatPanel {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  await screen.findByText('There are 142 missing-bank records.');
  fireEvent.change(screen.getByRole('textbox',{name:'Ask Kira'}),{target:{value:'Explain Harbor Square'}});
  fireEvent.click(screen.getByRole('button',{name:'Minimize Kira'}));
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  expect(screen.getByRole('textbox',{name:'Ask Kira'})).toHaveValue('Explain Harbor Square');
  expect(screen.getByText('There are 142 missing-bank records.')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('focuses the title on touch screens without opening the composer keyboard',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>json([])));
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}})));
  render(<ChatPanel {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Kira'})).toHaveFocus());
  expect(screen.getByRole('textbox',{name:'Ask Kira'})).not.toHaveFocus();
});

it('keeps a running request and its approval when minimized, without approving it',async()=>{
  let finish!:(reply:Response)=>void;
  let requestSignal:AbortSignal|undefined;
  const fetch=vi.fn((url:string,init?:RequestInit)=>{
    if(url.includes('/history'))return Promise.resolve(json([]));
    requestSignal=init?.signal as AbortSignal;
    return new Promise<Response>(resolve=>{finish=resolve;});
  });
  vi.stubGlobal('fetch',fetch);
  render(<ChatPanel {...props}/>);
  const launcher=screen.getByRole('button',{name:'Ask Kira'});
  fireEvent.click(launcher);
  const input=await screen.findByRole('textbox',{name:'Ask Kira'});
  await waitFor(()=>expect(input).toBeEnabled());
  fireEvent.change(input,{target:{value:'Draft a follow-up'}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText('Checking your workspace…');
  fireEvent.click(screen.getByRole('button',{name:'Close Kira'}));
  expect(launcher).toHaveAccessibleDescription('Working…');
  expect(requestSignal?.aborted).toBe(false);
  const reply:ChatReply={reply:'Review this note.',tool_calls:[],pending:[{id:'pending-1',tool:'save_follow_ups',args:{keys:['sale-1'],note:'Ask about the missing bank credit',status:'investigating'}}]};
  await act(async()=>{finish(json(reply));});
  expect(screen.getByText('1 awaiting approval')).toBeInTheDocument();
  expect(launcher).toHaveAccessibleDescription('1 awaiting approval');
  fireEvent.click(launcher);
  expect(await screen.findByRole('region',{name:'Changes awaiting approval'})).toBeInTheDocument();
  expect(screen.getByText('Review this note.')).toBeInTheDocument();
  expect(fetch.mock.calls.filter(([url])=>url.includes('/history'))).toHaveLength(1);
  expect(fetch.mock.calls.some(([url])=>url.includes('/confirm'))).toBe(false);
});
