import {useState} from 'react';
import {Undo2} from 'lucide-react';
import {Button,ErrorState,Modal,StatusChip} from '../../components';
import {api} from '../../lib/api';
import {count,plural} from '../../lib/format';
import {useResource} from '../../lib/useResource';
import type {SideRow,Stage} from './types';

interface ManualLink {id:number;stage:Stage;left:number[];right:number[];left_keys:string[];right_keys:string[];note:string;by:string;at:string;valid:boolean}
export default function ManualLinks({stage,left,right,onSaved}:{stage:Stage;left:SideRow[];right:SideRow[];onSaved:()=>void}) {
  const links=useResource<ManualLink[]>('/analysis/manual-links');
  const [open,setOpen]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const valid=left.length>0&&right.length===1&&(stage==='l2'||left.length===1)&&[...left,...right].every(row=>row.status==='Not found'&&!row.link);
  const saved=(Array.isArray(links.data)?links.data:[]).filter(link=>link.stage===stage);
  async function create() {
    if(!valid||!note.trim()||busy)return;setBusy(true);setError('');
    try{await api('/analysis/manual-links',{method:'POST',body:JSON.stringify({stage,left:left.map(row=>row.n),right:right.map(row=>row.n),note:note.trim()})});setOpen(false);setNote('');setNotice('Manual link saved. You can undo it below.');onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not link these rows. Try again.');}finally{setBusy(false);}
  }
  async function undo(id:number) {
    if(busy)return;setBusy(true);setError('');
    try{await api(`/analysis/manual-links/${id}`,{method:'DELETE'});setNotice('Manual link removed. The automatic results remain.');onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not undo this link. Try again.');}finally{setBusy(false);}
  }
  return <section className="manual-links" data-tour="manual-links" aria-label="Link records by hand">
    <div className="manual-link-action"><div><h3>Link by hand</h3><p>{stage==='l1'?'Choose one Not found POS sale and one Not found settlement.':'Choose Not found settlements and one Not found bank credit.'} Turn off linked-only filtering to tick both sides.</p></div><Button disabled={!valid||busy} onClick={()=>{setError('');setOpen(true);}}>Link by hand</Button></div>
    {!open&&error&&<p role="alert" className="error-inline">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <details className="manual-link-list"><summary>Saved manual links ({count(saved.length)})</summary>
      {links.error?<ErrorState message={links.error} retry={links.retry}/>:links.loading?<p role="status">Reading manual links…</p>:saved.length?<ul>{saved.map(link=><li key={link.id}><div><strong>{plural(link.left.length,stage==='l1'?'POS sale':'settlement')} → {plural(link.right.length,stage==='l1'?'settlement':'bank credit')}</strong><p>{link.note}</p><small>{link.by} <StatusChip tone={link.valid?'neutral':'amber'}>{link.valid?'Source records unchanged':'Source records changed'}</StatusChip></small></div><Button variant="quiet" aria-label={`Undo manual link ${link.id}`} disabled={busy} onClick={()=>void undo(link.id)}><Undo2 size={14}/>Undo</Button></li>)}</ul>:<p>No manual links in this stage.</p>}
      <p className="manual-link-caption">Links use the exact source rows you selected. Later automatic rules may take precedence; changed source rows make an old link inactive.</p>
    </details>
    {open&&<Modal title="Link selected records by hand" onClose={()=>{if(!busy)setOpen(false);}}><div className="manual-confirm">
      <p>Link {plural(left.length,stage==='l1'?'POS sale':'settlement')} to {plural(right.length,stage==='l1'?'settlement':'bank credit')}. Matching results and money differences will update. You can undo this link from the saved list.</p>
      <label>Reason for linking<textarea autoFocus value={note} maxLength={2000} rows={3} onChange={event=>setNote(event.target.value)} disabled={busy}/></label>
      {error&&<p role="alert" className="error-inline">{error}</p>}
      <div className="manual-confirm-actions"><Button onClick={()=>setOpen(false)} disabled={busy}>Cancel</Button><Button variant="primary" onClick={()=>void create()} disabled={!valid||!note.trim()||busy}>{busy?'Linking…':'Create manual link'}</Button></div>
    </div></Modal>}
  </section>;
}
