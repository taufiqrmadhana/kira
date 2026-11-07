import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import Insights from './Insights';
import {getOutletAnomalies, getOutletPerformance, getOutletProfiles, saveOutletProfiles} from './api';
import type {Outlet, PerformanceResponse} from './api';

vi.mock('./api', () => ({
  getOutletPerformance: vi.fn(), getOutletAnomalies: vi.fn(),
  getOutletProfiles: vi.fn(), saveOutletProfiles: vi.fn(),
}));

const harbor = 'Zestly Harbor Square Surabaya';
const row: Outlet = {
  outlet: harbor, orders: 1100, gross_sales: 100000000, avg_ticket: 90909,
  provider_gross: 100000000, mdr: 700000, promo_provider: 0, fees: 0,
  nett_settled: 99300000, bank_received: 90268579, pending_bank: 9031421,
  to_check: 9031421, expected_diff: 0, deduction: 700000, deduction_rate: .007,
  keep_rate: .90268579, keep_rate_expected: .993, match_rate: 90,
  city: 'Surabaya', region: 'East Java', quadrant: 'sells_a_lot_keeps_little',
  reason: 'Rp 9.031.421 payout of 24 Oct not in the bank yet',
};
const response: PerformanceResponse = {
  period: {from: '2026-10-20', to: '2026-10-26', days: 7, label: 'Selected dates', coverage: 1},
  rows: [row], totals: {...row}, medians: {gross_sales: 80000000, keep_rate: .97},
  unassigned: {credits: 1, amount: 1250000},
};

function Location() { const location = useLocation(); return <output aria-label="Current URL">{location.pathname + location.search}</output>; }
function mount() { return render(<MemoryRouter initialEntries={['/insights']}><Insights/><Location/></MemoryRouter>); }

beforeEach(() => {
  vi.mocked(getOutletPerformance).mockResolvedValue(response);
  vi.mocked(getOutletProfiles).mockResolvedValue({profiles: [{outlet: harbor, city: 'Surabaya', region: 'East Java'}]});
  vi.mocked(getOutletAnomalies).mockResolvedValue({anomalies: [{
    kind: 'missing_money', severity: 'high', outlet: harbor, period: {from: '2026-10-24', to: '2026-10-24'},
    value: 9031421, expected: 0, rupiah: 9031421, why: row.reason,
    filter: {date_from: '2026-10-24', date_to: '2026-10-24', outlet: harbor, reason: 'Not in bank yet'},
  }], skipped: [{kind: 'sales_drop', why: 'needs at least 3 earlier same weekdays'}, {kind: 'sales_spike', why: 'needs at least 3 earlier same weekdays'}]});
  vi.mocked(saveOutletProfiles).mockResolvedValue({profiles: [{outlet: harbor, city: 'Surabaya', region: 'Java'}]});
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => {cleanup(); vi.clearAllMocks();});

describe('Outlet insights', () => {
  it('shows Harbor Square in the quadrant list with its payout reason', async () => {
    mount();
    const list = await screen.findByRole('list', {name: 'Sells a lot, keeps little outlets'});
    expect(within(list).getByText(harbor)).toBeInTheDocument();
    expect(within(list).getByText(row.reason)).toBeInTheDocument();
    expect(screen.getByText('90,3% keep rate')).toBeInTheDocument();
    expect(screen.getByText(/needs at least 3 earlier same weekdays/)).toBeInTheDocument();
  });

  it('opens Match analysis with the exact evidence dates, outlet, and reason', async () => {
    mount();
    fireEvent.click(await screen.findByRole('link', {name: new RegExp('Missing money.*' + harbor)}));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/analysis?date_from=2026-10-24&date_to=2026-10-24&outlet=Zestly+Harbor+Square+Surabaya&reason=Not+in+bank+yet&tab=follow');
  });

  it('opens scatter point evidence for the selected period', async () => {
    mount();
    const point = await screen.findByRole('button', {name:new RegExp(harbor + ',.*Open Match analysis')});
    fireEvent.keyDown(point, {key:'Enter'});
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/analysis?tab=map&stage=l2&outlet=Zestly+Harbor+Square+Surabaya&date_from=2026-10-20&date_to=2026-10-26');
  });

  it('passes relative periods and city selection to the API', async () => {
    mount();
    await screen.findByRole('list', {name: 'Sells a lot, keeps little outlets'});
    fireEvent.change(screen.getByLabelText('Period'), {target: {value: 'last_quarter'}});
    fireEvent.change(screen.getByLabelText('City'), {target: {value: 'Surabaya'}});
    await waitFor(() => expect(getOutletPerformance).toHaveBeenLastCalledWith(expect.objectContaining({period: 'last_quarter', city: 'Surabaya'}), expect.any(AbortSignal)));
  });

  it('edits profiles and refreshes the displayed data after saving', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', {name: 'Edit City/Region'}));
    const region = await screen.findByLabelText('Region for ' + harbor);
    fireEvent.change(region, {target: {value: 'Java'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save profiles'}));
    await waitFor(() => expect(saveOutletProfiles).toHaveBeenCalledWith([{outlet: harbor, city: 'Surabaya', region: 'Java'}]));
    expect(await screen.findByText('Outlet profiles saved.')).toBeInTheDocument();
  });

  it('offers matching when no complete reconciliation is available', async () => {
    vi.mocked(getOutletPerformance).mockRejectedValue(new Error('Run matching first: insights use the reconciled results'));
    mount();
    expect(await screen.findByRole('heading', {name: 'Run matching first: insights use reconciled results'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Go to matching'})).toHaveAttribute('href', '/workflow?step=4');
  });

  it('shows a useful empty state and never implies zero coverage means zero sales', async () => {
    vi.mocked(getOutletPerformance).mockResolvedValue({...response, rows: [], period: {...response.period, coverage: 0}});
    mount();
    expect(await screen.findByRole('heading', {name: 'No reconciled sales for this selection'})).toBeInTheDocument();
    expect(screen.getByText(/No POS data covers these dates/)).toBeInTheDocument();
  });
});
