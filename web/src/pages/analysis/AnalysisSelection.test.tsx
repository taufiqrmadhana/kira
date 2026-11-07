import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analysis from './Analysis';
import { sideResponse } from './test-fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps a day drilldown readable and opens its date editor only when requested', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/summary')
    ? { days: ['2026-10-24'], totals: { pos: 142, matched: 0, mismatched: 142, review: 0 }, facets: { days: ['2026-10-24'], outlets: ['Harbor'], providers: [] } }
    : sideResponse(url)))));
  render(<MemoryRouter initialEntries={['/analysis?tab=map&stage=l2&outlet=Harbor&date_from=2026-10-24&date_to=2026-10-24']}><Analysis /></MemoryRouter>);
  await screen.findByText('142 settlements');
  expect(screen.getByRole('button', { name: /From Sat 24 Oct 2026/ })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'From date (dd/mm/yyyy)' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pick dates' }));
  expect(screen.getByRole('textbox', { name: 'From date (dd/mm/yyyy)' })).toHaveValue('24/10/2026');
  expect(screen.getByRole('textbox', { name: 'To date (dd/mm/yyyy)' })).toHaveValue('24/10/2026');
});
