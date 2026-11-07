import {Link} from 'react-router-dom';
import {Check, FileUp, Table2, Brush, GitCompareArrows} from 'lucide-react';
import {Button, ErrorState, Loading} from '../components';
import {clientPath} from '../lib/api';
import {count} from '../lib/format';

export interface WorkflowProgress {
  step: number;
  next: { say: string };
  files: Record<string, number>;
  converted: boolean;
  upload_rules_pending: string[];
  cleaning: { open: number; rules_version: number | null };
  matching: Record<string, { done: boolean; rules: number }>;
}

export function WorkspaceStatus({status, loading, error, onRefresh, view = 'overview'}: {
  status?: WorkflowProgress; loading?: boolean; error?: string; onRefresh: () => void; view?: 'overview' | 'analysis';
}) {
  if (loading) return <Loading/>;
  if (error) return <ErrorState message={error} retry={onRefresh}/>;
  if (!status) return <ErrorState message="Workspace details could not be loaded. Try again." retry={onRefresh}/>;
  if (view === 'analysis') return <section className="empty workspace-empty" aria-labelledby="matching-needed-title">
    <h2 id="matching-needed-title">Run both matching stages to see the evidence.</h2>
    <p>{status.matching.l1.done ? 'Stage 1 done, stage 2 not run yet.' : 'Stage 1 and stage 2 have not run yet.'}</p>
    <Link className="button primary" to={clientPath('/workflow?step=4')}>Open matching</Link>
  </section>;
  const files = Object.values(status.files).reduce((sum, value) => sum + value, 0);
  const steps = [
    {name:'Upload files', detail:files ? `${count(files)} source files` : 'Add POS, settlement and bank files', done:['pos','settlement','bank'].every(area => status.files[area] > 0), Icon:FileUp},
    {name:'Convert', detail:'Turn source files into tables', done:status.converted && !status.upload_rules_pending.length, Icon:Table2},
    {name:'Clean', detail:status.cleaning.open ? `${count(status.cleaning.open)} decisions to review` : 'Standardise names and values', done:status.cleaning.rules_version !== null && !status.cleaning.open, Icon:Brush},
    {name:'Run matching', detail:'Trace sales through settlement to bank', done:status.matching.l1.done && status.matching.l2.done, Icon:GitCompareArrows},
  ];
  return <section className="workspace-empty" aria-labelledby="workspace-close-title">
    <h2 id="workspace-close-title">{files ? 'Continue your close' : 'Start your first close'}</h2>
    <p>{files ? status.next.say : 'Upload POS sales, provider settlements and bank statements to trace each payment.'}</p>
    <ol className="workspace-close-steps">{steps.map(({name, detail, done, Icon}, index) => <li key={name} aria-current={!done && status.step === index + 1 ? 'step' : undefined}>
      <span className="workspace-step-icon">{done ? <Check size={20} aria-label="Complete"/> : <Icon size={20} aria-hidden="true"/>}</span><div><strong>{name}</strong><p>{detail}</p></div>
    </li>)}</ol>
    <div className="workspace-empty-actions"><Link className="button primary" to={clientPath(`/workflow?step=${files ? status.step : 1}`)}>{files ? 'Continue the close' : 'Upload files'}</Link><Button data-tour="guided-start" onClick={() => window.dispatchEvent(new CustomEvent('kira:start-guided-close'))}>Do it with Kira</Button></div>
  </section>;
}
