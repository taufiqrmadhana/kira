import {useState} from 'react';
import {Button} from '../../components';
import {columnLabel} from '../../lib/columns';
import {requiredColumns,type Area,type Proposal} from '../../pages/workflow/types';
import {sourceNames} from './FileSlot';
export default function UploadDecision({area,proposal,version,busy,onSave,onReview}:{area:Area;proposal:Proposal;version?:number;busy:boolean;onSave:(body:unknown)=>void;onReview:()=>void}){
 const [rename,setRename]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries(proposal.rename||{}).map(([raw,mapping])=>[raw,mapping.to])));
 const derived=new Set(Object.values(proposal.rename||{}).map(mapping=>mapping.to)),headers=proposal.proposed.map(column=>column.name).filter(name=>!derived.has(name));
 const native=(target:string)=>!derived.has(target)&&Object.hasOwn(proposal.samples,target);
 const missing=requiredColumns[area].filter(target=>!native(target)&&!Object.values(rename).includes(target));
 function source(target:string,nextSource:string,previous='') {setRename(current=>{const next={...current};if(previous&&previous!==nextSource)next[previous]='';if(nextSource)next[nextSource]=target;return next;});}
 return <article className="guided-decision" data-tour="guided-decision"><h4>{sourceNames[area]} upload rule v{(version||0)+1}</h4><p>Review the proposed columns before saving this format.</p>
  {proposal.diff?.added.length?<p>New columns: <strong>{proposal.diff.added.join(', ')}</strong></p>:null}
  {proposal.diff?.missing.length?<p>Missing columns: <strong>{proposal.diff.missing.join(', ')}</strong></p>:null}
  {proposal.diff?.types.map(change=><p key={change.name}>{columnLabel(change.name)}: {change.from} → {change.to}</p>)}
  <fieldset disabled={busy}><legend>Required columns</legend>{requiredColumns[area].map(target=>{
   const sources=Object.keys(rename).filter(raw=>rename[raw]===target);
   return <div className="guided-required" key={target}><strong>{columnLabel(target)}</strong>{native(target)&&<p>In the file</p>}{(!native(target)||sources.length>0)&&(sources.length?sources:['']).map((raw,index)=><label key={`${target}:${index}`}><span className="sr-only">Source {index+1}</span><select aria-label={`Guided ${sourceNames[area]} source for ${target}${index?' '+(index+1):''}`} value={raw} onChange={event=>source(target,event.target.value,raw)}><option value="">Not found</option>{headers.map(name=><option key={name} value={name}>{columnLabel(name)}</option>)}</select></label>)}{!!sources.length&&<label><span className="sr-only">Additional source</span><select aria-label={`Guided ${sourceNames[area]} additional source for ${target}`} value="" onChange={event=>{if(event.target.value)source(target,event.target.value);}}><option value="">Add another source</option>{headers.filter(name=>!sources.includes(name)).map(name=><option key={name} value={name}>{columnLabel(name)}</option>)}</select></label>}</div>;
  })}</fieldset>
  {!!missing.length&&<p role="status">Choose a source for {missing.map(columnLabel).join(', ')} before saving.</p>}
  <details><summary>{proposal.proposed.length} proposed columns</summary><ul>{proposal.proposed.map(column=><li key={column.name}>{columnLabel(column.name)}: {column.type}{column.keep===false?' (omit)':' (keep)'}</li>)}</ul></details>
  <div className="guided-actions"><Button variant="primary" disabled={busy||!!missing.length} onClick={()=>onSave({choice:version?'update':'create',columns:proposal.proposed.map(({name,type,keep})=>({name,type,keep:keep!==false})),rename})}>Save rule v{(version||0)+1}</Button><Button disabled={busy} onClick={onReview}>Review on the page</Button></div>
 </article>;
}
