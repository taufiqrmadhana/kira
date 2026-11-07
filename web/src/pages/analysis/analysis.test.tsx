import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LinkedTables from './LinkedTables';
import FollowUps from './FollowUps';
import { harborRows, sideResponse, followResponse, draftResponse } from './test-fixtures';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
it('shows all 142 missing settlements and the full nett aggregate with an empty bank side', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(sideResponse(url))));
    render(<MemoryRouter><LinkedTables scope="outlet=Harbor&date_from=2026-10-24" initialStage="l2"/></MemoryRouter>);
    expect(await screen.findByText('142 settlements')).toBeInTheDocument();
    expect(screen.getAllByText('Rp 9.031.421').length).toBeGreaterThan(0);
    expect(screen.getByText('No bank rows in this selection')).toBeInTheDocument();
});
it('requests the opposite side by link id when a linked settlement is ticked', async () => {
    const fetch = vi.fn(async (url: string) => json(sideResponse(url, true)));
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter><LinkedTables scope="" initialStage="l2"/></MemoryRouter>);
    await screen.findByText('PAY-001');
    fireEvent.click(screen.getByLabelText('Select Settlement row 1'));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/bank?') && url.includes('links=M2-0001'))).toBe(true));
});
it('drafts and saves the entire scope, including records on other pages, only after explicit save', async () => {
    let saved = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/draft'))
            return json(draftResponse());
        if (url.includes('/bulk')) {
            saved = true;
            return json({ saved: 142, follow_ups: Object.fromEntries(harborRows.map(r => [r.rid, { status: 'investigating', note: 'Missing payout', assignee: '' }])) });
        }
        return json(followResponse(saved));
    });
    vi.stubGlobal('fetch', fetch);
    const view = render(<MemoryRouter><FollowUps scope="outlet=Harbor"/></MemoryRouter>);
    await screen.findByText('142 records');
    fireEvent.click(screen.getByRole('button', { name: 'Draft notes for this list' }));
    await screen.findByRole('button', { name: 'Save 142 notes' });
    expect(fetch.mock.calls.some(([url]) => url.includes('/bulk'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save 142 notes' }));
    await waitFor(() => expect(saved).toBe(true));
    const bulk = fetch.mock.calls.find(([url]) => url.includes('/bulk'))!;
    expect(JSON.parse(bulk[1]!.body as string).items).toHaveLength(142);
    await screen.findByText('Saved 142 notes.');
    view.unmount();
    render(<MemoryRouter><FollowUps scope="outlet=Harbor"/></MemoryRouter>);
    expect(await screen.findAllByDisplayValue('Missing payout')).not.toHaveLength(0);
});
it('discards drafts without writing and keeps drafts when a save fails', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/bulk') ? new Response('{"detail":"KIRA is busy"}', { status: 409 }) : json(url.includes('/draft') ? draftResponse() : followResponse(false)));
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter><FollowUps scope=""/></MemoryRouter>);
    await screen.findByText('142 records');
    fireEvent.click(screen.getByRole('button', { name: 'Draft notes for this list' }));
    await screen.findByRole('button', { name: 'Save 142 notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard drafts' }));
    expect(fetch.mock.calls.some(([url]) => url.includes('/bulk'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Draft notes for this list' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save 142 notes' }));
    expect(await screen.findByText('KIRA is busy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 142 notes' })).toBeEnabled();
});
it('saves an edited existing note without sending read-only audit metadata', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/follow-ups') ? json({ status: 'investigating', note: 'Updated', assignee: 'Andrew', by: 'Andrew' }) : json(followResponse(true)));
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter><FollowUps scope=""/></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Note for HARBOR-1'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/follow-ups'))).toBe(true));
    const call = fetch.mock.calls.find(([url]) => url.endsWith('/follow-ups'))!;
    expect(Object.keys(JSON.parse(call[1]!.body as string)).sort()).toEqual(['assignee', 'note', 'rid', 'status']);
});
it('keeps the note input mounted while editing, so typing does not lose focus', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(followResponse(false))));
    render(<MemoryRouter><FollowUps scope=""/></MemoryRouter>);
    const input = await screen.findByLabelText('Note for HARBOR-1');
    input.focus();
    fireEvent.change(input, { target: { value: 'Ask ShopeePay' } });
    expect(document.activeElement).toBe(input);
    expect(screen.getByLabelText('Note for HARBOR-1')).toHaveValue('Ask ShopeePay');
});

it('returns to the first rate page when the analysis scope changes', async () => {
    const { default: Analysis } = await import('./Analysis');
    const fetch = vi.fn(async (url: string) => {
        if (url.includes('/summary')) return json({ totals: { pos: 50, matched: 50, mismatched: 0, review: 0 }, facets: { days: ['2026-10-24'], outlets: ['Harbor'], providers: [] } });
        if (url.includes('/gaps')) return json({ kinds: [], explained: 0, unexplained: 0 });
        return json({ rows: [{period:'2026-10-24',outlet:'Harbor',pos:1,full:1}], total: 50, totals: {pos:50,full:50}, unassigned: {credits:0} });
    });
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter><Analysis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Match rate next page' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/rates?') && url.includes('offset=20'))).toBe(true));
    fireEvent.change(screen.getByRole('combobox', {name:'Outlet'}), {target:{value:'Harbor'}});
    await waitFor(() => {
        const scoped = fetch.mock.calls.filter(([url]) => url.includes('/rates?') && url.includes('outlet=Harbor'));
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.at(-1)![0]).toContain('offset=0');
    });
});
