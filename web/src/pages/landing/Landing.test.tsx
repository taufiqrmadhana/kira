import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Landing from './Landing';

const clients = [{id: 'rasa', name: 'Rasa Collective'}, {id: 'kopi', name: 'Kopi Nusantara'}];
const user = {user: 'Andrew', auth: true};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches: false, addEventListener() {}, removeEventListener() {}})));
});
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();});

it('enters the selected real workspace and respects a saved selection', () => {
  localStorage.setItem('kira-client', 'kopi');
  const onEnter = vi.fn();
  render(<Landing user={user} clients={clients} onEnter={onEnter} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('radio', {name: /Kopi Nusantara/})).toBeChecked();
  fireEvent.click(screen.getByRole('radio', {name: /Rasa Collective/}));
  fireEvent.click(screen.getByRole('button', {name: /Enter workspace/}));
  expect(onEnter).toHaveBeenCalledWith('rasa');
});

it('keeps the saved workspace when clients arrive after the first render', () => {
  localStorage.setItem('kira-client', 'demo');
  const onEnter = vi.fn();
  const {rerender} = render(<Landing user={user} clients={[]} clientsLoading onEnter={onEnter} onSignIn={vi.fn()}/>);
  rerender(<Landing user={user} clients={[{id: '', name: 'Main workspace'}, {id: 'demo', name: 'Zestly Demo'}]} onEnter={onEnter} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('radio', {name: /Zestly Demo/})).toBeChecked();
  fireEvent.click(screen.getByRole('button', {name: /Enter workspace/}));
  expect(onEnter).toHaveBeenCalledWith('demo');
});

it('invites signed-out users to sign in without fabricated workspace choices', () => {
  const onSignIn = vi.fn();
  render(<Landing user={null} clients={[]} onEnter={vi.fn()} onSignIn={onSignIn}/>);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Sign in to enter'}));
  expect(onSignIn).toHaveBeenCalledOnce();
  expect(screen.getByText('Your workspaces appear here after you sign in.')).toBeInTheDocument();
});

it('does not fabricate a workspace when an authenticated account has no clients', () => {
  render(<Landing user={user} clients={[]} onEnter={vi.fn()} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('button', {name: /Enter workspace/})).toBeDisabled();
  expect(screen.getByText('No workspaces are available for this account.')).toBeInTheDocument();
});

it('distinguishes loading and failed workspace requests, with retry', () => {
  const retry = vi.fn();
  const {rerender} = render(<Landing user={user} clients={[]} clientsLoading onEnter={vi.fn()} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your workspaces');
  expect(screen.queryByText('No workspaces are available for this account.')).not.toBeInTheDocument();
  rerender(<Landing user={user} clients={[]} clientsError="Connection lost" onRetryClients={retry} onEnter={vi.fn()} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
  fireEvent.click(screen.getByRole('button', {name: 'Retry workspaces'}));
  expect(retry).toHaveBeenCalledOnce();
});

it('rotates documented statistics and pauses on request, hover, and focus', () => {
  vi.useFakeTimers();
  render(<Landing user={user} clients={clients} onEnter={vi.fn()} onSignIn={vi.fn()}/>);
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
  render(<Landing user={user} clients={clients} onEnter={vi.fn()} onSignIn={vi.fn()}/>);
  act(() => vi.advanceTimersByTime(15000));
  expect(screen.getByText('8.784')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Play statistics'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Next statistic'}));
  expect(screen.getByText('98,3%')).toBeInTheDocument();
});
