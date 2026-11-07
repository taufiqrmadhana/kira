import {useRef, useState} from 'react';
import {Button, Modal} from '../../components';
import {api} from '../../lib/api';
import {useResource} from '../../lib/useResource';
import {count, date, money} from '../../lib/format';

export interface ForceEvidence {
    groupId:string; outlet:string; day:string; count:number; net:number; withdrawal:number; withdrawalN:number;
    bank:number; bankN:number; bankDay:string; delay:number; token:string; maxDays:number;
}
export function ForceMatchCard({evidence:e,onClose,onSaved}:{evidence:ForceEvidence;onClose:()=>void;onSaved:()=>void}) {
    const [note,setNote]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const lock=useRef(false);
    const difference=e.withdrawal-e.bank;
    const suggested=`Confirmed payout for ${e.outlet} on ${date(e.day)}. Bank credit arrived ${e.delay} ${e.delay===1?'day':'days'} later. Accepted withdrawal-to-bank difference of ${money(difference)} as an expected payout adjustment.`;
    const save=async()=>{
        if(lock.current||!note.trim()||!accepted)return;
        lock.current=true;setBusy(true);setError('');
        try {
            await api('/analysis/force-matches',{method:'POST',body:JSON.stringify({group_id:e.groupId,withdrawal_n:e.withdrawalN,bank_n:e.bankN,max_days:e.maxDays,evidence_token:e.token,note:note.trim(),accept_difference:accepted})});
            onSaved();
        }catch(err){setError(err instanceof Error?err.message:'Could not save the force match.');}
        finally{lock.current=false;setBusy(false);}
    };
    return <Modal title="Force Match payout" onClose={()=>{if(!busy)onClose();}}>
        <form className="force-match-card" onSubmit={event=>{event.preventDefault();void save();}} aria-busy={busy}>
            <p><strong>{e.outlet}</strong> · {date(e.day)}</p>
            <p>This links the full daily payout of <strong>{count(e.count)} settlements</strong> to the selected bank credit.</p>
            <dl className="force-match-amounts">
                <div><dt>Settlement net</dt><dd>{money(e.net)}</dd></div>
                <div><dt>Withdrawal</dt><dd>{money(e.withdrawal)}</dd></div>
                <div><dt>Bank credit · {date(e.bankDay)}</dt><dd>{money(e.bank)}</dd></div>
                <div><dt>Withdrawal − bank credit</dt><dd>{money(difference)}</dd></div>
                <div><dt>Settlement net − withdrawal</dt><dd>{money(e.net-e.withdrawal)}</dd></div>
                <div><dt>Bank arrival</dt><dd>{e.delay} {e.delay===1?'day':'days'} later</dd></div>
            </dl>
            <p>Arrival timing and amount differences are separate. Only approve once the payout evidence explains the difference. Accepted differences stay visible under Expected.</p>
            <label>Reason<textarea autoFocus required maxLength={2000} rows={4} value={note} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="Explain why this credit belongs to the payout and why the difference is expected."/></label>
            <Button variant="quiet" disabled={busy} onClick={()=>setNote(suggested)}>Use suggested reason</Button>
            <label className="force-match-confirm"><input type="checkbox" checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}/><span>I checked the payout evidence and accept the displayed difference as expected.</span></label>
            {error&&<p role="alert" className="error-text">{error}</p>}
            <div className="force-match-actions"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy||!note.trim()||!accepted}>{busy?'Saving…':'Confirm Force Match'}</Button></div>
        </form>
    </Modal>;
}
interface Approval {id:number;note:string;by:string;at:string;valid:boolean;active:boolean;left:number[];force_match:{outlet:string;day:string;bank_day:string;difference:number}}
export function ForceMatchHistory({scope}:{scope:string}) {
    const resource=useResource<Approval[]>('/analysis/force-matches');
    const [undo,setUndo]=useState<Approval|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const lock=useRef(false);
    const params=new URLSearchParams(scope);
    const links=(Array.isArray(resource.data)?resource.data:[]).filter(link=>
        (!params.get('outlet')||params.get('outlet')===link.force_match.outlet)&&
        (!params.get('date_from')||link.force_match.day>=params.get('date_from')!)&&
        (!params.get('date_to')||link.force_match.day<=params.get('date_to')!));
    const remove=async()=>{
        if(!undo||lock.current)return;
        lock.current=true;setBusy(true);setError('');
        try{await api(`/analysis/manual-links/${undo.id}`,{method:'DELETE'});setUndo(null);window.dispatchEvent(new Event('kira:data-changed'));}
        catch(err){setError(err instanceof Error?err.message:'Could not undo this force match.');}
        finally{lock.current=false;setBusy(false);}
    };
    return <>
        {resource.error&&<p role="alert">Could not load force-match history. <Button onClick={resource.retry}>Retry history</Button></p>}
        {links.length>0&&<section className="force-match-history" aria-label="Saved force matches"><h3>Saved force matches</h3><p>Approvals for this outlet and date selection, including rows now marked Matched.</p>{links.map(link=><article key={link.id}>
            <strong>{link.force_match.outlet} · {date(link.force_match.day)}</strong>
            <p>{count(link.left.length)} settlements · {money(link.force_match.difference)} accepted payout difference · {link.active?'Applied':link.valid?'Not applied to the current run':'Source data changed; approval no longer applies'}</p>
            <p>{link.note}</p><small>Approved by {link.by} · {date(link.at)}</small>
            <Button onClick={()=>{setError('');setUndo(link);}}>Undo Force Match #{link.id}</Button>
        </article>)}</section>}
        {undo&&<Modal title="Undo Force Match" onClose={()=>{if(!busy)setUndo(null);}}><div className="force-match-card"><p>Remove the approval for {undo.force_match.outlet} on {date(undo.force_match.day)}? Results and money differences will be recalculated using the active matching rules.</p>{error&&<p role="alert">{error}</p>}<div className="force-match-actions"><Button disabled={busy} onClick={()=>setUndo(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={()=>void remove()}>{busy?'Removing…':'Confirm undo'}</Button></div></div></Modal>}
    </>;
}
