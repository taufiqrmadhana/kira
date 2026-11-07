import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {CopyLink} from './CopyLink';
const original=location.href;
afterEach(()=>{cleanup();vi.unstubAllGlobals();history.replaceState({},'',original);});

it('copies the exact current view including filters, client, encoding and fragment',async()=>{
  const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
  history.replaceState({},'','/analysis?c=zestly-demo&tab=map&outlet=Harbor%20Square&date_from=2026-10-24&stage=l2#record-7');
  render(<CopyLink/>);fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  expect(writeText).toHaveBeenCalledWith(location.href);
  expect(await screen.findByRole('status')).toHaveTextContent('Link copied. Anyone signed in opens this exact view.');
  history.replaceState({},'','/insights?c=demo&region=East+Java');
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  await waitFor(()=>expect(writeText).toHaveBeenLastCalledWith(location.href));
});

it('waits for clipboard confirmation before claiming the link was copied',async()=>{
  let finish:()=>void=()=>{};const writeText=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  vi.stubGlobal('navigator',{clipboard:{writeText}});render(<CopyLink/>);
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  expect(screen.getByRole('button',{name:'Copying…'})).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  finish();expect(await screen.findByRole('status')).toHaveTextContent('Link copied.');
  expect(screen.getByRole('button',{name:'Copy link'})).toBeEnabled();
});

it('gives a usable fallback when clipboard access is denied',async()=>{
  vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn(async()=>{throw new Error('Permission denied');})}});
  render(<CopyLink/>);fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Copy the address from your browser’s address bar.');
  expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
});
