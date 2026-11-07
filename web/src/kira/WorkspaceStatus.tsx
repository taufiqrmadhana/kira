import { Icon } from './Icons';

export interface WorkflowProgress {
  step: number;
  next: { say: string };
  files: Record<string, number>;
  converted: boolean;
  upload_rules_pending: string[];
  cleaning: { open: number; rules_version: number | null };
  matching: Record<string, { done: boolean; rules: number }>;
}

export function WorkspaceStatus({ status, loading, error, onRefresh }: { status?: WorkflowProgress; loading?: boolean; error?: string; onRefresh: () => void }) {
  const files = status ? Object.values(status.files).reduce((total, n) => total + n, 0) : 0;
  const steps = status ? [
    { name: 'Upload', done: Object.values(status.files).every(n => n > 0), detail: files ? `${files.toLocaleString('id-ID')} source files` : 'Waiting for source files' },
    { name: 'Convert', done: status.converted && !status.upload_rules_pending.length, detail: status.converted ? (status.upload_rules_pending.length ? 'Review proposed upload rules' : 'Source tables converted') : 'Apply saved upload rules' },
    { name: 'Clean', done: status.cleaning.rules_version !== null && !status.cleaning.open, detail: status.cleaning.open ? `${status.cleaning.open} decisions to review` : 'Standardise names and values' },
    { name: 'Match', done: status.matching.l1.done && status.matching.l2.done, detail: 'Link POS, settlement and bank' },
  ] : [];
  return <section className="kira-preview integration-status" aria-labelledby="workspace-status-title">
    <div className="kira-preview-section-heading"><h2 id="workspace-status-title">Workspace status</h2><button type="button" onClick={onRefresh} disabled={loading}><Icon name="refresh" />Refresh</button></div>
    {loading && <div className="kira-preview-status-loading" role="status"><span>Checking the workspace…</span><i /><i /><i /></div>}
    {error && <div className="kira-preview-error" role="alert"><p>{error}</p><button type="button" onClick={onRefresh}>Retry</button></div>}
    {status && <>
      <div className="kira-preview-state"><span className={files ? 'has-files' : ''} aria-hidden="true" />{steps.every(step => step.done) ? 'Matching complete' : files ? 'Close in progress' : 'Waiting for files'}</div>
      <div className="kira-preview-next"><h3>{files ? 'Continue your close' : 'No source files yet'}</h3><p>{files ? status.next.say : 'Your close starts with POS sales, provider settlements and a bank statement.'}</p></div>
      <dl className="kira-preview-files">{(['pos', 'settlement', 'bank'] as const).map(area => <div key={area}><dt>{area === 'pos' ? 'POS sales' : area === 'bank' ? 'Bank statements' : 'Provider settlements'}</dt><dd>{status.files[area].toLocaleString('id-ID')} <span>files</span></dd></div>)}</dl>
      <h3 className="kira-preview-progress-title">Close progress</h3>
      <ol className="kira-preview-steps">{steps.map((step, i) => <li key={step.name} className={step.done ? 'is-done' : status.step === i + 1 ? 'is-current' : ''} aria-current={!step.done && status.step === i + 1 ? 'step' : undefined}><span className="kira-preview-step-number">{step.done ? <Icon name="check" /> : String(i + 1).padStart(2, '0')}</span><div><strong>{step.name}</strong><p>{step.detail}</p></div><span className="kira-preview-step-state">{step.done ? 'Done' : status.step === i + 1 ? 'Current' : ''}</span></li>)}</ol>
    </>}
  </section>;
}
