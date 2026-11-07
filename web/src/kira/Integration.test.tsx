import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const status = { step: 1, next: { say: 'Add files to POS, Settlement, Mutation.' }, files: { pos: 0, settlement: 0, bank: 0 }, converted: false, upload_rules_pending: [], cleaning: { open: 0, rules_version: null }, tables: {}, matching: { l1: { done: false, rules: 0 }, l2: { done: false, rules: 0 } } };
function mockApi() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = input.split('?')[0];
    const body = path === '/api/me' ? { user: 'Taufiq', auth: true }
      : path === '/api/clients' ? [{ id: '', name: 'Zestly' }]
      : path === '/api/status' ? status
      : path === '/api/overview' ? { status, results: null }
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

it('mounts the available matching screen without pretending cleaning is finished', async () => {
  mockApi();
  render(<MemoryRouter initialEntries={['/workflow?step=4']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'POS to settlement' })).toBeInTheDocument();
  expect(screen.getByText(/cleaning.*being connected/i)).toBeInTheDocument();
});
