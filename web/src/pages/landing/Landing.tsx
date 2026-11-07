import {useEffect, useId, useState} from 'react';
import {ArrowRight, Check, ChevronLeft, ChevronRight, Database, Files, LockKeyhole, Pause, Play, RefreshCw, Upload} from 'lucide-react';
import {Button,RateCell} from '../../components';
import {useClientOverview} from '../../components/WorkspaceControls';
import {useEndpoint} from '../../lib/query';
import {LoginForm,type Identity} from '../Login';
import {count,date,percent,plural} from '../../lib/format';
import './landing.css';

export interface LandingProps {
  user: {user: string; auth: boolean} | null;
  clients: {id: string; name: string}[];
  onEnter: (clientId: string,mode?:'tutorial'|'guided') => void;
  onAuthenticated: (identity:Identity) => void;
  clientsLoading?: boolean;
  clientsError?: string;
  onRetryClients?: () => void;
}

const steps = [
  {name: 'Upload', description: 'CSV, Excel or text PDF files from all three sources.', Icon: Upload},
  {name: 'Convert', description: 'Raw files become clean, consistent tables.', Icon: RefreshCw},
  {name: 'Review', description: 'Check the details and approve your rules.', Icon: Database},
  {name: 'Match', description: 'Follow sales to settlements to bank credits.', Icon: Check},
];

// Published example results, not a request for the current workspace's figures.
// Source: docs/data-guide.md, with-exceptions dataset, days 1–7.
const demoStatistics = [
  {value: count(8784), label: 'sales reconciled', detail: 'A full week across 10 outlets.'},
  {value: percent(98.3), label: 'matched end to end', detail: '8.639 sales traced from POS to the bank.'},
  {value: count(7), label: 'decisions on the first close', detail: '3 upload rules, 2 cleaning cards and 2 matching rules.'},
];

function DemoStatistics() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const isPaused = paused || hovered || focused || reducedMotion;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % demoStatistics.length), 5000);
    return () => window.clearInterval(timer);
  }, [isPaused]);
  const statistic = demoStatistics[index];
  return <section className="landing-statistics" data-tour="landing-statistics" aria-label="Documented demo results" aria-roledescription="carousel"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);}}>
    <div className="landing-statistics-head"><p>Documented demo results <span>20–26 Oct 2026</span></p>
      <div className="landing-statistics-controls">
        <button type="button" onClick={() => setIndex(value => (value + demoStatistics.length - 1) % demoStatistics.length)} aria-label="Previous statistic"><ChevronLeft size={16}/></button>
        <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused || reducedMotion ? 'Play statistics' : 'Pause statistics'} disabled={reducedMotion}>{paused || reducedMotion ? <Play size={14}/> : <Pause size={14}/>}</button>
        <button type="button" onClick={() => setIndex(value => (value + 1) % demoStatistics.length)} aria-label="Next statistic"><ChevronRight size={16}/></button>
      </div>
    </div>
    <div className="landing-statistics-window" aria-live={isPaused ? 'polite' : 'off'} aria-atomic="true">
      <div key={index} className="landing-statistic" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${demoStatistics.length}`}>
        <strong>{statistic.value}</strong><div><p>{statistic.label}</p><span>{statistic.detail}</span></div>
      </div>
    </div>
    <div className="landing-statistics-position" aria-hidden="true">{demoStatistics.map((_, position) => <span key={position} className={position === index ? 'is-current' : ''}/>)}</div>
  </section>;
}

function ClientResults({client}:{client:string}) {
  const summary=useClientOverview(client);
  const follow=useEndpoint<{counts:{open:number;investigating:number;resolved:number}}>(summary.data?.results?'/analysis/follow-ups?limit=1':null,client);
  const results=summary.data?.results;
  const lastDay=Object.keys(results?.by_day??{}).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort().at(-1);
  if(summary.loading)return <small className="landing-client-results">Loading results…</small>;
  if(summary.error)return <small className="landing-client-results">Results unavailable</small>;
  return <span className="landing-client-results">
    <small>{lastDay?`Last sales: ${date(lastDay)}`:'No sales matched yet'}</small>
    <RateCell value={results?.totals.pos?results.totals.full/results.totals.pos*100:null}/>
    <small>{!results?'0 open follow-ups':follow.loading?'Loading follow-ups…':follow.error?'Follow-ups unavailable':`${plural(follow.data?.counts.open??0,'open follow-up')}`}</small>
  </span>;
}

export default function Landing({user, clients, onEnter, onAuthenticated, clientsLoading = false, clientsError, onRetryClients}: LandingProps) {
  const group = useId();
  const [selected, setSelected] = useState(() => localStorage.getItem('kira-client') || '');
  useEffect(() => {
    if (!clients.length) return;
    if (!clients.some(client => client.id === selected)) {
      const saved = localStorage.getItem('kira-client') || '';
      setSelected(clients.some(client => client.id === saved) ? saved : clients[0]?.id || '');
    }
  }, [clients, selected]);
  const selectedClient = clients.find(client => client.id === selected);
  const canEnter=!!selectedClient&&!clientsLoading&&!clientsError;
  return <div className="landing-page">
    <header className="landing-header">
      <a className="landing-brand" href="/" aria-label="KIRA home"><span aria-hidden="true">K</span>KIRA<b aria-hidden="true">.</b></a>
      {user ? <p className="landing-user">{user.user}<span>Reconciliation workspace</span></p> : <span className="landing-header-note">Payment reconciliation for Indonesian merchants</span>}
    </header>
    <main className="landing-main">
      <div className="landing-hero">
        <section className="landing-introduction" aria-labelledby="landing-title">
          <h1 id="landing-title">Match POS sales, provider settlements and bank credits, outlet by outlet.</h1>
          <p className="landing-description">Upload your CSV, Excel or text PDF exports. KIRA converts them into tables, applies the rules you approve and traces each sale to its settlement and bank credit. Your original files stay unchanged.</p>
          <ol className="landing-steps" aria-label="Reconciliation workflow">{steps.map(({name, description, Icon}, index) => <li key={name} style={{animationDelay:`${index*80}ms`}}>
            <span className="landing-step-icon"><Icon size={18} strokeWidth={1.8} aria-hidden="true"/></span>
            <h2>{index + 1}. {name}</h2><p>{description}</p>
          </li>)}</ol>
        </section>
        <aside className={`landing-workspaces${user?'':' landing-signin'}`} data-tour="landing-workspaces" aria-label={user?'Choose a workspace':'Sign in'}>
          {user?<><h2>Choose a workspace</h2>
            {clientsLoading ? <p role="status" className="landing-workspaces-message">Loading your workspaces…</p> : clientsError ? <div className="landing-workspaces-message"><p role="alert">{clientsError}</p>{onRetryClients && <Button className="landing-retry" onClick={onRetryClients}>Retry workspaces</Button>}</div> : clients.length ? <fieldset className="landing-client-list"><legend className="sr-only">Available workspaces</legend>{clients.map(client => <label key={client.id} className={`landing-client ${selected === client.id ? 'is-selected' : ''}`}>
              <input type="radio" name={group} value={client.id} checked={selected === client.id} onChange={() => setSelected(client.id)}/>
              <span className="landing-client-initial" aria-hidden="true">{client.name.trim().charAt(0).toUpperCase() || 'K'}</span>
              <span className="landing-client-copy"><strong>{client.name}</strong><ClientResults client={client.id}/></span>
              {selected === client.id ? <Check size={16} aria-hidden="true"/> : <ChevronRight size={16} aria-hidden="true"/>}
            </label>)}</fieldset> : <div className="landing-workspaces-empty"><Files size={28} strokeWidth={1.4} aria-hidden="true"/><h3>No workspaces yet</h3><p>No workspaces are available for this account.</p></div>}
            <div className="landing-entry-actions">
              <Button className="landing-enter-button" disabled={!canEnter} onClick={()=>selectedClient&&onEnter(selectedClient.id)}>Enter workspace<ArrowRight size={18} aria-hidden="true"/></Button>
              <Button className="landing-secondary-action" data-tour="landing-tutorial" disabled={!canEnter} onClick={()=>selectedClient&&onEnter(selectedClient.id,'tutorial')}>Take the tutorial</Button>
              <Button className="landing-secondary-action" data-tour="landing-guided" disabled={!canEnter} onClick={()=>selectedClient&&onEnter(selectedClient.id,'guided')}>Do today's close with Kira</Button>
            </div>
          </>:<LoginForm onAuthenticated={onAuthenticated}/>}
          <p className="landing-workspace-note"><LockKeyhole size={13} aria-hidden="true"/><span>Each workspace keeps its files, rules and results separate.</span></p>
        </aside>
      </div>
      <DemoStatistics/>
    </main>
  </div>;
}
