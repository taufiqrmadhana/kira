import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, GitCompareArrows, ListChecks, ChartScatter, Menu } from 'lucide-react';
const Overview = lazy(() => import('./pages/overview/Overview'));
const Analysis = lazy(() => import('./pages/analysis/Analysis'));
const Insights = lazy(() => import('./pages/insights/Insights'));
const Landing = lazy(() => import('./pages/landing/Landing'));
import { api, clientPath } from './lib/api';
import { invalidateMutation, prefetchPage, prefetchWorkspace, queryClient } from './lib/query';
import {useReveal} from './lib/motion';
import './shell.css';
import {ClientSwitcher,WorkspaceActions} from './components/WorkspaceControls';
import { useResource } from './lib/useResource';
const ChatPanel = lazy(() => import('./kira/ChatPanel').then(module => ({default: module.ChatPanel})));
const Login = lazy(() => import('./pages/Login'));
const Workflow = lazy(() => import('./pages/workflow/Workflow'));
const Components = lazy(() => import('./pages/dev/Components'));
import { WorkspaceStatus, type WorkflowProgress } from './kira/WorkspaceStatus';
import { Empty, ErrorState, Loading } from './components';
import type { ChangeDestination, Highlight, ToolCall } from './kira/protocol';

interface User { user: string; auth: boolean }
interface Client { id: string; name: string }


function AnalysisRoute({progress}: {progress: ReturnType<typeof useResource<WorkflowProgress>>}) {
  if (progress.loading && !progress.data) return <Loading />;
  if (progress.error) return <ErrorState message={progress.error} retry={progress.retry} />;
  if (progress.data && !(progress.data.matching.l1.done && progress.data.matching.l2.done)) return <><div className="page-head"><div><h1>Match analysis</h1></div></div><WorkspaceStatus view="analysis" status={progress.data} onRefresh={progress.retry}/></>;
  return <Analysis />;
}

function Workspace({ user, client, clients, onClient, onSignOut }: { user: User; client: string; clients: Client[]; onClient: (id: string) => void; onSignOut: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent<{path:string;client?:string}>).detail;if(!detail?.path?.startsWith('/')||detail.path.startsWith('//'))return;const target=new URL(detail.path,window.location.origin);target.searchParams.set('c',detail.client??client);navigate(target.pathname+target.search);};window.addEventListener('kira:navigate',handler);return()=>window.removeEventListener('kira:navigate',handler);},[navigate,client]);
  const progress = useResource<WorkflowProgress>('/status');
  const [expanded, setExpanded] = useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const pageRef=useRef<HTMLDivElement>(null), navRef=useRef<HTMLElement>(null);
  const [navMarker,setNavMarker]=useState({top:0,height:44});
  useReveal(pageRef,location.pathname);
  useLayoutEffect(() => {
    const update=()=>{const active=navRef.current?.querySelector<HTMLElement>('a.active');if(active)setNavMarker({top:active.offsetTop,height:active.offsetHeight});};
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);
  },[location.pathname,expanded]);
  const page = location.pathname.startsWith('/insights') ? 'Insights' : location.pathname.startsWith('/analysis') ? 'Match analysis' : location.pathname.startsWith('/workflow') ? 'Workflow' : 'Overview';
  const workspaceName = clients.find(item => item.id === client)?.name || 'Main workspace';
  const onDataChanged = (calls: ToolCall[], destination?: ChangeDestination) => {
    for (const call of calls) { const path = ({convert_files:'/convert', save_upload_rule:'/upload-rules', save_cleaning:'/cleaning/save', save_matching_rule:'/matching/rules', run_matching:'/matching/run', save_follow_ups:'/analysis/follow-ups', add_sample_files:'/files/samples'} as Record<string,string>)[call.tool]; if (path) void invalidateMutation(path, 'POST', client); }
    if (typeof destination === 'number') navigate(`/workflow?step=${destination}`);
    else if (destination === 'follow-up') navigate('/analysis?tab=follow');
  };
  const highlight = ({ keys, note }: Highlight) => navigate(`/analysis?${new URLSearchParams({ tab: 'map', stage: 'l2', keys: keys.join(','), highlight: note })}`);
  return <div className={`app integration-app ${expanded ? 'nav-open' : ''} ${chatOpen ? 'chat-open' : ''}`} >
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link to={clientPath('/overview')} className="integration-brand" aria-label="KIRA home"><span aria-hidden="true">K</span>KIRA<span aria-hidden="true">.</span></Link>
      <ClientSwitcher client={client} clients={clients} onClient={onClient}/>
      <p className="nav-label">Daily work</p>
      <nav data-tour="main-nav" ref={navRef} aria-label="Main navigation"><span className="nav-marker" aria-hidden="true" style={{transform:`translateY(${navMarker.top}px)`,height:navMarker.height}}/><NavLink to={clientPath('/overview')} end onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><LayoutDashboard size={18} />Overview</NavLink><NavLink to={clientPath('/workflow')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><ListChecks size={18} />Workflow{((progress.data?.upload_rules_pending?.length ?? 0)+(progress.data?.cleaning.open ?? 0))>0 && <span className="nav-count">{(progress.data?.upload_rules_pending?.length ?? 0)+(progress.data?.cleaning.open ?? 0)}</span>}</NavLink><NavLink to={clientPath('/analysis')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><GitCompareArrows size={18} />Match analysis</NavLink><NavLink to={clientPath('/insights')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><ChartScatter size={18} />Insights</NavLink></nav>
      <div id="kira-sidebar-launch" className="sidebar-kira-slot"/>
    </aside>
    <div className="workspace-body">
      <header className="topbar"><div><button className="button quiet nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Menu size={20} /></button><span>{workspaceName}</span><span aria-hidden="true">/</span><strong>{page}</strong></div><div className="topbar-actions"><div id="kira-topbar-launch"/><WorkspaceActions client={client} user={user} onSignOut={onSignOut}/></div></header>
      <main id="main"><div className="integration-layout"><div ref={pageRef} className="integration-page" key={client}><Suspense fallback={<Loading/>}><Routes>
        <Route path="/overview" element={<Overview progress={progress} />} />
        <Route path="/workflow/*" element={<Workflow />} />
        <Route path="/analysis" element={<AnalysisRoute progress={progress} />} />
        <Route path="/insights" element={<Insights />} />
        {import.meta.env.DEV && <Route path="/dev/components" element={<Components />} />}
        <Route path="*" element={<Empty title="Page not found"><Link to={clientPath('/overview')}>Return to Overview</Link></Empty>} />
      </Routes></Suspense></div><Suspense fallback={null}><ChatPanel client={client} user={user.user} presentation="workspace" initiallyOpen={new URLSearchParams(location.search).get("guide")==="1"} launcherTargets={{desktop:"kira-sidebar-launch",mobile:"kira-topbar-launch"}} onOpenChange={setChatOpen} context={{ page, workspace: workspaceName, outlet: new URLSearchParams(location.search).get('outlet') || '' }} onDataChanged={onDataChanged} onHighlight={highlight} onUnauthorized={onSignOut} /></Suspense></div></main>
      <footer className="app-footer"><span>KIRA</span><span>POS → Settlement → Bank</span></footer>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');
  const [clientsVersion, setClientsVersion] = useState(0);
  const [selectedClient, setClient] = useState(localStorage.getItem('kira-client') || '');
  const navigate = useNavigate();
  const location = useLocation();
  const client = new URLSearchParams(location.search).get('c') ?? selectedClient;
  useEffect(() => { localStorage.setItem('kira-client', client); setClient(client); if (user) void prefetchWorkspace(client); }, [client, user]);
  const signedIn = useCallback((identity: User) => {
    if (localStorage.getItem('kira-user') !== identity.user) queryClient.clear();
    localStorage.setItem('kira-user', identity.user); setUser(identity);
    const next = new URLSearchParams(location.search).get('next');
    if (location.pathname === '/login') navigate(next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/', { replace: true });
  }, [location.pathname, location.search, navigate]);
  useEffect(() => {
    const abort = new AbortController();
    // The home page is public; checking identity must not redirect a visitor away from it.
    fetch('/api/me', { signal: abort.signal, credentials: 'include' })
      .then(async response => response.ok ? response.json() as Promise<{ user: string | null; auth: boolean }> : null)
      .then(value => { if (!abort.signal.aborted && value?.user) signedIn({ user: value.user, auth: value.auth }); })
      .catch(() => {}).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, []);
  useEffect(()=>{const refresh=()=>setClientsVersion(value=>value+1);window.addEventListener('kira:clients-changed',refresh);return()=>window.removeEventListener('kira:clients-changed',refresh);},[]);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    setClientsLoading(true); setClientsError('');
    api<Client[]>('/clients', { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setClients(value); })
      .catch(error => { if (!abort.signal.aborted) setClientsError(error.message); })
      .finally(() => { if (!abort.signal.aborted) setClientsLoading(false); });
    return () => abort.abort();
  }, [user, clientsVersion]);
  if (checking) return <main className="workspace-opening"><p role="status">Opening your workspace…</p></main>;
  if (location.pathname === '/') return <Suspense fallback={<Loading/>}><Landing user={user} clients={clients} clientsLoading={clientsLoading} clientsError={clientsError} onRetryClients={() => setClientsVersion(version => version + 1)} onAuthenticated={signedIn} onEnter={(id,mode) => {
    localStorage.setItem('kira-client', id); setClient(id);
    navigate({ pathname: '/overview', search: new URLSearchParams({ c: id,...(mode==='guided'?{guide:'1'}:mode==='tutorial'?{tour:'welcome'}:{}) }).toString() });
  }} /></Suspense>;
  if (!user) return <Suspense fallback={<Loading/>}><Login onAuthenticated={signedIn} /></Suspense>;
  return <Workspace key={client} user={user} clients={clients} client={client} onClient={id => {
    localStorage.setItem('kira-client', id); setClient(id);
    const params = new URLSearchParams(location.search); params.set('c', id);
    navigate({ pathname: location.pathname, search: params.toString() });
  }} onSignOut={() => { queryClient.clear(); setUser(null); navigate('/login'); }} />;
}
