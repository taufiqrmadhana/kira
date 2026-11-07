import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Landing from './Landing';

const clients = [{id: 'rasa', name: 'Rasa Collective'}, {id: 'kopi', name: 'Kopi Nusantara'}];
const user = {user: 'Andrew', auth: true};
beforeEach(() => localStorage.clear());
afterEach(() => {cleanup(); vi.restoreAllMocks();});

it('shows one clear public action and a three-step flow without a chooser or statistics', () => {
  const onSignIn = vi.fn();
  const interval = vi.spyOn(window, 'setInterval');
  render(<Landing user={null} clients={[]} onEnter={vi.fn()} onSignIn={onSignIn}/>);
  expect(screen.getByRole('heading', {name: /Every rupiah, accounted for/})).toBeInTheDocument();
  const flow = screen.getByRole('list', {name: 'How Kira works'});
  expect(within(flow).getAllByRole('listitem')).toHaveLength(3);
  for (const step of ['Upload files', 'Kira checks', 'See results']) expect(within(flow).getByText(step)).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText(/Choose a workspace|Documented demo results|sales reconciled/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(interval).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Get started'}));
  expect(onSignIn).toHaveBeenCalledOnce();
});

it('opens the valid saved workspace without exposing a workspace selector', () => {
  localStorage.setItem('kira-client', 'kopi');
  const onEnter = vi.fn();
  render(<Landing user={user} clients={clients} onEnter={onEnter} onSignIn={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Open overview'}));
  expect(onEnter).toHaveBeenCalledWith('kopi');
  expect(screen.queryByText('Kopi Nusantara')).not.toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});

it('uses the first real workspace when the saved workspace is unavailable', () => {
  localStorage.setItem('kira-client', 'removed-workspace');
  const onEnter = vi.fn();
  render(<Landing user={user} clients={clients} onEnter={onEnter} onSignIn={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Open overview'}));
  expect(onEnter).toHaveBeenCalledWith('rasa');
});

it('preserves an explicitly saved default workspace with an empty id', () => {
  localStorage.setItem('kira-client', '');
  const onEnter = vi.fn();
  render(<Landing user={user} clients={[...clients, {id: '', name: 'Main workspace'}]} onEnter={onEnter} onSignIn={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Open overview'}));
  expect(onEnter).toHaveBeenCalledWith('');
});

it('waits for asynchronous clients before entering the saved workspace', () => {
  localStorage.setItem('kira-client', 'kopi');
  const onEnter = vi.fn();
  const {rerender} = render(<Landing user={user} clients={[]} clientsLoading onEnter={onEnter} onSignIn={vi.fn()}/>);
  const enter = screen.getByRole('button', {name: 'Open overview'});
  expect(enter).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Getting things ready');
  fireEvent.click(enter);
  expect(onEnter).not.toHaveBeenCalled();
  rerender(<Landing user={user} clients={[{id: '', name: 'Main workspace'}, ...clients]} onEnter={onEnter} onSignIn={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Open overview'}));
  expect(onEnter).toHaveBeenCalledWith('kopi');
});

it('blocks stale clients during loading or error and provides a retry', () => {
  const onEnter = vi.fn(), retry = vi.fn();
  const {rerender} = render(<Landing user={user} clients={clients} clientsLoading onEnter={onEnter} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('button', {name: 'Open overview'})).toBeDisabled();
  rerender(<Landing user={user} clients={clients} clientsError="Could not load your workspaces." onRetryClients={retry} onEnter={onEnter} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load your workspaces.');
  fireEvent.click(screen.getByRole('button', {name: 'Open overview'}));
  expect(onEnter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
  expect(retry).toHaveBeenCalledOnce();
});

it('does not invent a workspace when the account has none', () => {
  const onEnter = vi.fn();
  render(<Landing user={user} clients={[]} onEnter={onEnter} onSignIn={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('No workspaces are available for this account.');
  expect(screen.getByRole('button', {name: 'Open overview'})).toBeDisabled();
  expect(onEnter).not.toHaveBeenCalled();
});
