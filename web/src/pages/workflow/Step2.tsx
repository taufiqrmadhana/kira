import {useRovingFocus} from '../../components/useRovingFocus';
import {useState} from 'react';
import {ArrowLeft, ArrowRight, Check, RefreshCw} from 'lucide-react';
import {Button, StatusChip} from '../../components';
import {api} from '../../lib/api';
import {count} from '../../lib/format';
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
  return <article className="wf-decision" aria-labelledby={`rule-${area}`}>
    <div className="wf-section-head"><div><h3 id={`rule-${area}`}>{currentVersion ? `Update the ${areaNames[area]} upload rule?` : `Create an upload rule for ${areaNames[area]}?`}</h3><p>{currentVersion ? `The files differ from version ${currentVersion}. Update the format or keep using the saved rule.` : 'Review which columns to keep and how to read them. This rule will be reused for later files.'}</p></div><StatusChip tone="amber">Decision needed</StatusChip></div>
    {proposal.diff && <ul className="wf-diff">{proposal.diff.added.length > 0 && <li>New columns: {proposal.diff.added.join(', ')}</li>}{proposal.diff.missing.length > 0 && <li>Missing columns: {proposal.diff.missing.join(', ')}</li>}{proposal.diff.types.map(change => <li key={change.name}>{change.name}: {typeNames[change.from as Column['type']] || change.from} to {typeNames[change.to as Column['type']] || change.to}</li>)}{proposal.diff.delimiter && <li>The delimiter has changed.</li>}{Object.keys(proposal.diff.rename).length > 0 && <li>Header mappings have changed.</li>}</ul>}
    <p className="wf-rule-summary">{delimiters[proposal.delimiter] || proposal.delimiter}. {count(columns.length)} columns found; {count(selected)} kept.</p>
    <fieldset disabled={!!busy} className="wf-rule-fields"><legend>Required columns for {areaNames[area]}</legend>
      <div className="wf-required-grid">{requiredColumns[area].map(target => {
        const sources = Object.keys(rename).filter(name => rename[name] === target);
        const native = !derived.has(target) && Object.hasOwn(proposal.samples, target);
        return <div className="wf-required" key={target}><strong>{target}</strong>{native && <span className="wf-native"><Check size={14}/>In the file</span>}{(!native || sources.length > 0) && (sources.length ? sources : ['']).map((source, index) => {
          const info = source ? proposal.rename[source] : undefined;
          return <label key={`${target}-${index}`}><span className="sr-only">Source for {areaNames[area]} {target}{index ? ` ${index + 1}` : ''}</span><select aria-label={`Source for ${areaNames[area]} ${target}${index ? ` ${index + 1}` : ''}`} value={source} onChange={event => setSource(target, event.target.value, source)}><option value="">Not found / do not fill</option>{headers.map(name => <option key={name} value={name}>Fill from {name}</option>)}</select>{info?.why && <small>{info.by === 'ai' ? 'AI suggestion: ' : ''}{info.why}</small>}</label>;
        })}{sources.length > 0 && <label><span className="sr-only">Additional source for {areaNames[area]} {target}</span><select aria-label={`Additional source for ${areaNames[area]} ${target}`} value="" onChange={event => {if (event.target.value) setSource(target, event.target.value);}}><option value="">Add another source</option>{headers.filter(name => !sources.includes(name)).map(name => <option key={name} value={name}>{name}</option>)}</select></label>}</div>;
      })}</div>
      <div className="table-scroll wf-column-table"><table><caption className="sr-only">Columns in the {areaNames[area]} upload rule</caption><thead><tr><th><label className="inline"><input type="checkbox" {...columnFocus('__all__')} aria-label={`Keep all ${areaNames[area]} columns`} checked={selected === columns.length} ref={input => {columnFocus('__all__').ref(input);if (input) input.indeterminate = selected > 0 && selected < columns.length;}} onChange={event => setColumns(columns.map(column => ({...column, keep: event.target.checked})))}/>Keep</label></th><th scope="col">Column</th><th scope="col">Data type</th><th scope="col">Sample value</th></tr></thead><tbody>{columns.map((column, index) => <tr key={column.name}><td><input type="checkbox" {...columnFocus(column.name)} aria-label={`Keep ${areaNames[area]} ${column.name}`} checked={column.keep !== false} onChange={event => setColumns(columns.map((value, i) => i === index ? {...value, keep: event.target.checked} : value))}/></td><td><strong>{column.name}</strong>{requiredColumns[area].includes(column.name) && <small>Required</small>}{column.by === 'ai' && column.why && <small className="wf-ai-reason">AI suggestion: {column.why}</small>}</td><td><select aria-label={`Type of ${areaNames[area]} ${column.name}`} value={column.type} onChange={event => setColumns(columns.map((value, i) => i === index ? {...value, type: event.target.value as Column['type']} : value))}>{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="wf-sample">{proposal.samples[column.name] || '—'}</td></tr>)}</tbody></table></div>
    </fieldset>
    <div className="wf-actions"><Button variant="primary" disabled={!!busy || selected === 0} onClick={() => void decide(currentVersion ? 'update' : 'create')}>{currentVersion ? 'Update rule' : 'Create rule'}</Button>{currentVersion && <Button disabled={!!busy} onClick={() => void decide('keep')}>Keep saved rule</Button>}</div>
  </article>;
}

export default function Step2({data, busy, run, onBack, onNext}: {data: WorkflowData; busy: string; run: RunAction; onBack: () => void; onNext: () => void}) {
  const conversion = data.conversion;
  const current = !!conversion?.at && !conversion.stale;
  const converting = busy === 'Converting files';
  const settled = current && data.status.upload_rules_pending.length === 0;
  return <section className="wf-step-panel" aria-labelledby="wf-convert-title">
    <div className="wf-section-head"><div><h2 id="wf-convert-title">Convert files into tables</h2><p>Review the detected columns and types. The original files stay unchanged.</p></div><Button variant={current ? 'secondary' : 'primary'} disabled={!!busy} onClick={() => void run('Converting files', async () => {await api('/convert', {method: 'POST'}); return 'Files converted. Review any open upload rules.';})}><RefreshCw size={16}/>{converting ? 'Converting…' : current ? 'Convert again' : 'Convert files'}</Button></div>
    {conversion?.stale && <p className="wf-stale" role="status">Files changed. Convert again before deciding upload rules.</p>}
    <div className="wf-conversion-list">{areas.map(area => {
      const proposal = conversion?.proposals[area]; const table = data.tables.parsed[area];
      return <article className="wf-conversion-row" key={area}><div><h3>{areaNames[area]}</h3><p>{count(data.status.files[area])} files{current && proposal ? `; ${count(proposal.rows)} source rows` : ''}</p></div><div className="wf-conversion-example wf-source-example"><span>Source example</span><p>{current && proposal ? Object.entries(proposal.samples).slice(0, 3).map(([name, value]) => `${name}: ${value}`).join(' / ') : 'Waiting for conversion'}</p></div><ArrowRight size={20} aria-hidden="true"/><div className="wf-conversion-example"><span>Parsed table</span><p>{table.total ? `${count(table.total)} rows; ${count(table.columns.length)} columns` : current ? 'Create the upload rule below' : 'No table yet'}</p></div><div className="wf-conversion-status">{converting ? <><progress aria-label={`Converting ${areaNames[area]}`}/><small>Reading files…</small></> : current ? <StatusChip>Profile ready</StatusChip> : <StatusChip tone="neutral">Waiting</StatusChip>}</div></article>;
    })}</div>
    {current && <div className="wf-rules"><h2>Upload rules</h2>{areas.map(area => {
      const proposal = conversion.proposals[area]; const pending = data.status.upload_rules_pending.includes(area);
      return proposal && pending ? <RuleCard key={`${area}-${conversion.at}`} area={area} proposal={proposal} currentVersion={data.upload_rules[area]?.version} busy={busy} run={run}/> : <div className="wf-saved-rule" key={area}><strong>{areaNames[area]}</strong><span>Saved rule v{data.upload_rules[area]?.version || 1}</span><StatusChip>{conversion.decisions[area] === 'same' ? 'Reused' : 'Ready'}</StatusChip></div>;
    })}</div>}
    <footer className="wf-step-footer"><Button disabled={!!busy} onClick={onBack}><ArrowLeft size={16}/>Back</Button><p>{settled ? 'Every upload rule is settled.' : current ? 'Decide on each upload rule to continue.' : 'Convert the current files to continue.'}</p><Button variant="primary" disabled={!!busy || !settled} onClick={onNext}>Next: Clean<ArrowRight size={16}/></Button></footer>
  </section>;
}
