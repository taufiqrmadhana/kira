import {useId, useState} from 'react';
import {Check, ChevronDown} from 'lucide-react';
import {Button} from '../../components';
import {count} from '../../lib/format';
import {areaNames, type Area, type Column, type UploadRule} from './types';

const decisions:Record<string,string>={created:'Created',updated:'Updated',kept:'Kept',same:'Reused'};
const typeNames:Record<Column['type'],string>={text:'Text',number:'Number',date:'Date',datetime:'Date and time',bool:'Yes / no'};
const delimiters:Record<string,string>={',':'Comma (,)',';':'Semicolon (;)','\t':'Tab','|':'Pipe (|)'};

export default function SavedUploadRule({area,rule,decision,rows}:{area:Area;rule:UploadRule;decision?:string;rows:number}) {
  const [open,setOpen]=useState(false);
  const id=useId();
  const title=`${areaNames[area]} · ${decisions[decision || ''] || 'Saved'} rule v${rule.version}`;
  const kept=rule.columns.filter(column=>column.keep!==false).length;
  const mappings=Object.entries(rule.rename);
  return <article className="wf-saved-upload" aria-labelledby={`${id}-title`}>
    <header>
      <span className="wf-saved-upload-mark" aria-hidden="true"><Check size={17}/></span>
      <div className="wf-saved-upload-summary">
        <h3 id={`${id}-title`}>{title}</h3>
        <p><span>{count(rule.columns.length)} columns</span><span>{count(kept)} kept</span>{rule.delimiter && <span>{delimiters[rule.delimiter] || rule.delimiter}</span>}<span>{count(rows)} parsed rows</span></p>
      </div>
      <Button variant="quiet" aria-label={`${open?'Hide':'View'} ${areaNames[area]} upload rule`} aria-expanded={open} aria-controls={`${id}-details`} onClick={()=>setOpen(value=>!value)}>{open?'Hide rule':'View rule'}<ChevronDown size={15} className={open?'is-open':''}/></Button>
    </header>
    {open && <div id={`${id}-details`} className="wf-saved-upload-details">
      <div className="table-scroll"><table><caption className="sr-only">Saved {areaNames[area]} upload rule columns</caption><thead><tr><th scope="col">Column</th><th scope="col">Data type</th><th scope="col">Kept in table</th></tr></thead><tbody>{rule.columns.map(column=><tr key={column.name}><td>{column.name}</td><td>{typeNames[column.type] || column.type}</td><td>{column.keep!==false?'Kept':'Not kept'}</td></tr>)}</tbody></table></div>
      <div className="wf-saved-upload-mappings"><h4>Saved header mappings</h4>{mappings.length?<ul>{mappings.map(([source,target])=><li key={source}>{source} → {target || 'Do not fill'}</li>)}</ul>:<p>No header mappings in this rule.</p>}</div>
    </div>}
  </article>;
}
