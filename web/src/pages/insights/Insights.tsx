import {useMemo, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {X} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {Button, DataTable, DateField, Empty, ErrorState, KpiCard, Loading} from '../../components';
import {count, date, money, percent} from '../../lib/format';
import {clientPath} from '../../lib/api';
import {getOutletAnomalies, getOutletPerformance, getOutletProfiles, type InsightFilters, type Outlet} from './api';
import {useInsightsResource} from './useInsightsResource';
import OutletScatter from './OutletScatter';
import AnomalyList from './AnomalyList';
import ProfilesModal from './ProfilesModal';
import {CopyLink} from '../../components/CopyLink';
import './insights.css';

const periods = [
  ['', 'All dates'], ['custom', 'Pick dates'], ['last_week', 'Last week'],
  ['last_month', 'Last month'], ['last_quarter', 'Last quarter'],
  ['this_quarter', 'This quarter'], ['ytd', 'Year to date'],
];
const filterNames: Record<string, string> = {date_from: 'From', date_to: 'To', outlet: 'Outlet', city: 'City', region: 'Region', period: 'Period'};
const rate = (value: number | null | undefined) => percent(value == null ? null : value * 100);
const numeric = (value: number) => <span className="numeric">{money(value)}</span>;

export default function Insights() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [pickDates, setPickDates] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const filters: InsightFilters = Object.fromEntries(Object.keys(filterNames).map(key => [key, params.get(key) || '']));
  const key = JSON.stringify(filters);
  const performance = useInsightsResource((signal, client) => getOutletPerformance(filters, signal, client), key, '/performance/outlets');
  const anomalies = useInsightsResource((signal, client) => getOutletAnomalies(filters, signal, client), key, '/performance/anomalies');
  const profiles = useInsightsResource(getOutletProfiles);
  const data = performance.data;
  const sortedRows = useMemo(() => [...(data?.rows || [])].sort((a, b) => (a.keep_rate ?? Infinity) - (b.keep_rate ?? Infinity) || a.outlet.localeCompare(b.outlet)), [data]);
  const quadrant = sortedRows.filter(row => row.quadrant === 'sells_a_lot_keeps_little');
  const cities = [...new Set(profiles.data?.profiles.map(item => item.city).filter(Boolean))].sort();
  const regions = [...new Set(profiles.data?.profiles.map(item => item.region).filter(Boolean))].sort();
  const profileNames = profiles.data?.profiles.map(item => item.outlet).sort() || [];
  const custom = pickDates || !!filters.date_from || !!filters.date_to;
  const active = Object.entries(filters).filter(([, value]) => value);

  function update(name: string, value: string) {
    setNotice('');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(name, value); else next.delete(name);
      if (name === 'date_from' || name === 'date_to') next.delete('period');
      return next;
    });
  }
  function changePeriod(value: string) {
    setPickDates(value === 'custom');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('date_from'); next.delete('date_to'); next.delete('period');
      if (value === 'custom') {
        if (data?.period.from) next.set('date_from', data.period.from);
        if (data?.period.to) next.set('date_to', data.period.to);
      } else if (value) next.set('period', value);
      return next;
    });
  }
  function clear() {setPickDates(false); setParams(previous => {const next = new URLSearchParams(previous); Object.keys(filterNames).forEach(name => next.delete(name)); return next;});}

  const columns = useMemo<ColumnDef<Outlet, unknown>[]>(() => [
    {accessorKey: 'outlet', header: 'Outlet', cell: ({row}) => <div className="insights-outlet-cell"><strong>{row.original.outlet}</strong><small>{[row.original.city, row.original.region].filter(Boolean).join(', ')}</small></div>},
    {accessorKey: 'orders', header: 'Orders', cell: ({row}) => <span className="numeric">{count(row.original.orders)}</span>},
    {accessorKey: 'gross_sales', header: 'Gross sales', cell: ({row}) => <>{numeric(row.original.gross_sales)}<small className="insights-cell-note">{row.original.avg_ticket == null ? 'No average ticket' : money(row.original.avg_ticket) + ' avg ticket'}</small></>},
    {accessorKey: 'nett_settled', header: 'Nett settled', cell: ({row}) => numeric(row.original.nett_settled)},
    {accessorKey: 'bank_received', header: 'Kept in bank', cell: ({row}) => numeric(row.original.bank_received)},
    {accessorKey: 'keep_rate', header: 'Keep rate', cell: ({row}) => <><strong className="numeric">{rate(row.original.keep_rate)}</strong><small className="insights-cell-note">{rate(row.original.keep_rate_expected)} expected</small></>},
    {accessorKey: 'deduction', header: 'Payment cost', cell: ({row}) => <>{numeric(row.original.deduction)}<small className="insights-cell-note">{rate(row.original.deduction_rate)} of gross</small></>},
    {accessorKey: 'pending_bank', header: 'Pending bank', cell: ({row}) => numeric(row.original.pending_bank)},
    {accessorKey: 'to_check', header: 'To check', cell: ({row}) => numeric(row.original.to_check)},
    {accessorKey: 'match_rate', header: 'Match rate', cell: ({row}) => <span className="numeric">{percent(row.original.match_rate)}</span>},
    {id: 'cost_details', header: 'Cost details', enableSorting: false, cell: ({row}) => <details className="insights-cost-details"><summary aria-label={'Breakdown for ' + row.original.outlet}>Breakdown</summary><dl>
      <dt>Provider gross</dt><dd>{money(row.original.provider_gross)}</dd><dt>MDR</dt><dd>{money(row.original.mdr)}</dd>
      <dt>Provider promo</dt><dd>{row.original.promo_provider == null ? 'Not available' : money(row.original.promo_provider)}</dd>
      <dt>Bank fees</dt><dd>{money(row.original.fees)}</dd><dt>Expected differences</dt><dd>{money(row.original.expected_diff)}</dd>
    </dl></details>},
  ], []);

  const needsMatching = performance.error?.startsWith('Run matching first');
  return <div className="insights-page" aria-busy={performance.updating || anomalies.updating || profiles.updating} data-page="insights" data-ready={!performance.loading && !anomalies.loading && !!data && !performance.error && !anomalies.error}>
    <div className="page-head"><div><h1>Outlet insights</h1><p>Sales, payment costs and money in the bank, from your reconciled results.</p></div><div className="page-header-actions"><CopyLink/><Button onClick={() => setEditing(true)} disabled={!profiles.data?.profiles.length}>Edit City/Region</Button></div></div>
    <section className="selection-bar" aria-label="Insights selection">
      <label>Period<select value={custom ? 'custom' : filters.period || ''} onChange={event => changePeriod(event.target.value)}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {custom && <><DateField label="From" value={filters.date_from || ''} max={filters.date_to || undefined} onChange={value => update('date_from', value)}/><DateField label="To" value={filters.date_to || ''} min={filters.date_from || undefined} onChange={value => update('date_to', value)}/></>}
      <label>Outlet<select value={filters.outlet} onChange={event => update('outlet', event.target.value)}><option value="">All outlets</option>{filters.outlet && !profileNames.includes(filters.outlet) && <option>{filters.outlet}</option>}{profileNames.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>City<select value={filters.city} onChange={event => update('city', event.target.value)}><option value="">All cities</option>{filters.city && !cities.includes(filters.city) && <option>{filters.city}</option>}{cities.map(city => <option key={city}>{city}</option>)}</select></label>
      <label>Region<select value={filters.region} onChange={event => update('region', event.target.value)}><option value="">All regions</option>{filters.region && !regions.includes(filters.region) && <option>{filters.region}</option>}{regions.map(region => <option key={region}>{region}</option>)}</select></label>
    </section>
    <div className="filter-summary"><span>{active.length ? 'Showing only' : 'Showing everything: all outlets, all dates'}</span>{active.map(([name, value]) => <button className="filter-chip" key={name} onClick={() => update(name, '')}>{filterNames[name]}: {name.startsWith('date') ? date(value!) : name === 'period' ? periods.find(([period]) => period === value)?.[1] || value : value}<X size={13}/><span className="sr-only">Remove {filterNames[name]} filter</span></button>)}{!!active.length && <Button variant="quiet" onClick={clear}>Clear all</Button>}</div>
    {performance.updating && <p role="status">Updating…</p>}
    {notice && <p role="status" className="insights-notice">{notice}</p>}
    {profiles.error && !needsMatching && <div className="insights-profile-error"><span>City/Region filters: {profiles.error}</span><Button variant="quiet" onClick={profiles.retry}>Retry profiles</Button></div>}
    {performance.loading ? <Loading/> : needsMatching ? <Empty title="Run matching first: insights use reconciled results"><Link className="button primary" to={clientPath('/workflow?step=4')}>Go to matching</Link></Empty> : performance.error ? <ErrorState message={performance.error} retry={performance.retry}/> : data && <>
      <p className="insights-period"><strong>{data.period.label}</strong>{data.period.from && data.period.to && <span>{date(data.period.from)} — {date(data.period.to)}</span>}<span>{count(data.period.days)} days</span></p>
      {data.period.coverage < 1 && <p className="insights-coverage" role="status">{data.period.coverage === 0 ? 'No POS data covers these dates. This selection does not establish zero sales.' : <>POS data covers {percent(data.period.coverage * 100)} of the selected days{data.period.data_from && data.period.data_to ? `, from ${date(data.period.data_from)} to ${date(data.period.data_to)}` : ''}. Missing days are not treated as zero sales.</>}{!!data.period.data_dates?.length && <details><summary>Dates with POS data</summary>{data.period.data_dates.map(day => date(day)).join(', ')}</details>}</p>}
      {!data.rows.length ? <Empty title="No reconciled sales for this selection"><Button onClick={clear}>Clear filters</Button></Empty> : <>
        <div className="insights-kpis">
          <KpiCard label="Gross sales" value={money(data.totals.gross_sales)} detail={`${count(data.totals.orders)} orders`}/>
          <KpiCard label="Kept in bank" value={money(data.totals.bank_received)} detail={`${rate(data.totals.keep_rate)} keep rate`} tone="green"/>
          <KpiCard label="Payment cost" value={money(data.totals.deduction)} detail={`${rate(data.totals.deduction_rate)} deduction rate`}/>
          <KpiCard label="To check" value={money(data.totals.to_check)} detail="Outlet-attributed money gaps" tone={data.totals.to_check > 0 ? 'amber' : 'neutral'}/>
        </div>
        <section className="insights-comparison" aria-labelledby="insights-quadrant-title">
          <div className="section-head"><div><h2 id="insights-quadrant-title">Sales and money kept</h2><p>Each dot is an outlet. Right means more sales; up means more of sales reached the bank.</p></div></div>
          <div className="insights-comparison-grid"><OutletScatter rows={data.rows} medians={data.medians} onSelect={row => navigate(clientPath('/analysis?' + new URLSearchParams({tab:'map',stage:'l2',outlet:row.outlet,...(data.period.from ? {date_from:data.period.from} : {}),...(data.period.to ? {date_to:data.period.to} : {})}).toString()))}/>{quadrant.length ? <ul className="insights-quadrant-list" aria-label="Sells a lot, keeps little outlets">{quadrant.map(row => <li key={row.outlet}><strong>{row.outlet}</strong><span>{money(row.gross_sales)} gross; {rate(row.keep_rate)} kept</span><p>{row.reason}</p></li>)}</ul> : <p className="insights-muted insights-quadrant-empty">No outlets are in this quadrant for the selected dates.</p>}</div>
        </section>
        <section className="insights-outlets" aria-labelledby="insights-outlets-title"><div className="section-head"><div><h2 id="insights-outlets-title">Outlets</h2><p>Lowest keep rate first. Select a column heading to change the order.</p></div></div><DataTable caption="Outlet performance, lowest keep rate first" data={sortedRows} columns={columns} getRowId={row => row.outlet}/></section>
      </>}
      {!!data.unassigned.credits && <p className="insights-unassigned">{count(data.unassigned.credits)} bank {data.unassigned.credits === 1 ? 'credit' : 'credits'} ({money(data.unassigned.amount)}) without a settlement cannot be assigned to an outlet. This amount is separate from outlet totals.</p>}
      <section className="insights-anomalies-section" aria-labelledby="insights-anomalies-title"><div className="section-head"><div><h2 id="insights-anomalies-title">Anomalies</h2><p>Open an item to inspect its evidence in Match analysis.</p></div></div>{anomalies.loading ? <Loading/> : anomalies.error ? <ErrorState message={anomalies.error} retry={anomalies.retry}/> : anomalies.data && <AnomalyList {...anomalies.data}/>}</section>
      <details className="insights-method"><summary>How these numbers are calculated</summary><p>Gross sales are the POS amounts included in the reconciled results. Payment cost is gross sales minus nett settled plus bank fees. Keep rate is bank received divided by gross sales; expected keep rate is nett settled minus fees, divided by gross sales. Bank credits are allocated by settlement nett amounts. Pending bank and to-check amounts can overlap and must not be added together. Expected rounding, fee and promo differences are kept separate from money to investigate.</p></details>
    </>}
    {editing && profiles.data && <ProfilesModal profiles={profiles.data.profiles} onClose={() => setEditing(false)} onSaved={() => {setEditing(false); setNotice('Outlet profiles saved.');}}/>}
  </div>;
}
