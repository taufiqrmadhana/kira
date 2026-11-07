import { clientPath } from '../../lib/api';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ArrowUpRight } from 'lucide-react';
import { Empty, ErrorState, KpiCard, Loading, Ring, StatusChip } from '../../components';
import { useResource } from '../../lib/useResource';
import { count, date, money } from '../../lib/format';
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
export default function Overview() { const overview = useResource<OverviewData>('/overview'); const learning = useResource<Learning>('/learning'); const result = overview.data?.results; const totals = result?.totals; const days = Object.keys(result?.by_day || {}).sort(); return <><div className="page-head"><div><h1>Overview</h1><p>Your daily close, from sales to the bank.</p></div><Link className="button primary" to={clientPath("/workflow")}>Open workflow<ArrowRight size={16}/></Link></div>{overview.loading ? <Loading /> : overview.error ? <ErrorState message={overview.error} retry={overview.retry}/> : !totals ? <Empty title="Start your first close"><Link className="button primary" to={clientPath("/workflow")}>Upload your files</Link></Empty> : <><div className="close-banner"><span className="check-icon"><Check size={18}/></span><div><strong>Latest close{days.length ? `: ${date(days.at(-1)!)}` : ''}</strong><p>{count(totals.full)} of {count(totals.pos)} sales traced to the bank</p></div><StatusChip>{days.length} sales dates</StatusChip></div><section className="overview-summary"><div className="end-to-end"><Ring value={totals.pos ? totals.full / totals.pos * 100 : 0} label="End to end"/><div><h2>Sales that reached the bank</h2><p>A complete trail through both matching stages.</p><Link to={clientPath("/analysis")}>See the evidence<ArrowUpRight size={16}/></Link></div></div><div className="kpi-grid"><KpiCard label="Matched" value={count(totals.matched)} detail="Complete payment trail" tone="green"/><KpiCard label="Mismatched" value={count(totals.mismatched)} detail="A link is missing" tone="red"/><KpiCard label="Needs review" value={count(totals.review)} detail="Check before closing" tone="amber"/><KpiCard label="Bank credits explained" value={`${count(totals.credits_linked)} / ${count(totals.credits)}`} detail={money(totals.cash)}/></div></section><section className="stage-grid">{(['l1', 'l2'] as const).map((key, i) => { const stage = overview.data!.status.matching[key]; return <div className="stage" key={key}><Ring size={80} value={stage.total ? stage.matched / stage.total * 100 : 0} label={`Stage ${i + 1}`}/><div><span className="step-label">0{i + 1}</span><h3>{i ? 'Settlement → Bank' : 'POS → Settlement'}</h3><p>{count(stage.matched || 0)} of {count(stage.total || 0)} {i ? 'settlements' : 'sales'} linked</p></div><StatusChip tone={stage.done ? 'green' : 'amber'}>{stage.done ? 'Run complete' : 'Not run'}</StatusChip></div>; })}</section><div className="overview-bottom"><section className="learning"><div className="section-head"><div><h2>KIRA learns as it runs</h2><p>Decisions per close. Your saved rules do the rest.</p></div></div>{learning.loading ? <Loading /> : learning.error ? <ErrorState message={learning.error} retry={learning.retry}/> : learning.data?.closes.length ? <><div className="learning-bars">{learning.data.closes.slice(-7).map((close, i) => <div className="bar-row" key={i}><span>Close {Math.max(0, learning.data!.closes.length - 7) + i + 1}</span><div className="bar-track"><div style={{ width: `${close.questions / Math.max(1, ...learning.data!.closes.map(c => c.questions)) * 100}%` }}/></div><strong>{close.questions} decisions</strong></div>)}</div><div className="knowledge">{Object.entries(learning.data.knowledge).map(([key, value]) => <span key={key}><strong>{value}</strong> {key.replaceAll('_', ' ')}</span>)}</div></> : <Empty title="Learning starts with your first close"/>}</section><section className="attention"><div className="section-head"><div><h2>Needs your attention</h2><p>Open items from the latest run.</p></div></div>{result!.open_items.length ? result!.open_items.slice(0, 4).map((item, i) => <Link className="attention-row" key={i} to={clientPath('/analysis?' + new URLSearchParams({ tab: 'follow', ...(item.outlet || item.pos?.branch || item.stl?.branch ? { outlet: String(item.outlet || item.pos?.branch || item.stl?.branch) } : {}) }).toString())}><span className="attention-index">{String(i + 1).padStart(2, '0')}</span><div><strong>{item.reason}</strong><small>{String(item.outlet || item.pos?.branch || item.stl?.branch || item.key || item.status)}</small></div><ArrowUpRight size={18}/></Link>) : <Empty title="No open items">Every payment in this close is accounted for.</Empty>}</section></div></>}</>; }
