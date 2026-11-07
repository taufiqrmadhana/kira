import {useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {Check,ChevronDown,CircleHelp,LogOut,Plus,RotateCcw,Users} from 'lucide-react';
import {api} from '../lib/api';
import {count,date,percent} from '../lib/format';
import {useEndpoint} from '../lib/query';
import {Button} from './primitives';
import {Modal,Popover} from './overlays';
import {useRovingFocus} from './useRovingFocus';
import './WorkspaceControls.css';

export interface WorkspaceClient {id:string;name:string}
export interface WorkspaceOverview {
  status?:{
    files?:Record<string,number>;
    tables?:Record<string,{rows:number;clean_rows?:number}>;
  };
  results?:null|{
    totals:{pos:number;full:number};
    by_day?:Record<string,{pos:number;matched:number}>;
    open_items?:unknown[];
  };
}
/** Explicit client scope keeps menu summaries isolated from the active workspace. */
export function useClientOverview(client:string,enabled=true){return useEndpoint<WorkspaceOverview>(enabled?'/overview':null,client);}
export function clientOverviewLabel(data?:WorkspaceOverview){
  const results=data?.results;
  if(!results?.totals.pos)return 'No matched results yet';
  const lastDay=Object.keys(results.by_day??{}).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort().at(-1);
  const rate=percent(results.totals.full/results.totals.pos*100);
  return lastDay?`${rate} on ${date(lastDay).replace(/ \d{4}$/,'')}`:rate;
}
function ClientRate({client}:{client:string}){
  const summary=useClientOverview(client);
  return <small>{summary.loading?'Loading results…':summary.error?'Results unavailable':clientOverviewLabel(summary.data)}</small>;
}
function ClientMenu({client,clients,onClient,onAdd,anchor,onClose}:{client:string;clients:WorkspaceClient[];onClient:(id:string)=>void;onAdd:()=>void;anchor:React.RefObject<HTMLButtonElement|null>;onClose:()=>void}){
  const focus=useRovingFocus([...clients.map(item=>`client:${item.id}`),'add','switch'],{initial:`client:${client}`});
  return <Popover role="menu" label="Clients" anchorRef={anchor} onClose={onClose} width={312}>
    <div className="client-menu-list">{clients.map(item=><button {...focus(`client:${item.id}`)} type="button" role="menuitemradio" aria-checked={item.id===client} key={item.id} className="client-menu-option" onClick={()=>{onClose();onClient(item.id);}}>
      <span className="client-initial" aria-hidden="true">{item.name.trim().charAt(0).toUpperCase()||'K'}</span><span><strong>{item.name}</strong><ClientRate client={item.id}/></span>{item.id===client&&<Check size={16} aria-hidden="true"/>}
    </button>)}</div>
    <div className="client-menu-actions"><button {...focus('add')} type="button" role="menuitem" onClick={()=>{onClose();onAdd();}}><Plus size={16} aria-hidden="true"/>Add client</button><Link {...focus('switch')} to="/" role="menuitem" onClick={onClose}><Users size={16} aria-hidden="true"/>Switch client</Link></div>
  </Popover>;
}
function AddClient({onClose,onCreated}:{onClose:()=>void;onCreated:(client:WorkspaceClient)=>void}){
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(event:FormEvent){
    event.preventDefault();if(busy||!name.trim())return;
    setBusy(true);setError('');
    try{
      const client=await api<WorkspaceClient>('/clients',{method:'POST',body:JSON.stringify({name:name.trim()})});
      window.dispatchEvent(new CustomEvent('kira:clients-changed',{detail:{client}}));
      onCreated(client);
    }catch(error){setError(error instanceof Error?error.message:'Could not create the client. Try again.');}
    finally{setBusy(false);}
  }
  return <Modal title="Add client" onClose={()=>{if(!busy)onClose();}}><form className="workspace-control-form" onSubmit={save} aria-busy={busy}>
    <label>Client name<input data-autofocus value={name} onChange={event=>setName(event.target.value)} maxLength={100} required autoComplete="organization" disabled={busy}/></label>
    <p>The new workspace starts with no files, rules or results.</p>
    {error&&<p role="alert" className="workspace-control-error">{error}</p>}
    <div className="workspace-control-footer"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={busy||!name.trim()}>{busy?'Creating client…':'Create client'}</Button></div>
  </form></Modal>;
}
export function ClientSwitcher({client,clients,onClient}:{client:string;clients:WorkspaceClient[];onClient:(id:string)=>void}){
  const [open,setOpen]=useState(false),[adding,setAdding]=useState(false);
  const anchor=useRef<HTMLButtonElement>(null),summary=useClientOverview(client);
  const choices=clients.length?clients:[{id:client,name:'Main workspace'}],selected=choices.find(item=>item.id===client)??{id:client,name:'Selected workspace'};
  return <div className="workspace-client-control">
    <button ref={anchor} type="button" className="workspace-client-card" data-tour="client-menu" aria-label={`Choose client: ${selected.name}`} aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(!open)}>
      <span className="client-initial" aria-hidden="true">{selected.name.trim().charAt(0).toUpperCase()||'K'}</span><span className="workspace-client-copy"><strong>{selected.name}</strong><span>IDR</span><small>{summary.loading?'Loading results…':summary.error?'Results unavailable':clientOverviewLabel(summary.data)}</small></span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open&&<ClientMenu client={client} clients={choices} onClient={onClient} onAdd={()=>setAdding(true)} anchor={anchor} onClose={()=>setOpen(false)}/>}
    {adding&&<AddClient onClose={()=>setAdding(false)} onCreated={saved=>{setAdding(false);onClient(saved.id);}}/>}
  </div>;
}

const resettableDemoClients=new Set(['zestly-demo','zestly-demo-latihan']);
function ResetDemo({client,onClose}:{client:string;onClose:()=>void}){
  const summary=useClientOverview(client);
  const [confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[backup,setBackup]=useState('');
  const files=summary.data?.status?.files,tables=summary.data?.status?.tables;
  const ready=!!files&&!summary.loading&&!summary.error;
  async function reset(event:FormEvent){
    event.preventDefault();if(!ready||confirmation!==client||busy)return;
    setBusy(true);setError('');
    try{
      const result=await api<{ok:boolean;backup:string}>('/reset',{method:'POST',headers:{'X-Kira-Client':client},body:JSON.stringify({confirmation})});
      if(!result.ok||!result.backup)throw new Error('The reset response did not include a backup. Check the workspace before retrying.');
      setBackup(result.backup);
      window.dispatchEvent(new CustomEvent('kira:workspace-reset',{detail:{client,backup:result.backup}}));
    }catch(error){setError(error instanceof Error?error.message:'Could not reset the demo. Try again.');}
    finally{setBusy(false);}
  }
  return <Modal title="Reset demo" onClose={()=>{if(!busy)onClose();}}>{backup?<div className="workspace-control-form"><p role="status">Demo reset. Backup saved as <code className="reset-backup">{backup}</code></p><p>This workspace is ready for a new close.</p><div className="workspace-control-footer"><Button variant="primary" onClick={onClose}>Done</Button></div></div>:<form className="workspace-control-form" onSubmit={reset} aria-busy={busy}>
    <p>Back up this demo, then remove its files, rules and results.</p>
    {summary.loading?<p role="status">Loading the current counts…</p>:summary.error?<div role="alert"><p>Could not load the current counts.</p><Button onClick={summary.retry}>Try again</Button></div>:files?<dl className="reset-counts"><div><dt>Files</dt><dd>{count(Object.values(files).reduce((total,value)=>total+value,0))}</dd></div>{[['pos','POS rows'],['settlement','Settlement rows'],['bank','Bank rows']].map(([area,label])=><div key={area}><dt>{label}</dt><dd>{count(tables?.[area]?.clean_rows??tables?.[area]?.rows??0)}</dd></div>)}</dl>:<p role="alert">Current counts are unavailable. Close this dialog and try again.</p>}
    <p>Type <strong>{client}</strong> to confirm.</p>
    <label>Client ID<input data-autofocus value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} aria-describedby="reset-client-description"/></label>
    <small id="reset-client-description">The client ID must match exactly.</small>
    {error&&<p role="alert" className="workspace-control-error">{error}</p>}
    <div className="workspace-control-footer"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="danger" disabled={!ready||confirmation!==client||busy}>{busy?'Backing up and resetting…':'Back up and reset'}</Button></div>
  </form>}</Modal>;
}
export function WorkspaceActions({client,user,onSignOut}:{client:string;user:{user:string;auth:boolean};onSignOut:()=>void}){
  const [account,setAccount]=useState(false),[reset,setReset]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const accountAnchor=useRef<HTMLButtonElement>(null);
  const initials=user.user.trim().split(/\s+/).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join('')||'K';
  async function signOut(){setBusy(true);setError('');try{await api('/logout',{method:'POST'});onSignOut();}catch(error){setError(error instanceof Error?error.message:'Could not sign out. Try again.');}finally{setBusy(false);}}
  return <div className="workspace-actions">
    <Button variant="quiet" className="workspace-tutorial" data-tour="tutorial" aria-label="Tutorial" onClick={()=>window.dispatchEvent(new CustomEvent('kira:open-tutorial-menu',{detail:{client}}))}><CircleHelp size={18} aria-hidden="true"/><span className="workspace-action-label">Tutorial</span></Button>
    {resettableDemoClients.has(client)&&<Button variant="quiet" className="workspace-reset" aria-label="Reset demo" onClick={()=>setReset(true)}><RotateCcw size={16} aria-hidden="true"/><span className="workspace-action-label">Reset demo</span></Button>}
    <button ref={accountAnchor} type="button" className="workspace-account" aria-label={`Account: ${user.user}`} aria-expanded={account} aria-haspopup="menu" onClick={()=>{setError('');setAccount(!account);}}><span className="avatar" aria-hidden="true">{initials}</span><span className="workspace-account-name">{user.user}</span><ChevronDown size={14} aria-hidden="true"/></button>
    {account&&<Popover role="menu" label="Account" anchorRef={accountAnchor} align="end" width={264} onClose={()=>setAccount(false)}><div className="workspace-account-heading"><strong>{user.user}</strong><small>Reconciliation workspace</small></div>{error&&<p role="alert" className="workspace-control-error">{error}</p>}{user.auth?<button className="workspace-signout" type="button" role="menuitem" disabled={busy} onClick={()=>void signOut()}><LogOut size={16} aria-hidden="true"/>{busy?'Signing out…':'Sign out'}</button>:<p className="workspace-local-account">Local workspace</p>}</Popover>}
    {reset&&<ResetDemo key={client} client={client} onClose={()=>setReset(false)}/>}
  </div>;
}
