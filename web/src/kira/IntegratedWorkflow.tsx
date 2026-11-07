import { useNavigate, useSearchParams } from 'react-router-dom';
import Step4 from '../pages/workflow/Step4';
import { WorkspaceStatus, type WorkflowProgress } from './WorkspaceStatus';

export function IntegratedWorkflow({ client, user, progress, onRefresh }: { client: string; user: string; progress?: WorkflowProgress; onRefresh: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const showMatching = params.get('step') === '4' || !!progress && progress.step >= 4;
  return <>
    <div className="page-head"><div><h1>Workflow</h1><p>Prepare your source files, then match both stages.</p></div></div>
    <p className="integration-note">Upload, conversion and cleaning screens are being connected. Matching is available below for workspaces with prepared data.</p>
    {!showMatching && <><WorkspaceStatus status={progress} onRefresh={onRefresh} /><button className="button secondary" type="button" onClick={() => navigate('/workflow?step=4')}>Open matching</button></>}
    {showMatching && <Step4 clientId={client} userName={user} onDataChanged={onRefresh} onOpenAnalysis={() => navigate('/analysis')} />}
  </>;
}
