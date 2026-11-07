import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {api} from '../lib/api';
import ClientSelector from './ClientSelector';

vi.mock('../lib/api',()=>({api:vi.fn()}));
const request=vi.mocked(api);
const clients=[{id:'',name:'Main client'},{id:'demo',name:'Demo client'}];
const onSelect=vi.fn();
const onCreated=vi.fn();
const mount=()=>render(<ClientSelector client="demo" clients={clients} onSelect={onSelect} onCreated={onCreated}/>);
const open=()=>fireEvent.click(screen.getByRole('button',{name:'Add client'}));

beforeEach(()=>{
  request.mockReset();onSelect.mockReset();onCreated.mockReset();
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
});
afterEach(cleanup);

it('labels client selection, switches existing clients, and makes no initial write',()=>{
  mount();
  const selector=screen.getByRole('combobox',{name:'Client selection'});
  expect(selector).toHaveValue('demo');
  fireEvent.change(selector,{target:{value:''}});
  expect(onSelect).toHaveBeenCalledWith('');
  expect(request).not.toHaveBeenCalled();
});

it('opens a name-only modal, focuses its field, and cancels without changes',async()=>{
  mount();open();
  const dialog=screen.getByRole('dialog',{name:'Add client'});
  const name=within(dialog).getByRole('textbox',{name:'Client name'});
  await waitFor(()=>expect(name).toHaveFocus());
  expect(dialog.parentElement).toBe(document.body);
  expect(within(dialog).getAllByRole('textbox')).toHaveLength(1);
  fireEvent.change(name,{target:{value:'Draft client'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole('button',{name:'Add client'})).toHaveFocus());
  expect(request).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
});

it('validates a blank name before any request and associates the focused error',async()=>{
  mount();open();
  const dialog=screen.getByRole('dialog',{name:'Add client'});
  const name=within(dialog).getByRole('textbox',{name:'Client name'});
  fireEvent.change(name,{target:{value:'   '}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Add client'}));
  const error=await within(dialog).findByRole('alert');
  expect(error).toHaveTextContent('Enter a client name.');
  expect(error).toHaveFocus();
  expect(name).toHaveAttribute('aria-invalid','true');
  expect(name).toHaveAttribute('aria-describedby',error.id);
  expect(name).toHaveAttribute('maxlength','100');
  expect(request).not.toHaveBeenCalled();
});

it('posts only the trimmed name on explicit submit and waits for the returned client',async()=>{
  let finish!:(value:unknown)=>void;
  request.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  mount();open();
  const dialog=screen.getByRole('dialog',{name:'Add client'});
  const name=within(dialog).getByRole('textbox',{name:'Client name'});
  fireEvent.change(name,{target:{value:'  North branch  '}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Add client'}));
  expect(request).toHaveBeenCalledExactlyOnceWith('/clients',{method:'POST',body:JSON.stringify({name:'North branch'})});
  expect(name).toBeDisabled();
  expect(within(dialog).getByRole('button',{name:'Adding…'})).toBeDisabled();
  expect(within(dialog).getByRole('button',{name:'Cancel'})).toBeDisabled();
  fireEvent(dialog,new Event('cancel',{bubbles:true,cancelable:true}));
  expect(dialog).toBeInTheDocument();
  expect(onCreated).not.toHaveBeenCalled();
  await act(async()=>finish({id:'north-branch-2',name:'North branch'}));
  expect(onCreated).toHaveBeenCalledExactlyOnceWith({id:'north-branch-2',name:'North branch'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps the name on a server error and retries only when submitted again',async()=>{
  request.mockRejectedValueOnce(new Error('KIRA is busy finishing another change'));
  request.mockResolvedValueOnce({id:'new-client',name:'New client'});
  mount();open();
  const dialog=screen.getByRole('dialog',{name:'Add client'});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Client name'}),{target:{value:'New client'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Add client'}));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('KIRA is busy finishing another change');
  expect(within(dialog).getByRole('textbox',{name:'Client name'})).toHaveValue('New client');
  expect(within(dialog).getByRole('button',{name:'Add client'})).toBeEnabled();
  expect(onCreated).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button',{name:'Add client'}));
  await waitFor(()=>expect(onCreated).toHaveBeenCalledWith({id:'new-client',name:'New client'}));
  expect(request).toHaveBeenCalledTimes(2);
});

it('lets Escape dismiss the idle modal without creating a client',()=>{
  mount();open();
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
