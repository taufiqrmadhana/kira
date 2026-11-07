import {useRovingFocus} from '../../components/useRovingFocus';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button, ErrorState, KpiCard, Loading, Tabs } from '../../components';
import { query } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { count, date, percent } from '../../lib/format';
import LinkedTables from './LinkedTables';
import FollowUps from './FollowUps';
import RateTable from './RateTable';
import { ratio } from './types';
import { periodRange } from './period';
import './analysis.css';
import DateField from '../../components/DateField';
import DayGridPanel from '../../components/DayGridPanel';
import {dayEvidenceParams} from '../../lib/dayEvidence';
interface Summary {
    days?:string[];
    totals: {
        pos: number;
        matched: number;
        mismatched: number;
        review: number;
    };
    facets: {
        days: string[];
        outlets: string[];
        providers: string[];
    };
}
const scopeKeys = ['outlet', 'date_from', 'date_to', 'provider', 'keys', 'reason'];
function shiftDay(iso: string, days: number) { const result = new Date(iso + 'T12:00:00Z'); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); }
export default function Analysis() {
    const [params, setParams] = useSearchParams();
    const [dirty, setDirty] = useState(false), [custom, setCustom] = useState(false);
    const [pendingPeriod, setPendingPeriod] = useState('');
    const tab = params.get('tab') === 'map' ? 'map' : ['follow', 'followup'].includes(params.get('tab') || '') ? 'follow' : 'rates';
    const from = params.get('date_from') || params.get('from') || '', to = params.get('date_to') || params.get('to') || '', outlet = params.get('outlet') || '', provider = params.get('provider') || '';
    const scope = query({ date_from: from, date_to: to, outlet, provider, keys: params.get('keys') || '', reason: params.get('reason') || '' });
    const summary = useResource<Summary>('/analysis/summary?' + scope);
    const availableDays=summary.data?.facets.days||[],latest=availableDays.slice().sort().at(-1)||'';
    const days=summary.data?.days??availableDays.filter(day=>(!from||day>=from)&&(!to||day<=to));
    const allowChange = useCallback(() => !dirty || window.confirm('You have unsaved follow-up notes. Discard them and leave this view?'), [dirty]);
    const update = (key: string, value: string) => { if (!allowChange())
        return; setDirty(false); setParams(previous => { const next = new URLSearchParams(previous); if (value)
        next.set(key, value);
    else
        next.delete(key); if (key === 'date_from')
        next.delete('from'); if (key === 'date_to')
        next.delete('to'); return next; }); };
    // Guard same-app links as well as browser refresh while notes are unsaved.
    useEffect(() => { if (!dirty)
        return; const handler = (event: MouseEvent) => { const anchor = (event.target as Element).closest('a'); if (anchor && anchor.origin === location.origin && !anchor.download && !event.defaultPrevented && !allowChange()) {
        event.preventDefault();
        event.stopPropagation();
    } }; document.addEventListener('click', handler, true); return () => document.removeEventListener('click', handler, true); }, [dirty, allowChange]);
    const choosePeriod = (period: string) => { if (period === 'custom') {
        setCustom(true);
        return;
    } if (!allowChange()) return;
      if (period !== 'all' && !latest) { setPendingPeriod(period); return; } setCustom(false); setDirty(false); setParams(previous => { const next = new URLSearchParams(previous); next.delete('from'); next.delete('to'); next.delete('date_from'); next.delete('date_to'); next.set('selection_period', period); if (period !== 'all') {
        next.set('date_to', latest);
        next.set('date_from', period === 'latest' ? latest : period === 'week' ? shiftDay(latest, -6) : latest.slice(0, 7) + '-01');
    } return next; }); };
    useEffect(() => { if (latest && pendingPeriod) { choosePeriod(pendingPeriod); setPendingPeriod(''); } }, [latest, pendingPeriod]);
    const clear = () => { if (!allowChange())
        return; setDirty(false); setCustom(false); setParams(previous => { const next = new URLSearchParams(previous); [...scopeKeys, 'from', 'to', 'selection_period', 'highlight'].forEach(key => next.delete(key)); return next; }); };
    const selectedPeriod = params.get('selection_period') || (!from && !to ? 'all' : 'custom');
    const periodFocus=useRovingFocus(['all','latest','week','month','custom'],{initial:custom?'custom':selectedPeriod});
    const active = [['outlet', outlet], ['date_from', from], ['date_to', to], ['provider', provider], ['reason', params.get('reason') || ''], ['keys', params.get('keys') || '']].filter(([, value]) => value);
    return <div className={`analysis-page analysis-page--${tab}`} data-page="analysis" aria-busy={summary.updating} data-ready={!summary.loading && !!summary.data && !summary.error}>
    {summary.updating && <p className="updating" role="status">Updating…</p>}
    <div className="page-head"><div><h1>Match analysis</h1><p>Trace the payments and follow up on the differences.</p></div></div>
    <section className="selection-bar" aria-label="Select analysis data"><div className="period-picker"><span>Period</span><div className="period-chips" role="group" aria-label="Analysis period">{[['all', 'All dates'], ['latest', 'Latest day'], ['week', 'Last 7 days'], ['month', 'This month'], ['custom', 'Pick dates']].map(([value, label]) => <button type="button" key={value} {...periodFocus(value)} aria-pressed={custom ? value === 'custom' : selectedPeriod === value} onClick={() => choosePeriod(value)}>{label}</button>)}</div></div>
      {(custom || selectedPeriod === 'custom') && <><DateField label="From" value={from} max={to || undefined} onChange={value => update('date_from', value)}/><DateField label="To" value={to} min={from || undefined} onChange={value => update('date_to', value)}/></>}
      <label>Outlet<select value={outlet} onChange={event => update('outlet', event.target.value)}><option value="">All outlets</option>{outlet && !summary.data?.facets.outlets.includes(outlet) && <option>{outlet}</option>}{summary.data?.facets.outlets.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Provider<select value={provider} onChange={event => update('provider', event.target.value)}><option value="">All providers</option>{provider && !summary.data?.facets.providers.includes(provider) && <option>{provider}</option>}{summary.data?.facets.providers.map(value => <option key={value}>{value}</option>)}</select></label>
    </section>
    <div className="filter-summary"><span>{active.length ? 'Showing only' : 'Showing everything: all outlets, all dates'}</span>{active.map(([key, value]) => <button type="button" className="filter-chip" key={key} onClick={() => update(key, '')}>{key === 'date_from' ? 'From ' : key === 'date_to' ? 'To ' : key === 'keys' ? 'Highlighted records: ' : ''}{key.startsWith('date') ? date(value) : value}<X size={13}/><span className="sr-only">Remove {key} filter</span></button>)}{active.length > 0 && <Button variant="quiet" onClick={clear}>Clear all</Button>}<span className="selection-count">{summary.data ? `${days.length} ${days.length === 1 ? 'day' : 'days'}, ${count(summary.data.totals.pos)} POS sales` : ''}</span></div>
    {summary.loading ? <Loading /> : summary.error ? <ErrorState message={summary.error} retry={summary.retry}/> : summary.data && <div className="analysis-kpis"><KpiCard label="End to end" value={percent(ratio(summary.data.totals.matched, summary.data.totals.pos))}/><KpiCard label="POS sales" value={count(summary.data.totals.pos)}/><KpiCard label="Matched" value={count(summary.data.totals.matched)} tone="green"/><KpiCard label="Mismatched" value={count(summary.data.totals.mismatched)} tone="red"/><KpiCard label="Needs review" value={count(summary.data.totals.review)} tone="amber"/></div>}
    <Tabs value={tab} onChange={value => update('tab', value)} items={[{ value: 'rates', label: 'Match rate' }, { value: 'map', label: 'Match map' }, { value: 'follow', label: 'Follow-up' }]}/>
    {params.get('highlight') && <p className="highlight-note" role="status">{params.get('highlight')}</p>}
    <div role="tabpanel" aria-label={tab === 'rates' ? 'Match rate' : tab === 'map' ? 'Match map' : 'Follow-up'}>
      {tab === 'rates' ? <><DayGridPanel expectedRows={outlet ? 1 : summary.data?.facets.outlets.length || 10} scope={scope} latestDay={latest} compact onSelect={cell=>setParams(previous=>dayEvidenceParams(previous,cell))}/><RateTable scope={scope} onOpen={row => { setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', 'map'); next.set('stage', 'l2'); if (row.outlet)
        next.set('outlet', row.outlet); if (row.provider)
        next.set('provider', row.provider); const range = periodRange(row.period, params.get('period') || 'day'); if (range) {
        next.set('date_from', from && from > range[0] ? from : range[0]);
        next.set('date_to', to && to < range[1] ? to : range[1]);
        next.delete('from');
        next.delete('to');
        next.delete('selection_period');
    } return next; }); }}/></> : tab === 'map' ? <LinkedTables key={scope + params.get('stage')} scope={scope} initialStage={params.get('stage') === 'l2' ? 'l2' : 'l1'} onStageChange={stage => update('stage', stage)}/> : <FollowUps key={scope} scope={scope} onDirtyChange={setDirty}/>}
    </div>
  </div>;
}
