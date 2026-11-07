import {ArrowRight, Check, FileText, Scan} from 'lucide-react';
import {Button} from '../../components';
import './landing.css';

export interface LandingProps {
  user: {user: string; auth: boolean} | null;
  clients: {id: string; name: string}[];
  onEnter: (clientId: string) => void;
  onSignIn: () => void;
  clientsLoading?: boolean;
  clientsError?: string;
  onRetryClients?: () => void;
}

function FileFlow() {
  return <ol className="landing-flow" aria-label="How Kira works">
    <li>
      <div className="landing-flow-picture" aria-hidden="true"><div className="landing-file-stack"><span/><span/><div><FileText size={32} strokeWidth={1.5}/></div></div></div>
      <span>Upload files</span><ArrowRight className="landing-flow-arrow" size={20} aria-hidden="true"/>
    </li>
    <li>
      <div className="landing-flow-picture" aria-hidden="true"><div className="landing-check-mark"><Scan size={48} strokeWidth={1.2}/><b>K</b><i><Check size={16} strokeWidth={2.5}/></i></div></div>
      <span>Kira checks</span><ArrowRight className="landing-flow-arrow" size={20} aria-hidden="true"/>
    </li>
    <li>
      <div className="landing-flow-picture" aria-hidden="true"><div className="landing-results-sheet">{[0, 1, 2].map(row => <span key={row}><Check size={14} strokeWidth={2}/><i/></span>)}</div></div>
      <span>See results</span>
    </li>
  </ol>;
}

export default function Landing({user, clients, onEnter, onSignIn, clientsLoading = false, clientsError, onRetryClients}: LandingProps) {
  const saved = localStorage.getItem('kira-client');
  const selectedClient = (saved !== null ? clients.find(client => client.id === saved) : undefined) ?? clients[0];
  const blocked = !!user && (clientsLoading || !!clientsError || !selectedClient);
  return <div className="landing-page">
    <header className="landing-header">
      <a className="landing-brand" href="/" aria-label="KIRA home"><span aria-hidden="true">K</span>KIRA<b aria-hidden="true">.</b></a>
      {user && <span className="landing-user">{user.user}</span>}
    </header>
    <main className="landing-main">
      <section className="landing-introduction" aria-labelledby="landing-title">
        <h1 id="landing-title">Every rupiah,<br/><span>accounted for.</span></h1>
        <p className="landing-description">Know which sales reached your bank,<br className="landing-description-break"/> and what still needs a closer look.</p>
        <div className="landing-enter">
          <Button className="landing-enter-button" disabled={blocked} onClick={() => {
            if (!user) onSignIn();
            else if (!blocked && selectedClient) onEnter(selectedClient.id);
          }}>{user ? 'Open overview' : 'Get started'}<ArrowRight size={18} aria-hidden="true"/></Button>
          {user && clientsLoading ? <p className="landing-notice" role="status">Getting things ready…</p> : user && clientsError ? <div className="landing-notice"><p role="alert">{clientsError}</p>{onRetryClients && <Button className="landing-retry" onClick={onRetryClients}>Try again</Button>}</div> : user && !selectedClient ? <p className="landing-notice" role="alert">No workspaces are available for this account.</p> : null}
        </div>
      </section>
      <FileFlow/>
    </main>
  </div>;
}
