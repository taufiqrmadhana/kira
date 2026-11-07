import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {ChatPanel} from './ChatPanel';

const props = {client:'mascot-review', user:'Andrew', onDataChanged:vi.fn(), onHighlight:vi.fn()};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches:true,addEventListener(){},removeEventListener(){}})));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]))));
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

it('opens the mascot popup on request and returns keyboard focus when dismissed', async () => {
  render(<ChatPanel {...props} presentation="popup"/>);
  const launcher = screen.getByRole('button', {name:'Ask Kira'});
  expect(launcher).toHaveAttribute('aria-haspopup','dialog');
  expect(launcher).toHaveAttribute('aria-expanded','false');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(launcher);
  const dialog = screen.getByRole('dialog', {name:'Kira'});
  expect(launcher).toHaveAttribute('aria-controls',dialog.id);
  expect(launcher).toHaveAttribute('aria-expanded','true');
  await waitFor(() => expect(screen.getByRole('textbox', {name:'Ask Kira'})).toBeEnabled());
  fireEvent.keyDown(dialog,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(launcher).toHaveFocus());
  expect(launcher).toHaveAttribute('aria-expanded','false');
  expect(vi.mocked(fetch).mock.calls.every(([,init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it('keeps a typed draft when the popup closes and reopens', async () => {
  render(<ChatPanel {...props} client="mascot-draft" presentation="popup"/>);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  await waitFor(() => expect(screen.getByRole('textbox',{name:'Ask Kira'})).toBeEnabled());
  fireEvent.change(screen.getByRole('textbox',{name:'Ask Kira'}),{target:{value:'Which sales need review?'}});
  fireEvent.click(screen.getByRole('button',{name:'Close Kira'}));
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  await waitFor(() => expect(screen.getByRole('textbox',{name:'Ask Kira'})).toHaveValue('Which sales need review?'));
  expect(vi.mocked(fetch).mock.calls.some(([,init]) => init?.method === 'POST')).toBe(false);
});

it('can dismiss the popup immediately while conversation history is still loading', async () => {
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  render(<ChatPanel {...props} client="mascot-slow-history" presentation="popup"/>);
  const launcher = screen.getByRole('button',{name:'Ask Kira'});
  launcher.focus();
  fireEvent.click(launcher);
  const dialog = screen.getByRole('dialog',{name:'Kira'});
  expect(screen.getByText('Loading your conversation…')).toBeInTheDocument();
  await waitFor(() => expect(dialog).toHaveFocus());
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(launcher).toHaveFocus());
});

it('preserves the existing embedded chat presentation', async () => {
  render(<ChatPanel {...props} client="embedded-review" initiallyOpen/>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Kira'})).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('textbox',{name:'Ask Kira'})).toBeEnabled());
});

it('keeps approval decisions pending through close and reopen until explicitly approved', async () => {
  vi.mocked(fetch).mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/confirm')
    ? {reply:'Done.', pending:[], tool_calls:[]}
    : [{who:'kira',text:'Ready to convert.',tools:[{tool:'convert_files',args:{},result:{status:'pending',confirmation_id:'convert-review'}}]}])));
  render(<ChatPanel {...props} client="mascot-approval" presentation="popup"/>);
  fireEvent.click(screen.getByRole('button',{name:'Ask Kira'}));
  expect(await screen.findByRole('button',{name:'Approve all'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Close Kira'}));
  expect(screen.getByRole('button',{name:/Ask Kira.*awaiting approval/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Ask Kira/}));
  const approve = await screen.findByRole('button',{name:'Approve all'});
  expect(vi.mocked(fetch).mock.calls.filter(([,init]) => init?.method === 'POST')).toHaveLength(0);
  fireEvent.click(approve);
  await waitFor(() => expect(screen.queryByRole('button',{name:'Approve all'})).not.toBeInTheDocument());
  const writes = vi.mocked(fetch).mock.calls.filter(([,init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(String(writes[0][1]?.body)).answers).toEqual({'convert-review':true});
});
