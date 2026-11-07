import {useEffect,useRef,useState,type DragEvent} from 'react';
import {FolderOpen,Paperclip,Upload,X} from 'lucide-react';
import {Button} from '../../components';
import {count,plural} from '../../lib/format';
import type {Area} from '../../pages/workflow/types';
import {pickedFileKey,validateFiles,type PickedFile} from './engine';
export const sourceNames:Record<Area,string>={pos:'POS',settlement:'Settlement',bank:'Bank'};
interface Entry {isFile:boolean;isDirectory:boolean;name:string;file:(success:(file:File)=>void,error:(e:Error)=>void)=>void;createReader:()=>{readEntries:(success:(entries:Entry[])=>void,error:(e:Error)=>void)=>void}}
async function walk(entry:Entry,folder=''):Promise<PickedFile[]>{if(entry.isFile)return [{file:await new Promise<File>((yes,no)=>entry.file(yes,no)),folder}];if(!entry.isDirectory)return [];const reader=entry.createReader(),files:PickedFile[]=[];for(;;){const entries=await new Promise<Entry[]>((yes,no)=>reader.readEntries(yes,no));if(!entries.length)return files;for(const child of entries)files.push(...await walk(child,[folder,entry.name].filter(Boolean).join('/')));}}
export default function FileSlot({area,busy,onUpload,onPendingChange,progress={}}:{area:Area;busy:boolean;onUpload:(files:PickedFile[])=>void;onPendingChange?:(pending:boolean)=>void;progress?:Record<string,{percent?:number;state:string}>}){
 const [files,setFiles]=useState<PickedFile[]>([]),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const picker=useRef<HTMLInputElement>(null),folder=useRef<HTMLInputElement>(null);
 const label=sourceNames[area];
 const pending=files.filter(pick=>progress[pickedFileKey(pick)]?.state!=='Uploaded');
 useEffect(()=>{onPendingChange?.(pending.length>0);},[pending.length,onPendingChange]);
 useEffect(()=>()=>onPendingChange?.(false),[onPendingChange]);
 function add(picks:PickedFile[]){setFiles(current=>{const next=[...new Map([...current,...picks].map(pick=>[pickedFileKey(pick),pick])).values()];setError(validateFiles(next));return next;});}
 function selected(list:FileList){add(Array.from(list,file=>({file,folder:(file.webkitRelativePath||'').split('/').slice(0,-1).join('/')})));}
 useEffect(()=>{const attach=()=>{if(!busy)picker.current?.click();};window.addEventListener('kira:attach-files',attach);return()=>window.removeEventListener('kira:attach-files',attach);},[busy]);
 async function drop(event:DragEvent){event.preventDefault();event.stopPropagation();setDragging(false);if(busy)return;const entries=Array.from(event.dataTransfer.items||[]).filter(item=>item.kind==='file').map(item=>(item as unknown as {webkitGetAsEntry?:()=>Entry|null}).webkitGetAsEntry?.()).filter((x):x is Entry=>!!x);try{if(entries.length)add((await Promise.all(entries.map(entry=>walk(entry)))).flat());else selected(event.dataTransfer.files);}catch{setError('Could not read this folder. Choose the files again.');}}
 return <div data-tour="guided-files" className={`guided-files${dragging?' dragging':''}`} onDragOver={event=>{event.preventDefault();event.stopPropagation();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>void drop(event)}>
  <p>Send the {label} exports for the days you want to close. CSV, TXT, Excel or text PDF, up to 10 MB each. A whole folder works.</p>
  <div className="guided-actions"><Button disabled={busy} onClick={()=>picker.current?.click()}><Paperclip size={14}/>Choose files</Button><Button disabled={busy} onClick={()=>folder.current?.click()}><FolderOpen size={14}/>Choose folder</Button></div>
  <input ref={picker} hidden multiple disabled={busy} type="file" accept=".csv,.txt,.xlsx,.xlsm,.pdf" aria-label={`${label} files for Kira`} onChange={event=>{if(event.target.files)selected(event.target.files);event.target.value='';}}/>
  <input ref={folder} hidden multiple disabled={busy} type="file" {...{webkitdirectory:''}} aria-label={`${label} folder for Kira`} onChange={event=>{if(event.target.files)selected(event.target.files);event.target.value='';}}/>
  {!!files.length&&<ul>{files.map(({file,folder:path},index)=><li key={pickedFileKey({file,folder:path})}><div><strong>{file.name}</strong><small>{path?`${path}/`:''} {count(Math.ceil(file.size/1024))} KB</small>{progress[pickedFileKey({file,folder:path})]&&<><span role="status">{progress[pickedFileKey({file,folder:path})].state}</span>{! /^(Failed|Not uploaded)/.test(progress[pickedFileKey({file,folder:path})].state)&&<progress aria-label={`Upload ${path?path+'/':''}${file.name}`} max={100} value={progress[pickedFileKey({file,folder:path})].percent}/>}</>}</div><Button variant="quiet" aria-label={`Remove ${file.name}`} disabled={busy} onClick={()=>{const next=files.filter((_,i)=>i!==index);setFiles(next);setError(next.length?validateFiles(next):'');}}><X size={14}/></Button></li>)}</ul>}
  {error&&<p role="alert" className="error-inline">{error}</p>}
  {!!files.length&&<Button variant="primary" disabled={busy||!!error||!pending.length} onClick={()=>onUpload(pending)}><Upload size={14}/>{busy?'Uploading…':pending.length?`Upload ${plural(pending.length,'file')}`:'All files uploaded'}</Button>}
 </div>;
}
