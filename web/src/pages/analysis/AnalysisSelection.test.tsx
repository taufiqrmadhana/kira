import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analysis from './Analysis';
import { sideResponse } from './test-fixtures';
vi.mock('./PayoutComparison', () => ({ default: ({scope}: {scope: string}) => <section aria-label="Payout comparison" data-scope={scope}/> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows the date editor for a bookmarked custom day drilldown', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/summary')
    ? { days: ['2026-10-24'], totals: { pos: 142, matched: 0, mismatched: 142, review: 0 }, facets: { days: ['2026-10-24'], outlets: ['Harbor'], providers: [] } }
    : sideResponse(url)))));
  render(<MemoryRouter initialEntries={['/analysis?tab=map&stage=l2&outlet=Harbor&date_from=2026-10-24&date_to=2026-10-24']}><Analysis /></MemoryRouter>);
  await screen.findByText('142 settlements');
  expect(screen.getByRole('button', { name: /From Sat 24 Oct 2026/ })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'From date (dd/mm/yyyy)' })).toHaveValue('24/10/2026');
  expect(screen.getByRole('textbox', { name: 'To date (dd/mm/yyyy)' })).toHaveValue('24/10/2026');
});

it('filters all analysis evidence by result and lets the user remove that filter', async () => {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/summary')
    ? { days: ['2026-10-24'], totals: { pos: 142, matched: 0, mismatched: 142, review: 0 }, facets: { days: ['2026-10-24'], outlets: ['Harbor'], providers: [] } }
    : sideResponse(url))));
  vi.stubGlobal('fetch', fetch);
  render(<MemoryRouter initialEntries={['/analysis?tab=map&stage=l2&outlet=Harbor']}><Analysis /></MemoryRouter>);
  await screen.findByText('142 settlements');
  fireEvent.change(screen.getByRole('combobox', {name: 'Result'}), {target: {value: 'open'}});
  await waitFor(() => {
    for (const endpoint of ['/summary?', '/side/l2/settlement?', '/side/l2/bank?']) {
      expect(fetch.mock.calls.some(([url]) => url.includes(endpoint) && url.includes('status=open'))).toBe(true);
    }
  });
  fireEvent.click(screen.getByRole('button', {name: /Needs attention.*Remove status filter/}));
  expect(screen.getByRole('combobox', {name: 'Result'})).toHaveValue('');
  await waitFor(() => expect(fetch.mock.calls.filter(([url]) => url.includes('/summary?')).at(-1)![0]).not.toContain('status='));
  fireEvent.click(screen.getByRole('button', {name: 'Find bank credits'}));
  fireEvent.change(screen.getByRole('combobox', {name: 'Result'}), {target: {value: 'Mismatched'}});
  expect(screen.getByRole('region', {name: 'Payout comparison'})).toHaveAttribute('data-scope', 'outlet=Harbor&status=Mismatched');
});
