import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {Plus} from 'lucide-react';
import {Button, Modal} from './index';
import {api} from '../lib/api';
import './client-selector.css';

export interface ClientOption {id:string;name:string}

function AddClient({onClose,onCreated}:{onClose:()=>void;onCreated:(client:ClientOption)=>void}) {
  const [name,setName]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<{message:string;field:boolean}|null>(null);
  const fieldId=useId();
  const errorId=useId();
  const input=useRef<HTMLInputElement>(null);
  const alert=useRef<HTMLParagraphElement>(null);
  const busy=useRef(false);
  const alive=useRef(true);

  useEffect(()=>{
    alive.current=true;
    const frame=requestAnimationFrame(()=>{if(!alert.current && !busy.current)input.current?.focus();});
    return ()=>{alive.current=false;cancelAnimationFrame(frame);};
  },[]);
  useEffect(()=>{if(error)alert.current?.focus({preventScroll:true});},[error]);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy.current)return;
    const trimmed=name.trim();
    if(!trimmed){setError({message:'Enter a client name.',field:true});return;}
    if(trimmed.length>100){setError({message:'Use 100 characters or fewer.',field:true});return;}
    busy.current=true;setSaving(true);setError(null);
    try {
      const created=await api<ClientOption>('/clients',{method:'POST',body:JSON.stringify({name:trimmed})});
      if(alive.current)onCreated(created);
    } catch(cause) {
      if(alive.current)setError({message:cause instanceof Error?cause.message:'Could not add the client. Please try again.',field:false});
    } finally {
      busy.current=false;
      if(alive.current)setSaving(false);
    }
  }

  return <Modal title="Add client" onClose={()=>{if(!busy.current)onClose();}}>
    <form className="client-create-form" onSubmit={event=>void submit(event)} aria-busy={saving}>
      <p>Give this client a name. You can add its files after creating it.</p>
      <label htmlFor={fieldId}>Client name</label>
      <input ref={input} id={fieldId} name="client-name" value={name} onChange={event=>setName(event.target.value)} required maxLength={100} autoComplete="off" disabled={saving} aria-invalid={!!error?.field} aria-describedby={error?errorId:undefined}/>
      {error && <p ref={alert} id={errorId} className="client-create-error" role="alert" tabIndex={-1}>{error.message}</p>}
      <footer><Button onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving?'Adding…':'Add client'}</Button></footer>
    </form>
  </Modal>;
}

export default function ClientSelector({client,clients,onSelect,onCreated}:{client:string;clients:ClientOption[];onSelect:(id:string)=>void;onCreated:(client:ClientOption)=>void}) {
  const [open,setOpen]=useState(false);
  const selectorId=useId();
  const trigger=useRef<HTMLButtonElement|null>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));
  }
  return <div className="workspace client-selector">
    <label htmlFor={selectorId}>Client selection<select id={selectorId} value={client} onChange={event=>onSelect(event.target.value)}>{clients.length?clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>):<option value={client}>{client?'Current client':'Main client'}</option>}</select></label>
    <Button variant="quiet" className="client-selector-add" onClick={event=>{trigger.current=event.currentTarget;setOpen(true);}}><Plus size={16} aria-hidden="true"/>Add client</Button>
    {open && createPortal(<AddClient onClose={close} onCreated={created=>{setOpen(false);onCreated(created);}}/>,document.body)}
  </div>;
}
