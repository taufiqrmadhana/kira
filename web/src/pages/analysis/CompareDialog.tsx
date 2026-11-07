import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button,ErrorState,Modal,StatusChip} from '../../components';
import {api,identity} from '../../lib/api';
import {date,money,plural} from '../../lib/format';
import {useEndpoint} from '../../lib/query';
import {useReducedMotion} from '../../lib/motion';
import type {ResultRecord} from './RecordsTable';
import type {FollowResponse,FollowUp} from './types';
import './compare-dialog.css';

export interface CompareProps {record:ResultRecord|null;banks:Record<string,Record<string,unknown>>;onClose:()=>void;origin?:HTMLElement;client?:string}
const present=(value:unknown)=>value!==null&&value!==undefined&&value!=='';
const emptyNote={status:'open',note:'',assignee:''};
export default function CompareDialog({record,...props}:CompareProps) {
  return record?<Comparison key={`${props.client??identity.client()}:${record.rid}`} record={record} {...props}/>:null;
}
function Comparison({record,banks,onClose,origin,client=identity.client()}:Omit<CompareProps,'record'>&{record:ResultRecord}) {
  const notes=useEndpoint<FollowResponse>(`/analysis/follow-ups?ids=${encodeURIComponent(record.rid)}&limit=1`,client);
  const [form,setForm]=useState(emptyNote),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const body=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  useEffect(()=>{
    if(!notes.data||dirty)return;
    const note=notes.data.records?.find(item=>item.rid===record.rid)?.follow_up;
    setForm(note?{status:note.status,note:note.note,assignee:note.assignee}:emptyNote);
  },[notes.data,record.rid]);
  useEffect(()=>{
    if(reduced||!origin)return;
    const modal=body.current?.closest<HTMLElement>('.overlay-modal');if(!modal)return;
    const source=origin.getBoundingClientRect(),target=modal.getBoundingClientRect();
    const originPoint=`${source.left+Math.min(source.width/2,60)-target.left}px ${source.top+source.height/2-target.top}px`;
    const animation=modal.animate?.([{opacity:0,transform:'scale(.96)',transformOrigin:originPoint},{opacity:1,transform:'scale(1)',transformOrigin:originPoint}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
    return()=>animation?.cancel();
  },[origin,reduced]);
  const bank=record.bank_i===null?undefined:banks[String(record.bank_i)];
  const comparison=[
    {label:'Outlet',values:[record.pos?.branch,record.stl?.branch,undefined],kind:'text'},
    {label:'Amount',values:[record.pos?.payment_amount,record.stl?.gross_amount,undefined],kind:'money'},
    {label:'Net settlement / bank',values:[undefined,record.group_nett,bank?.kredit],kind:'money'},
    {label:'Date',values:[record.pos?.sales_datetime_out,record.stl?.transaction_date,bank?.tanggal_transaksi],kind:'date'},
  ];
  const close=()=>{if(!saving&&(!dirty||window.confirm('Discard this unsaved follow-up?')))onClose();};
  const edit=(field:keyof typeof form,value:string)=>{setForm(current=>({...current,[field]:value}));setDirty(true);setSaved(false);};
  async function save(event:FormEvent) {
    event.preventDefault();if(saving||notes.loading||notes.error||!dirty)return;
    setSaving(true);setError('');
    try {
      const result=await api<FollowUp>('/analysis/follow-ups',{method:'POST',headers:{'X-Kira-Client':client},body:JSON.stringify({rid:record.rid,...form})});
      setForm({status:result.status,note:result.note,assignee:result.assignee});setDirty(false);setSaved(true);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save this follow-up. Try again.');}
    finally{setSaving(false);}
  }
  return <Modal title={`Compare ${record.rid.startsWith('bank:')?'bank credit':record.key}`} onClose={close}><div ref={body} className="compare-body" data-tour="compare-dialog">
    <div className="compare-description"><StatusChip tone={record.status==='Matched'?'green':record.status==='Needs review'?'amber':'red'} reason={record.reason||undefined}>{record.status}</StatusChip><span>{record.outlet||'Unassigned'}{record.day?`, ${date(record.day)}`:''}</span></div>
    <div className="compare-scroll"><table aria-label="Payment comparison"><thead><tr><th>Field</th><th>POS sale</th><th>Settlement</th><th>Bank credit</th><th>Comparison</th></tr></thead><tbody>{comparison.map(item=>{
      const values=item.values.filter(present),status=values.length<2?'Missing':item.kind==='date'?'Information':values.every(value=>value===values[0])?'Agrees':'Differs';
      return <tr key={item.label}><th scope="row">{item.label}</th>{item.values.map((value,index)=><td key={index} className={item.kind==='money'?'numeric':undefined}>{!present(value)?'—':item.kind==='money'?money(Number(value)):item.kind==='date'?date(String(value)):String(value)}</td>)}<td><StatusChip tone={status==='Agrees'?'green':status==='Differs'?'amber':'neutral'}>{status}</StatusChip></td></tr>;
    })}</tbody></table></div>
    <p className="compare-caption">{record.bank_i!==null&&bank&&record.stl&&record.group_size>1?`${plural(record.group_size,'settlement')} in the whole payout. `:''}The net comparison uses the whole settlement group when a bank credit is linked. Later bank dates are information, not an amount discrepancy.</p>
    {bank&&<p className="compare-bank-reference"><strong>Bank description</strong> {String(bank.keterangan??bank.reference??'No description in the file')}</p>}
    <form onSubmit={event=>void save(event)} aria-busy={saving||notes.loading} className="compare-follow-up"><h3>Follow-up</h3>
      {notes.error&&<ErrorState message={notes.error} retry={notes.retry}/>}
      {notes.loading&&<p role="status">Reading the existing follow-up…</p>}
      <fieldset disabled={saving||notes.loading||!!notes.error}><div className="compare-fields"><label>Status<select value={form.status} onChange={event=>edit('status',event.target.value)}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></label><label>Assignee<input value={form.assignee} maxLength={100} onChange={event=>edit('assignee',event.target.value)}/></label></div><label>Follow-up note<textarea value={form.note} rows={3} maxLength={10000} onChange={event=>edit('note',event.target.value)}/></label></fieldset>
      {error&&<p className="error-inline" role="alert">{error}</p>}{saved&&<p role="status">Follow-up saved.</p>}
      <div className="compare-actions"><Button type="submit" variant="primary" disabled={!dirty||saving||notes.loading||!!notes.error}>{saving?'Saving…':'Save follow-up'}</Button><Button disabled={saving} onClick={()=>{if(dirty&&!window.confirm('Discard this unsaved follow-up and ask Kira?'))return;onClose();window.dispatchEvent(new CustomEvent('kira:ask',{detail:{message:`Explain the payment evidence for ${record.rid.startsWith('bank:')?'this bank credit':record.key}.`,context:{page:'Match analysis',record:record.rid,outlet:record.outlet,date_from:record.day,date_to:record.day}}}));}}>Ask Kira about this record</Button></div>
    </form>
  </div></Modal>;
}
