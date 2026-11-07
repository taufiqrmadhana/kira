import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from '../App';
import { areas, type WorkflowData } from '../pages/workflow/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); history.replaceState(null, '', '/'); });
const status = { step: 1, next: { say: 'Add files to POS, Settlement, Mutation.' }, files: { pos: 0, settlement: 0, bank: 0 }, converted: false, upload_rules_pending: [], cleaning: { open: 0, rules_version: null }, tables: {}, matching: { l1: { done: false, rules: 0 }, l2: { done: false, rules: 0 } } };
function workflowFixture(ready = false): WorkflowData {
  const table = { columns: [], rows: [], total: 0 };
  const tables = { pos: table, settlement: table, bank: table };
  const rule = { version: 1, columns: [], rename: {}, created_at: '2026-11-07', created_by: 'Taufiq' };
  return {
    status: ready ? { ...status, step: 4, files: { pos: 1, settlement: 1, bank: 1 }, converted: true, cleaning: { open: 0, rules_version: 1 } } : status,
    files: ready ? areas.map((type, index) => ({ id: index + 1, type, name: `${type}.csv`, folder: '', sheet: null, size: 10, rows: 0, looks_like: type, wrong_area: false, uploaded_by: 'Taufiq', uploaded_at: '2026-11-07' })) : [],
    conversion: ready ? { at: '2026-11-07', stale: false, proposals: {}, decisions: { pos: 'same', settlement: 'same', bank: 'same' } } : null,
    upload_rules: ready ? { pos: rule, settlement: rule, bank: rule } : { pos: null, settlement: null, bank: null },
    cleaning: { rules: ready ? { version: 1, maps: {}, exclude: {} } : null, recommendations: [] },
    tables: { parsed: tables, clean: tables },
  };
}
function mockApi(workflow = workflowFixture(), results: unknown = null) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = input.split('?')[0];
    const body = path === '/api/me' ? { user: 'Taufiq', auth: true }
      : path === '/api/clients' ? [{ id: '', name: 'Zestly' }, { id: 'demo', name: 'Demo' }, { id: 'rehearsal', name: 'Rehearsal' }]
      : path === '/api/status' ? workflow.status
      : path === '/api/workflow' ? workflow
      : path === '/api/overview' ? { status: workflow.status, results }
      : path === '/api/learning' ? {closes: [], knowledge: {}}
      : path === '/api/matching/results' ? null : [];
    return new Response(JSON.stringify(body));
  }));
}

it('keeps the existing waiting status and mounts Kira in the authenticated shell', async () => {
  mockApi();
  render(<MemoryRouter initialEntries={['/overview']}><App /></MemoryRouter>);
  expect(await screen.findByText('Waiting for files')).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Kira assistant' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Client selection' })).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Ask Kira'})).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/history'))).toHaveLength(0);
});

it('loads reconciled Overview once and reuses the workspace status on Match analysis', async () => {
  mockApi(workflowFixture(true), {
    totals: {pos: 100, full: 95, matched: 95, mismatched: 5, review: 0, credits: 2, credits_linked: 2, cash: 500000},
    by_day: {'2026-10-24': {pos: 100, matched: 95}}, open_items: [],
  });
  render(<MemoryRouter initialEntries={['/overview']}><App /></MemoryRouter>);
  expect(await screen.findByRole('grid', {name: 'Match history for October 2026'})).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/overview'))).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('navigation', {name: 'Main navigation'})).getByRole('link', {name: 'Match analysis'}));
  expect(await screen.findByText('Complete both matching stages to see the evidence.')).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/status'))).toHaveLength(1);
});

it('preserves the bookmarked workspace when moving between workflow steps', async () => {
  history.replaceState(null, '', '/workflow?step=1&c=demo');
  mockApi(workflowFixture(true));
  vi.stubGlobal('scrollTo', vi.fn());
  render(<BrowserRouter><App /></BrowserRouter>);
  const steps = within(await screen.findByRole('navigation', {name: 'Workflow steps'}));
  await waitFor(() => expect(steps.getByRole('button', {name: /Convert/})).toBeEnabled());
  fireEvent.click(steps.getByRole('button', {name: /Convert/}));
  expect(new URLSearchParams(location.search).get('step')).toBe('2');
  expect(new URLSearchParams(location.search).get('c')).toBe('demo');
});

it('opens the chosen workspace from the landing page', async () => {
  localStorage.setItem('kira-client', 'demo');
  mockApi();
  render(<BrowserRouter><App /></BrowserRouter>);
  const enter = await screen.findByRole('button', { name: /Open overview/i });
  await waitFor(() => expect(enter).toBeEnabled());
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  fireEvent.click(enter);
  expect(await screen.findByText('Waiting for files')).toBeInTheDocument();
  expect(location.pathname).toBe('/overview');
  expect(new URLSearchParams(location.search).get('c')).toBe('demo');
});

it('keeps the public landing visible when the visitor is signed out', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: null, auth: true }))));
  render(<BrowserRouter><App /></BrowserRouter>);
  expect(await screen.findByRole('heading', { name: /Every rupiah/i })).toBeInTheDocument();
  expect(location.pathname).toBe('/');
  fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
  expect(location.pathname).toBe('/login');
});

it('keeps a bookmarked workspace, the selector and requests in sync after switching', async () => {
  history.replaceState(null, '', '/overview?c=demo');
  localStorage.setItem('kira-client', 'rehearsal');
  mockApi();
  render(<BrowserRouter><App /></BrowserRouter>);
  const workspace = await screen.findByRole('combobox', { name: 'Client selection' });
  await waitFor(() => expect(workspace).toHaveValue('demo'));
  expect(await screen.findByText('Waiting for files')).toBeInTheDocument();
  fireEvent.change(workspace, { target: { value: 'rehearsal' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client selection' })).toHaveValue('rehearsal'));
  expect(new URLSearchParams(location.search).get('c')).toBe('rehearsal');
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/status'));
  expect(new Headers(calls.at(-1)?.[1]?.headers).get('X-Kira-Client')).toBe('rehearsal');
});

it('clamps a matching URL to Upload when the workspace has no files', async () => {
  mockApi();
  render(<MemoryRouter initialEntries={['/workflow?step=4']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Upload your raw files' })).toBeInTheDocument();
  const steps = within(screen.getByRole('navigation', { name: 'Workflow steps' }));
  expect(steps.getByRole('button', { name: /Upload raw files/ })).toHaveAttribute('aria-current', 'step');
  expect(steps.getByRole('button', { name: /Run matching/ })).toBeDisabled();
  expect(screen.queryByRole('heading', { name: 'Run matching' })).not.toBeInTheDocument();
});

it('adds and selects the server-created client while preserving navigation and starting its empty workflow at Upload',async()=>{
  history.replaceState(null,'','/workflow?step=4&c=demo&review=keep');
  mockApi(workflowFixture(true));
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
  const baseline=vi.mocked(fetch).getMockImplementation()!;
  const created={id:'north-branch-2',name:'North branch'};
  let saved=false;
  vi.mocked(fetch).mockImplementation(async(input,init)=>{
    if(String(input)==='/api/clients' && init?.method==='POST'){
      expect(JSON.parse(String(init.body))).toEqual({name:'North branch'});
      saved=true;return new Response(JSON.stringify(created));
    }
    if(String(input)==='/api/clients' && saved)return new Response(JSON.stringify([{id:'demo',name:'Demo'},created]));
    if(new Headers(init?.headers).get('X-Kira-Client')===created.id){
      if(String(input).startsWith('/api/workflow'))return new Response(JSON.stringify(workflowFixture()));
      if(String(input)==='/api/status')return new Response(JSON.stringify(status));
    }
    return baseline(input,init);
  });
  render(<BrowserRouter><App/></BrowserRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Add client'}));
  const dialog=screen.getByRole('dialog',{name:'Add client'});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Client name'}),{target:{value:' North branch '}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Add client'}));
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'Client selection'})).toHaveValue(created.id));
  expect(location.pathname).toBe('/workflow');
  expect(new URLSearchParams(location.search).get('c')).toBe(created.id);
  expect(new URLSearchParams(location.search).get('step')).toBe('4');
  expect(new URLSearchParams(location.search).get('review')).toBe('keep');
  expect(localStorage.getItem('kira-client')).toBe(created.id);
  expect(await screen.findByRole('heading',{name:'Upload your raw files'})).toBeInTheDocument();
  const steps=within(screen.getByRole('navigation',{name:'Workflow steps'}));
  expect(steps.getByRole('button',{name:/Upload raw files/})).toHaveAttribute('aria-current','step');
  expect(vi.mocked(fetch).mock.calls.filter(([url,init])=>url==='/api/clients' && init?.method==='POST')).toHaveLength(1);
});

it('mounts the real matching screen when conversion and cleaning rules are ready', async () => {
  mockApi(workflowFixture(true));
  render(<MemoryRouter initialEntries={['/workflow?step=4']}><App /></MemoryRouter>);
  const stage = await screen.findByRole('region', { name: 'POS to settlement' });
  expect(screen.getByRole('heading', { name: 'Run matching' })).toBeInTheDocument();
  const match = within(screen.getByRole('navigation', { name: 'Workflow steps' })).getByRole('button', { name: /Run matching/ });
  expect(match).toBeEnabled();
  expect(match).toHaveAttribute('aria-current', 'step');
  expect(within(stage).getByRole('button', { name: 'Find suggestions' })).toBeEnabled();
});
