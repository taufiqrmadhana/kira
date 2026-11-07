import {useEffect, useState} from 'react';
import {firstView} from '../../lib/motion';
import { clientPath, identity } from '../../lib/api';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Empty, ErrorState, KpiCard, Loading, Ring, StatusChip } from '../../components';
import { useResource } from '../../lib/useResource';
import { WorkspaceStatus, type WorkflowProgress } from '../../kira/WorkspaceStatus';
import { count, date, money } from '../../lib/format';
import MonthCalendar from './MonthCalendar';
import './overview.css';
interface Stage {
    done: boolean;
    matched: number;
    total: number;
    run_at?: string;
}
interface OverviewData {
    status: {
        next?: {
            say: string;
        };
        matching: {
            l1: Stage;
            l2: Stage;
        };
    };
    results: null | {
        run_at?: string;
        totals: {
            pos: number;
            full: number;
            matched: number;
            mismatched: number;
            review: number;
            credits: number;
            credits_linked: number;
            cash: number;
        };
        by_day: Record<string, {
            pos: number;
            matched: number;
        }>;
        open_items: {
            status: string;
            reason: string;
            outlet?: string;
            key?: string;
            amount?: number;
            pos?: Record<string, unknown> | null;
            stl?: Record<string, unknown> | null;
        }[];
    };
    latest_run?: string;
}
interface Learning {
    closes: {
        questions: number;
        at: string;
        pos: number;
        matched: number;
    }[];
    knowledge: Record<string, number>;
}

export default function Overview({progress}: {progress?: ReturnType<typeof useResource<WorkflowProgress>>} = {}) {
    const overview = useResource<OverviewData>('/overview');
    const learning = useResource<Learning>('/learning');
    const result = overview.data?.results;
    const totals = result?.totals;
    const [reveal,setReveal]=useState(()=>firstView(`overview:${identity.client()}`));
    useEffect(()=>{if(!totals || !reveal)return;const timer=setTimeout(()=>setReveal(false),1000);return()=>clearTimeout(timer);},[!!totals,reveal]);
    const days = Object.keys(result?.by_day || {}).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
    const latestRun = result?.run_at || overview.data?.latest_run;
    const closeRate = totals?.pos ? totals.full / totals.pos * 100 : null;

    return <div className="overview-page" data-reveal={reveal} aria-busy={overview.updating} data-page="overview" data-ready={!overview.loading && !overview.error && !!overview.data}>
        {overview.updating && <p className="updating" role="status">Updating…</p>}
        <div className="page-head overview-page-head">
            <div><h1>Overview</h1><p>What arrived, what’s waiting, and what needs a closer look.</p></div>
            <Link className="button primary" to={clientPath('/workflow')}>Open workflow<ArrowRight size={16}/></Link>
        </div>
        {overview.loading ? <Loading/> : overview.error ? <ErrorState message={overview.error} retry={overview.retry}/> : !totals ?
            progress ? <WorkspaceStatus status={progress.data} loading={progress.loading} error={progress.error} onRefresh={() => {progress.retry(); overview.retry();}}/> : <Empty title="Start your first close"><p>Upload your POS, settlement, and bank files to trace each payment.</p><Link className="button primary" to={clientPath('/workflow')}>Upload your files</Link></Empty> : <>
            <div className="overview-close-banner">
                <p><strong>Latest close{latestRun ? `: ${date(latestRun)}` : ''}</strong><span>{count(totals.full)} of {count(totals.pos)} POS sales fully matched</span></p>
                <Link to={clientPath('/analysis')}>View results<ArrowRight size={14}/></Link>
            </div>
            <section className="overview-close-summary" aria-label="Latest reconciliation results">
                <div className="overview-overall-rate">
                    {closeRate !== null ? <Ring animate={reveal} value={closeRate} label="Match rate" size={132}/> : <div className="overview-undefined-rate"><strong>—</strong><span>No POS sales</span></div>}
                    <p>{count(totals.full)} of {count(totals.pos)} sales traced to the bank</p>
                </div>
                <div className="overview-metrics">
                    <KpiCard label="Matched" value={count(totals.matched)} numericValue={totals.matched} formatValue={count} animate={reveal} detail="POS, settlement and bank all agree" tone="green"/>
                    <KpiCard label="Mismatched" value={count(totals.mismatched)} numericValue={totals.mismatched} formatValue={count} animate={reveal} detail="Missing a link in at least one stage" tone="red"/>
                    <KpiCard label="Needs review" value={count(totals.review)} numericValue={totals.review} formatValue={count} animate={reveal} detail="Amount only, or several candidates" tone="amber"/>
                    <KpiCard label="Bank credits explained" value={money(totals.cash)} numericValue={totals.cash} formatValue={money} animate={reveal} detail={`${count(totals.credits_linked)} of ${count(totals.credits)} credits`}/>
                </div>
                <div className="overview-stage-rates">
                    {(['l1','l2'] as const).map(key => {
                        const stage = overview.data!.status.matching[key];
                        const label = key === 'l1' ? 'POS → Settlement' : 'Settlement → Bank';
                        return <div className="overview-stage-rate" key={key}>
                            {stage.total > 0 ? <Ring animate={reveal} size={76} value={stage.matched / stage.total * 100} label={label}/> : <div className="overview-stage-empty" aria-label={`${label}: No records`}>—</div>}
                            <strong>{label}</strong><span>{count(stage.matched || 0)}/{count(stage.total || 0)} linked</span>
                            {!stage.done && <StatusChip tone="amber">Not run</StatusChip>}
                        </div>;
                    })}
                    <p>Green arcs show linked records; pale tracks show all records.</p>
                </div>
            </section>
            <MonthCalendar byDay={result!.by_day} latestDay={days.at(-1)} closes={learning.data?.closes}/>
            <div className="overview-bottom">
                <section className="learning">
                    <div className="section-head"><div><h2>Decisions per close</h2><p>Longer green bars mean more decisions; the pale track shows the largest close.</p></div></div>
                    {learning.loading ? <Loading/> : learning.error ? <ErrorState message={learning.error} retry={learning.retry}/> : learning.data?.closes.length ? <>
                        <div className="learning-bars">{learning.data.closes.slice(-7).map((close,index) => <div className="bar-row" key={index}>
                            <span>Close {Math.max(0,learning.data!.closes.length - 7) + index + 1}</span>
                            <div className="bar-track"><div style={{width:`${close.questions / Math.max(1,...learning.data!.closes.map(c => c.questions)) * 100}%`}}/></div>
                            <strong>{count(close.questions)} decisions</strong>
                        </div>)}</div>
                        <p className="visual-summary">The latest close needed <strong>{count(learning.data.closes.at(-1)!.questions)}</strong> decisions, compared with <strong>{count(learning.data.closes[0].questions)}</strong> in the first close.</p>
                        <div className="knowledge">{Object.entries(learning.data.knowledge).map(([key,value]) => <span key={key}><strong>{count(value)}</strong> {key.replaceAll('_',' ')}</span>)}</div>
                    </> : <Empty title="Learning starts with your first close"><Link to={clientPath('/workflow')}>Open workflow to start a close</Link></Empty>}
                </section>
                <section className="attention">
                    <div className="section-head"><div><h2>Needs your attention</h2><p>Open items from the latest run.</p></div><Link to={clientPath('/analysis?tab=follow')}>View all<ArrowUpRight size={14}/></Link></div>
                    {result!.open_items.length ? result!.open_items.slice(0,4).map((item,index) => <Link className="attention-row" key={index} to={clientPath('/analysis?' + new URLSearchParams({tab:'follow',...(item.outlet || item.pos?.branch || item.stl?.branch ? {outlet:String(item.outlet || item.pos?.branch || item.stl?.branch)} : {})}).toString())}>
                        <span className="attention-index">{String(index + 1).padStart(2,'0')}</span><div><strong>{item.reason}</strong><small>{String(item.outlet || item.pos?.branch || item.stl?.branch || item.key || item.status)}</small></div><ArrowUpRight size={18}/>
                    </Link>) : <Empty title="No open items">Every payment in this close is accounted for.</Empty>}
                </section>
            </div>
        </>}
    </div>;
}
