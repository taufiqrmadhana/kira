import {useRovingFocus} from '../../components/useRovingFocus';
import {useState} from 'react';
import {ArrowLeft, ArrowRight, Check, RefreshCw} from 'lucide-react';
import {Button, StatusChip} from '../../components';
import {api} from '../../lib/api';
import {count} from '../../lib/format';
import ConversionPreview, {areaIcons} from './ConversionPreview';
import SavedUploadRule from './SavedUploadRule';
import './workflow-convert.css';
import {areas, areaNames, requiredColumns, type Area, type Column, type Proposal, type RunAction, type WorkflowData} from './types';

const typeNames: Record<Column['type'], string> = {text: 'Text', number: 'Number', date: 'Date', datetime: 'Date and time', bool: 'Yes / no'};
const delimiters: Record<string, string> = {',': 'Comma (,)', ';': 'Semicolon (;)', '\t': 'Tab', '|': 'Pipe (|)'};

function RuleCard({area, proposal, currentVersion, busy, run}: {area: Area; proposal: Proposal; currentVersion?: number; busy: string; run: RunAction}) {
  const [columns, setColumns] = useState<Column[]>(proposal.proposed.map(column => ({...column})));
  const [rename, setRename] = useState<Record<string, string>>(Object.fromEntries(Object.entries(proposal.rename).map(([name, mapping]) => [name, mapping.to])));
  const derived = new Set(Object.values(proposal.rename).map(mapping => mapping.to).filter(Boolean));
  const headers = proposal.proposed.map(column => column.name).filter(name => !derived.has(name));
  const setSource = (target: string, source: string, previous?: string) => {
    const mappings = {...rename};
    if (previous && previous !== source) mappings[previous] = '';
    if (source) mappings[source] = target;
    setRename(mappings);
    if (source) setColumns(previous => previous.map(column => column.name === source ? {...column, keep: true} : column));
  };
  const decide = (choice: 'create' | 'update' | 'keep') => run('Saving upload rule', async () => {
    const body = choice === 'keep' ? {choice} : {choice, columns: columns.map(({name, type, keep}) => ({name, type, keep: keep !== false})), rename};
    await api(`/upload-rules/${area}`, {method: 'POST', body: JSON.stringify(body)});
    return `${areaNames[area]} upload rule ${choice === 'create' ? 'created' : choice === 'update' ? 'updated' : 'kept'}.`;
  });
  const columnFocus=useRovingFocus(['__all__',...columns.map(column=>column.name)],{disabled:busy?['__all__',...columns.map(column=>column.name)]:[]});
  const selected = columns.filter(column => column.keep !== false).length;
  const Icon = areaIcons[area];
  const aiColumns = columns.filter(column => column.by === 'ai').length;
  return <article className="wf-decision wf-convert-rule" aria-labelledby={`rule-${area}`}>
    <div className="wf-section-head"><span className="wf-convert-icon"><Icon size={18}/></span><div><h3 id={`rule-${area}`}>{currentVersion ? `Update the ${areaNames[area]} upload rule?` : `Create an upload rule for ${areaNames[area]}?`}</h3><p>{currentVersion ? `The files differ from version ${currentVersion}. Update the format or keep using the saved rule.` : 'Review which columns to keep and how to read them. This rule will be reused for later files.'}</p></div><StatusChip tone="amber">Decision needed</StatusChip></div>
    {proposal.diff && <ul className="wf-diff">{proposal.diff.added.length > 0 && <li>New columns: {proposal.diff.added.join(', ')}</li>}{proposal.diff.missing.length > 0 && <li>Missing columns: {proposal.diff.missing.join(', ')}</li>}{proposal.diff.types.map(change => <li key={change.name}>{change.name}: {typeNames[change.from as Column['type']] || change.from} to {typeNames[change.to as Column['type']] || change.to}</li>)}{proposal.diff.delimiter && <li>The delimiter has changed.</li>}{Object.keys(proposal.diff.rename).length > 0 && <li>Header mappings have changed.</li>}</ul>}
    <p className="wf-rule-summary"><span>Delimiter <strong>{delimiters[proposal.delimiter] || proposal.delimiter}</strong></span><span>{count(columns.length)} headers found</span><span>{count(selected)} kept</span>{aiColumns > 0 && <span>{count(aiColumns)} columns reviewed by AI</span>}</p>
    <fieldset disabled={!!busy} className="wf-rule-fields"><legend>Required columns for {areaNames[area]}</legend>
      <p className="wf-convert-required-note">Each required column is in the file or filled from another source column. Your original columns stay available below.</p><div className="wf-convert-required-scroll"><table className="wf-convert-required-table"><thead><tr><th>Column</th><th>Where it comes from</th></tr></thead><tbody>{requiredColumns[area].map(target => {
        const sources = Object.keys(rename).filter(name => rename[name] === target);
        const native = !derived.has(target) && Object.hasOwn(proposal.samples, target);
        return <tr key={target}><td><strong>{target}</strong><span className="wf-convert-needed">Required</span></td><td><div className="wf-required">{native && <span className="wf-native"><Check size={14}/>In the file</span>}{(!native || sources.length > 0) && (sources.length ? sources : ['']).map((source, index) => {
          const info = source ? proposal.rename[source] : undefined;
          return <label key={`${target}-${index}`}><span className="sr-only">Source for {areaNames[area]} {target}{index ? ` ${index + 1}` : ''}</span><select aria-label={`Source for ${areaNames[area]} ${target}${index ? ` ${index + 1}` : ''}`} value={source} onChange={event => setSource(target, event.target.value, source)}><option value="">Not found / do not fill</option>{headers.map(name => <option key={name} value={name}>Fill from {name}</option>)}</select>{info?.why && <small>{info.by === 'ai' ? 'AI suggestion: ' : ''}{info.why}</small>}</label>;
        })}{sources.length > 0 && <label><span className="sr-only">Additional source for {areaNames[area]} {target}</span><select aria-label={`Additional source for ${areaNames[area]} ${target}`} value="" onChange={event => {if (event.target.value) setSource(target, event.target.value);}}><option value="">Add another source</option>{headers.filter(name => !sources.includes(name)).map(name => <option key={name} value={name}>{name}</option>)}</select></label>}</div></td></tr>;
      })}</tbody></table></div>
      <div className="table-scroll wf-column-table"><table><caption className="sr-only">Columns in the {areaNames[area]} upload rule</caption><thead><tr><th><label className="inline"><input type="checkbox" {...columnFocus('__all__')} aria-label={`Keep all ${areaNames[area]} columns`} checked={selected === columns.length} ref={input => {columnFocus('__all__').ref(input);if (input) input.indeterminate = selected > 0 && selected < columns.length;}} onChange={event => setColumns(columns.map(column => ({...column, keep: event.target.checked})))}/>Keep</label></th><th scope="col">Column</th><th scope="col">Data type</th><th scope="col">Sample value</th></tr></thead><tbody>{columns.map((column, index) => <tr key={column.name}><td><input type="checkbox" {...columnFocus(column.name)} aria-label={`Keep ${areaNames[area]} ${column.name}`} checked={column.keep !== false} onChange={event => setColumns(columns.map((value, i) => i === index ? {...value, keep: event.target.checked} : value))}/></td><td><strong>{column.name}</strong>{requiredColumns[area].includes(column.name) && <small>Required</small>}{column.by === 'ai' && column.why && <small className="wf-ai-reason">AI suggestion: {column.why}</small>}</td><td><select aria-label={`Type of ${areaNames[area]} ${column.name}`} value={column.type} onChange={event => setColumns(columns.map((value, i) => i === index ? {...value, type: event.target.value as Column['type']} : value))}>{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="wf-sample">{proposal.samples[column.name] || '—'}</td></tr>)}</tbody></table></div>
    </fieldset>
    <div className="wf-actions"><Button variant="primary" disabled={!!busy || selected === 0} onClick={() => void decide(currentVersion ? 'update' : 'create')}>{currentVersion ? 'Update rule' : 'Create rule'}</Button>{currentVersion && <Button disabled={!!busy} onClick={() => void decide('keep')}>Keep saved rule</Button>}</div>
  </article>;
}

export default function Step2({data,busy,run,onBack,onNext}:{data:WorkflowData;busy:string;run:RunAction;onBack:()=>void;onNext:()=>void}) {
  const [requestState,setRequestState]=useState<'idle'|'pending'|'complete'|'failed'>('idle');
  const conversion=data.conversion;
  const current=!!conversion?.at && !conversion.stale;
  const converting=busy==='Converting files' || requestState==='pending';
  const locked=!!busy || converting;
  const settled=current && data.status.upload_rules_pending.length===0;

  async function convert() {
    setRequestState('pending');
    try {
      const saved=await run('Converting files',async()=>{
        await api('/convert',{method:'POST'});
        return 'Files converted. Review any open upload rules.';
      });
      setRequestState(saved?'complete':'failed');
    } catch {
      setRequestState('failed');
    }
  }

  return <section className="wf-step-panel wf-convert-panel" aria-labelledby="wf-convert-title">
    <div className="wf-section-head wf-convert-head"><div><h2 id="wf-convert-title">Convert raw files into tables</h2><p>KIRA reads each file, finds its headers and delimiter, checks data types, and removes exact duplicate rows. Review the upload rules before moving on to cleaning.</p></div><Button variant={current?'secondary':'primary'} disabled={locked} onClick={()=>void convert()}><RefreshCw size={16} className={converting?'wf-convert-spinning':''}/>{converting?'Converting…':current?'Convert again':'Convert files'}</Button></div>
    {conversion?.stale && <p className="wf-stale" role="status">Files changed. Convert again before deciding upload rules.</p>}
    {requestState==='failed' && <p className="wf-convert-error" role="alert">Conversion did not finish. Check the request error and try again.</p>}
    {converting && <p className="wf-convert-live" role="status">Reading the uploaded files and preparing their columns. This will finish when conversion and the table refresh complete.</p>}
    <div className="wf-convert-lanes">{areas.map(area=><ConversionPreview key={`${area}-${conversion?.at || 'waiting'}`} area={area} files={data.files.filter(file=>file.type===area)} fileCount={data.status.files[area]} proposal={conversion?.proposals[area]} table={data.tables.parsed[area]} current={current} scanning={converting} reveal={requestState==='complete'}/>)}</div>
    {current && !converting && <div className="wf-rules"><h2>Upload rules</h2>{areas.map(area=>{
      const proposal=conversion.proposals[area];
      const pending=data.status.upload_rules_pending.includes(area);
      const saved=data.upload_rules[area];
      return proposal && pending ? <RuleCard key={`${area}-${conversion.at}`} area={area} proposal={proposal} currentVersion={saved?.version} busy={busy} run={run}/> : saved ? <SavedUploadRule key={`${area}-${conversion.at}-${saved.version}-${conversion.decisions[area]}`} area={area} rule={saved} decision={conversion.decisions[area]} rows={data.tables.parsed[area].total}/> : <div className="wf-saved-rule" key={area}><strong>{areaNames[area]}</strong><span>No saved rule</span><StatusChip tone="neutral">Not available</StatusChip></div>;
    })}</div>}
    <footer className="wf-step-footer"><Button disabled={locked} onClick={onBack}><ArrowLeft size={16}/>Back</Button><p>{converting?'Converting the uploaded files…':settled?'Every upload rule is settled.':current?'Decide on each upload rule to continue.':'Press Convert files to start.'}</p><Button variant="primary" disabled={locked || !settled} onClick={onNext}>Next: Clean<ArrowRight size={16}/></Button></footer>
  </section>;
}
