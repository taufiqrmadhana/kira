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
function mockApi(workflow = workflowFixture()) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = input.split('?')[0];
    const body = path === '/api/me' ? { user: 'Taufiq', auth: true }
      : path === '/api/clients' ? [{ id: '', name: 'Zestly' }, { id: 'demo', name: 'Demo' }, { id: 'rehearsal', name: 'Rehearsal' }]
      : path === '/api/status' ? workflow.status
      : path === '/api/workflow' ? workflow
      : path === '/api/overview' ? { status: workflow.status, results: null }
      : path === '/api/matching/results' ? null : [];
    return new Response(JSON.stringify(body));
  }));
}

it('keeps the existing waiting status and mounts Kira in the authenticated shell', async () => {
  mockApi();
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(await screen.findByText('Waiting for files')).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Kira assistant' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Workspace' })).toBeInTheDocument();
});

it('keeps a bookmarked workspace, the selector and requests in sync after switching', async () => {
  history.replaceState(null, '', '/overview?c=demo');
  localStorage.setItem('kira-client', 'rehearsal');
  mockApi();
  render(<BrowserRouter><App /></BrowserRouter>);
  const workspace = await screen.findByRole('combobox', { name: 'Workspace' });
  await waitFor(() => expect(workspace).toHaveValue('demo'));
  expect(await screen.findByText('Waiting for files')).toBeInTheDocument();
  fireEvent.change(workspace, { target: { value: 'rehearsal' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue('rehearsal'));
  expect(new URLSearchParams(location.search).get('c')).toBe('rehearsal');
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/status'));
  expect(new Headers(calls.at(-1)?.[1]?.headers).get('X-Kira-Client')).toBe('rehearsal');
});

it('clamps a matching URL to Upload when the workspace has no files', async () => {
  mockApi();
  render(<MemoryRouter initialEntries={['/workflow?step=4']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Upload your source files' })).toBeInTheDocument();
  const steps = within(screen.getByRole('navigation', { name: 'Workflow steps' }));
  expect(steps.getByRole('button', { name: /Upload Add source files/ })).toHaveAttribute('aria-current', 'step');
  expect(steps.getByRole('button', { name: /Match Trace payments/ })).toBeDisabled();
  expect(screen.queryByRole('heading', { name: 'Match payments' })).not.toBeInTheDocument();
});

it('mounts the real matching screen when conversion and cleaning rules are ready', async () => {
  mockApi(workflowFixture(true));
  render(<MemoryRouter initialEntries={['/workflow?step=4']}><App /></MemoryRouter>);
  const stage = await screen.findByRole('region', { name: 'POS to settlement' });
  expect(screen.getByRole('heading', { name: 'Match payments' })).toBeInTheDocument();
  const match = within(screen.getByRole('navigation', { name: 'Workflow steps' })).getByRole('button', { name: /Match Trace payments/ });
  expect(match).toBeEnabled();
  expect(match).toHaveAttribute('aria-current', 'step');
  expect(within(stage).getByRole('button', { name: 'Find suggestions' })).toBeEnabled();
});
