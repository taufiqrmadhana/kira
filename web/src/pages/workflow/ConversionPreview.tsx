import {Check, FileText, Landmark, Store, WalletCards} from 'lucide-react';
import {StatusChip} from '../../components';
import {count} from '../../lib/format';
import {AnimatedCount, FlowConnector} from './WorkflowMotion';
import {areaNames, type Area, type Proposal, type RawFile, type Table} from './types';

const titles:Record<Area,string>={pos:'POS sales',settlement:'Payment provider settlements',bank:'Bank mutation'};
export const areaIcons={pos:Store,settlement:WalletCards,bank:Landmark};
const valueText=(value:unknown)=>value === null || value === undefined || value === '' ? '—' : typeof value === 'number' ? new Intl.NumberFormat('id-ID',{maximumFractionDigits:6}).format(value) : String(value);

export default function ConversionPreview({area,files,fileCount,proposal,table,current,scanning,reveal}:{area:Area;files:RawFile[];fileCount:number;proposal?:Proposal;table:Table;current:boolean;scanning:boolean;reveal:boolean}) {
  const Icon=areaIcons[area];
  const derived=new Set(Object.values(proposal?.rename || {}).map(mapping=>mapping.to));
  const samples=current && proposal ? Object.entries(proposal.samples).filter(([name])=>!derived.has(name)).slice(0,4) : [];
  const columns=table.columns.slice(0,4);
  const parsed=current && table.rows.length > 0;
  return <article className={`wf-convert-lane${scanning?' is-scanning':''}`} aria-label={`${areaNames[area]} conversion`}>
    <div className="wf-convert-area"><span className="wf-convert-icon"><Icon size={19}/></span><div><h3>{titles[area]}</h3><p>{scanning?'Reading files and checking columns…':current && proposal?`${count(proposal.rows)} source rows`: `${count(fileCount)} ${fileCount===1?'file':'files'} waiting`}</p></div></div>
    <div className="wf-convert-source" aria-busy={scanning}>
      <h4>Raw files</h4>
      {samples.length && !scanning ? <><p className="wf-convert-caption">Source column samples</p><dl>{samples.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{valueText(value)}</dd></div>)}</dl></> : <>
        <ul>{files.slice(0,3).map(file=><li key={file.id}><FileText size={12}/><span>{file.name}{file.sheet?` (${file.sheet})`:''}</span></li>)}</ul>
        {files.length>3 && <p className="wf-convert-caption">{count(files.length-3)} more uploaded files</p>}
        {!files.length && <p className="wf-convert-caption">{fileCount ? `${count(fileCount)} uploaded files` : 'No files in this area'}</p>}
        <p className="wf-convert-caption">{scanning?'Inspecting the uploaded files…':'Column samples appear after conversion.'}</p>
      </>}
      {scanning && <span className="wf-convert-scanline" aria-hidden="true"/>}
    </div>
    <span className="wf-convert-arrow" aria-hidden="true"><FlowConnector active={scanning}/></span>
    <div className="wf-convert-output" aria-busy={scanning}>
      <h4>{parsed && !scanning?'Converted table':current && !scanning?'Detected columns':'Converted table'}</h4>
      {scanning ? <div className="wf-convert-skeleton" aria-label={`Preparing ${areaNames[area]} preview`}><span/><span/><span/><span/></div> : parsed ? <>
        <div className="wf-convert-preview-scroll"><table><caption className="sr-only">Converted {areaNames[area]} rows</caption><thead><tr>{columns.map(column=><th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{table.rows.slice(0,4).map((row,index)=><tr className={reveal?'wf-convert-reveal':''} style={{animationDelay:`${index*60}ms`}} key={index}>{columns.map(column=><td key={column.name}>{valueText(row[column.name])}</td>)}</tr>)}</tbody></table></div>
        <p className="wf-convert-caption"><AnimatedCount value={table.total} enabled={reveal}/> parsed rows; showing up to 4</p>
      </> : current && proposal ? <>
        <div className="wf-convert-preview-scroll"><table><caption className="sr-only">Detected column samples for {areaNames[area]}</caption><thead><tr><th>Column</th><th>Sample value</th></tr></thead><tbody>{proposal.proposed.slice(0,4).map((column,index)=><tr className={reveal?'wf-convert-reveal':''} style={{animationDelay:`${index*60}ms`}} key={column.name}><td>{column.name}</td><td>{valueText(proposal.samples[column.name])}</td></tr>)}</tbody></table></div>
        <p className="wf-convert-caption">Column samples, not a transaction row. Review the upload rule to build the table.</p>
      </> : <p className="wf-convert-placeholder">{current?'No rows in this table.':'Converted rows will appear here.'}</p>}
    </div>
    <div className={`wf-convert-state${reveal&&current?' is-complete':''}`}>{scanning?<><progress aria-label={`Converting ${areaNames[area]}`}/><span>Scanning…</span></>:current?<><Check size={17} aria-hidden="true"/><span>{parsed?'Converted':'Review rule'}</span></>:<StatusChip tone="neutral">Waiting</StatusChip>}</div>
  </article>;
}
