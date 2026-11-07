import {act, cleanup, fireEvent, render, screen,waitFor,within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Landing from './Landing';
import {queryClient} from '../../lib/query';

const clients = [{id: 'rasa', name: 'Rasa Collective'}, {id: 'kopi', name: 'Kopi Nusantara'}];
const user = {user: 'Andrew', auth: true};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches: false, addEventListener() {}, removeEventListener() {}})));
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>new Response(JSON.stringify(path.includes('/follow-ups')?{counts:{open:7,investigating:2,resolved:4}}:{results:{totals:{pos:100,full:98},by_day:{'2026-10-26':{pos:100,matched:98}}}}))));
});
afterEach(() => {cleanup();queryClient.clear(); vi.useRealTimers(); vi.unstubAllGlobals();});

it('enters the selected real workspace and respects a saved selection', () => {
  localStorage.setItem('kira-client', 'kopi');
  const onEnter = vi.fn();
  render(<Landing user={user} clients={clients} onEnter={onEnter} onAuthenticated={vi.fn()}/>);
  expect(screen.getByRole('radio', {name: /Kopi Nusantara/})).toBeChecked();
  fireEvent.click(screen.getByRole('radio', {name: /Rasa Collective/}));
  fireEvent.click(screen.getByRole('button', {name: /Enter workspace/}));
  expect(onEnter).toHaveBeenCalledWith('rasa');
});

it('keeps the saved workspace when clients arrive after the first render', () => {
  localStorage.setItem('kira-client', 'demo');
  const onEnter = vi.fn();
  const {rerender} = render(<Landing user={user} clients={[]} clientsLoading onEnter={onEnter} onAuthenticated={vi.fn()}/>);
  rerender(<Landing user={user} clients={[{id: '', name: 'Main workspace'}, {id: 'demo', name: 'Zestly Demo'}]} onEnter={onEnter} onAuthenticated={vi.fn()}/>);
  expect(screen.getByRole('radio', {name: /Zestly Demo/})).toBeChecked();
  fireEvent.click(screen.getByRole('button', {name: /Enter workspace/}));
  expect(onEnter).toHaveBeenCalledWith('demo');
});

it('embeds the verified sign-in form without fabricated workspace choices', async() => {
  const onAuthenticated=vi.fn(),fetch=vi.fn(async(path:string)=>new Response(JSON.stringify(path==='/api/login'?{ok:true}:{user:'Andrew',auth:true})));
  vi.stubGlobal('fetch',fetch);
  render(<Landing user={null} clients={[]} onEnter={vi.fn()} onAuthenticated={onAuthenticated}/>);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Username'),{target:{value:'andrew'}});
  fireEvent.change(screen.getByLabelText('Password',{exact:true}),{target:{value:'secret'}});
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  await waitFor(()=>expect(onAuthenticated).toHaveBeenCalledWith({user:'Andrew',auth:true}));
  expect(fetch.mock.calls.map(([path])=>path)).toEqual(['/api/login','/api/me']);
  expect(screen.queryByText('Your next close starts here')).not.toBeInTheDocument();
});

it('shows each client’s last sales date, rate and actual open follow-up count',async()=>{
  render(<Landing user={user} clients={clients} onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  const choice=screen.getByRole('radio',{name:/Rasa Collective/}).closest('label')!;
  expect(await within(choice).findByText('Last sales: Mon 26 Oct 2026')).toBeInTheDocument();
  expect(within(choice).getByRole('img',{name:'Match rate: 98%'})).toBeInTheDocument();
  expect(await within(choice).findByText('7 open follow-ups')).toBeInTheDocument();
  const requests=vi.mocked(fetch).mock.calls;
  expect(requests.filter(([path])=>String(path).includes('/follow-ups')).every(([,init])=>new Headers(init?.headers).has('X-Kira-Client'))).toBe(true);
});

it('enters the selected client in tutorial or guided-close mode',()=>{
  const enter=vi.fn();
  render(<Landing user={user} clients={clients} onEnter={enter} onAuthenticated={vi.fn()}/>);
  fireEvent.click(screen.getByRole('radio',{name:/Kopi Nusantara/}));
  fireEvent.click(screen.getByRole('button',{name:'Take the tutorial'}));
  expect(enter).toHaveBeenLastCalledWith('kopi','tutorial');
  fireEvent.click(screen.getByRole('button',{name:"Do today's close with Kira"}));
  expect(enter).toHaveBeenLastCalledWith('kopi','guided');
  expect(screen.queryByText('Payment reconciliation, with the evidence')).not.toBeInTheDocument();
  expect(screen.queryByText('Every number has evidence')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Match POS sales, provider settlements and bank credits, outlet by outlet');
});

it('does not fabricate a workspace when an authenticated account has no clients', () => {
  render(<Landing user={user} clients={[]} onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  expect(screen.getByRole('button', {name: /Enter workspace/})).toBeDisabled();
  expect(screen.getByText('No workspaces are available for this account.')).toBeInTheDocument();
});

it('distinguishes loading and failed workspace requests, with retry', () => {
  const retry = vi.fn();
  const {rerender} = render(<Landing user={user} clients={[]} clientsLoading onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your workspaces');
  expect(screen.queryByText('No workspaces are available for this account.')).not.toBeInTheDocument();
  rerender(<Landing user={user} clients={[]} clientsError="Connection lost" onRetryClients={retry} onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
  fireEvent.click(screen.getByRole('button', {name: 'Retry workspaces'}));
  expect(retry).toHaveBeenCalledOnce();
});

it('rotates documented statistics and pauses on request, hover, and focus', () => {
  vi.useFakeTimers();
  render(<Landing user={user} clients={clients} onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  const carousel = screen.getByRole('region', {name: 'Documented demo results'});
  expect(screen.getByText('8.784')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
  fireEvent.mouseEnter(carousel);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
  fireEvent.mouseLeave(carousel);
  fireEvent.click(screen.getByRole('button', {name: 'Pause statistics'}));
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Play statistics'}));
  fireEvent.focus(screen.getByRole('button', {name: 'Pause statistics'}));
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
  expect(screen.getByText(/20–26 Oct 2026/)).toBeInTheDocument();
});

it('keeps statistics still when reduced motion is preferred', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches: true, addEventListener() {}, removeEventListener() {}})));
  render(<Landing user={user} clients={clients} onEnter={vi.fn()} onAuthenticated={vi.fn()}/>);
  act(() => vi.advanceTimersByTime(15000));
  expect(screen.getByText('8.784')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Play statistics'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Next statistic'}));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
});
