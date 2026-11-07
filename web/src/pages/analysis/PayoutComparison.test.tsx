import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PayoutComparison from './PayoutComparison';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = () => ({ total: 1, offset: 0, limit: 20, search: { min_days: 0, max_days: 3 }, groups: [{
    id: '38914988:2026-10-29', entity_id: '38914988', outlet: 'Kira Riverside Center Jogja', day: '2026-10-29',
    selected_count: 1, group_count: 138, force_match_eligible: true, net_settled: 11146027, settlement_indices: [1, 2],
    withdrawals: [{ n: 139, amount: 11146000, day: '2026-10-29', row: { transaction_id: 'WITHDRAWAL-1' } }],
    candidates: [
        { bank_n: 1, bank_credit: 11143500, day: '2026-10-30', delay_days: 1, linked: false, link: '', row: { keterangan: 'SHOPEEPAY STORE 14988' } },
        { bank_n: 2, bank_credit: 9000000, day: '2026-10-31', delay_days: 2, linked: true, link: 'M2-0030', row: { keterangan: 'OTHER PAYOUT STORE 14988' } },
    ],
}] });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const mount = (allowForceMatch = false) => render(<MemoryRouter><PayoutComparison allowForceMatch={allowForceMatch} scope="outlet=Riverside&date_from=2026-10-29&date_to=2026-10-29&reason=Not+in+bank+yet" /></MemoryRouter>);

it('compares a selected next-day credit against the full withdrawal and separates net differences', async () => {
    const fetch = vi.fn(async () => json(response())); vi.stubGlobal('fetch', fetch); mount();
    await screen.findByText('SHOPEEPAY STORE 14988');
    expect(screen.getByText(/1 of 138 settlements/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected comparison' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 1' }));
    const comparison = within(screen.getByRole('region', { name: 'Selected comparison' }));
    expect(comparison.getByText('Rp 2.500')).toBeInTheDocument();
    expect(comparison.getByText('Rp 27')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Force Match selected payout'})).not.toBeInTheDocument();
    expect(comparison.getByText(/comparison does not change/)).toBeInTheDocument();
});

it('keeps already-linked credits separate and clears a comparison when its filter changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(response()))); mount();
    await screen.findByText('SHOPEEPAY STORE 14988');
    expect(screen.queryByText('OTHER PAYOUT STORE 14988')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 1' }));
    fireEvent.change(screen.getByLabelText('Bank credit status'), { target: { value: 'linked' } });
    expect(screen.getByText('OTHER PAYOUT STORE 14988')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected comparison' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 2' }));
    expect(screen.getByText(/already belongs to link M2-0030/)).toBeInTheDocument();
});

it('requires a withdrawal choice when more than one exists and never treats missing evidence as zero', async () => {
    const data = response();
    data.groups[0].withdrawals.push({ n: 140, amount: 500000, day: '2026-10-29', row: { transaction_id: 'WITHDRAWAL-2' } });
    vi.stubGlobal('fetch', vi.fn(async () => json(data))); mount();
    await screen.findByText('WITHDRAWAL-2');
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 1' }));
    expect(screen.getByText(/Choose a withdrawal/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected comparison' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare withdrawal 139' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 1' }));
    expect(within(screen.getByRole('region', { name: 'Selected comparison' })).getByText('Rp 2.500')).toBeInTheDocument();
    expect(screen.getByText(/several withdrawals/)).toBeInTheDocument();
});

it('widens the bank date window without changing the settlement scope or writing data', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => json(response())); vi.stubGlobal('fetch', fetch); mount();
    await screen.findByText('SHOPEEPAY STORE 14988');
    fireEvent.change(screen.getByLabelText('Bank arrival'), { target: { value: '7' } });
    await waitFor(() => expect(fetch.mock.calls.at(-1)![0]).toContain('max_days=7'));
    expect(fetch.mock.calls.at(-1)![0]).toContain('date_to=2026-10-29');
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it('shows an error and retry instead of claiming that no credit exists', async () => {
    let failed=false;
    const fetch = vi.fn(async (url:string) => {if(url.includes('/force-matches'))return json([]); if(!failed){failed=true;return new Response('{"detail":"Comparison unavailable"}',{status:409});}return json(response());});
    vi.stubGlobal('fetch', fetch); mount();
    expect(await screen.findByText('Comparison unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SHOPEEPAY STORE 14988')).toBeInTheDocument();
});

it('keeps possible credits visible when withdrawal evidence is absent without calculating a shortage', async () => {
    const data = response();
    data.groups[0].withdrawals = [];
    vi.stubGlobal('fetch', vi.fn(async () => json(data))); mount();
    await screen.findByText('SHOPEEPAY STORE 14988');
    fireEvent.click(screen.getByRole('button', { name: 'Compare bank credit 1' }));
    expect(screen.getByText('No withdrawal found for this day')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected comparison' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Maximum difference (Rp)')).toBeDisabled();
    expect(screen.queryByText('Rp 2.500')).not.toBeInTheDocument();
});

it('offers Force Match only for an eligible selected payout and unlinked credit', async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>json(url.includes('/force-matches')?[]:response())));mount(true);
    await screen.findByText('SHOPEEPAY STORE 14988');
    expect(screen.queryByRole('button',{name:'Force Match selected payout'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Compare bank credit 1'}));
    expect(screen.getByRole('button',{name:'Force Match selected payout'})).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Bank credit status'),{target:{value:'linked'}});
    fireEvent.click(screen.getByRole('button',{name:'Compare bank credit 2'}));
    expect(screen.queryByRole('button',{name:'Force Match selected payout'})).not.toBeInTheDocument();
});
