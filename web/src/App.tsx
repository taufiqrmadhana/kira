import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ChartNoAxesCombined, GitCompareArrows, LayoutDashboard, LogOut, Menu, PanelLeftClose } from 'lucide-react';
import { Button, Empty, Modal } from './components';
import { ChatIntegration, WorkflowIntegration } from './components/TeamIntegration';
import Login from './pages/Login';
import Overview from './pages/overview/Overview';
import Analysis from './pages/analysis/Analysis';
import { api, identity } from './lib/api';
import { useResource } from './lib/useResource';
export default function App() {
    const location = useLocation();
    const [expanded, setExpanded] = useState(false), [profile, setProfile] = useState(false), [user, setUser] = useState(identity.user()), [error, setError] = useState('');
    const [compact,setCompact]=useState(false);
    useEffect(()=>{const media=window.matchMedia('(max-width: 800px)');const sync=()=>setCompact(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
    useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
    const clients = useResource<{
        id: string;
        name: string;
    }[]>(['/login','/login.html'].includes(location.pathname) ? null : '/clients');
    useEffect(() => setExpanded(false), [location.pathname, location.search]);
    const client = identity.client(), clientSuffix = client ? '?c=' + encodeURIComponent(client) : '';
    const clientName = clients.data?.find(item => item.id === client)?.name || client || 'Main workspace';
    if (location.pathname === '/login' || location.pathname === '/login.html')
        return <Login />;
    const page = location.pathname.startsWith('/analysis') ? 'Match analysis' : location.pathname.startsWith('/workflow') ? 'Workflow' : 'Overview';
    return <div className={`app ${expanded ? 'nav-open' : ''}`}><a className="skip" href="#main">Skip to content</a><aside className="sidebar" aria-label="Workspace navigation" inert={compact && !expanded}><Link to={'/' + clientSuffix} className="brand" aria-label="KIRA Overview">kira<span>↗</span></Link><div className="workspace"><span className="workspace-mark">{clientName[0]?.toUpperCase()}</span><div><strong title={clientName}>{clientName}</strong><small>Reconciliation workspace</small></div></div><nav aria-label="Main navigation"><NavLink to={'/' + clientSuffix} end><LayoutDashboard size={19}/>Overview</NavLink><NavLink to={'/workflow' + clientSuffix}><GitCompareArrows size={19}/>Workflow</NavLink><NavLink to={'/analysis' + clientSuffix}><ChartNoAxesCombined size={19}/>Match analysis</NavLink></nav><div className="sidebar-bottom"><Button className="profile-button" variant="quiet" onClick={() => setProfile(true)} aria-label="Edit your profile"><span className="avatar">{identity.user()[0]}</span><span><strong>{identity.user()}</strong><small>Finance team</small></span></Button><Button variant="quiet" aria-label="Sign out" onClick={async () => { try {
        await api('/logout', { method: 'POST' });
        window.location.assign('/login');
    }
    catch (error) {
        setError((error as Error).message);
    } }}><LogOut size={16}/></Button></div></aside><div className="workspace-body"><header className="topbar"><div><Button variant="quiet" className="nav-toggle" aria-label="Toggle navigation" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <PanelLeftClose size={20}/> : <Menu size={20}/>}</Button><span>Daily work</span><span className="slash">/</span><strong>{page}</strong></div><Button variant="quiet" className="top-user" onClick={() => setProfile(true)}><span className="avatar">{identity.user()[0]}</span>{identity.user()}</Button></header>{error && <p className="error-inline" role="alert">{error}</p>}<main id="main"><Routes><Route path="/" element={<Overview />}/><Route path="/overview" element={<Overview />}/><Route path="/analysis" element={<Analysis />}/><Route path="/workflow/*" element={<WorkflowIntegration />}/><Route path="*" element={<Empty title="Page not found"><Link to={'/' + clientSuffix}>Return to Overview</Link></Empty>}/></Routes></main><ChatIntegration /><footer className="app-footer"><span>KIRA workspace</span><span>POS → Settlement → Bank</span></footer></div>{profile && <Modal title="Your profile" onClose={() => setProfile(false)}><form onSubmit={event => { event.preventDefault(); localStorage.setItem('kira-user', user.trim() || 'Andrew'); setProfile(false); }}><label>Your name<input required maxLength={100} value={user} onChange={event => setUser(event.target.value)}/></label><p className="table-note">This name appears on changes you save.</p><Button variant="primary" type="submit">Save profile</Button></form></Modal>}</div>;
}
