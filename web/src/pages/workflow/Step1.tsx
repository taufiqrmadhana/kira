import {useEffect, useRef, useState, type DragEvent} from 'react';
import {ArrowRight, Download, FolderOpen, Trash2, Upload} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {Button, DataTable, Empty, ErrorState, Loading, StatusChip} from '../../components';
import {api, identity} from '../../lib/api';
import {count, date} from '../../lib/format';
import {areas, areaNames, errorMessage, type Area, type RawFile, type RunAction, type WorkflowData} from './types';

type FileInput = {file: File; folder: string};
type Entry = {isFile: boolean; isDirectory: boolean; name: string; file: (success: (file: File) => void, fail: (error: Error) => void) => void; createReader: () => {readEntries: (success: (entries: Entry[]) => void, fail: (error: Error) => void) => void}};
type Audit = {at: string; actor: string; action: string; object: string; detail: string};
type Uploaded = {name: string; status: string; ids: number[]};

async function walk(entry: Entry, folder = ''): Promise<FileInput[]> {
  if (entry.isFile) return [{file: await new Promise<File>((resolve, reject) => entry.file(resolve, reject)), folder}];
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const files: FileInput[] = [];
  while (true) {
    const entries = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!entries.length) break;
    for (const child of entries) files.push(...await walk(child, folder ? `${folder}/${entry.name}` : entry.name));
  }
  return files;
}
function selectedFiles(files: FileList): FileInput[] {return Array.from(files, file => ({file, folder: file.webkitRelativePath.split('/').slice(0, -1).join('/')}));}
async function download(file: RawFile) {
  const response = await fetch(`/api/files/${file.id}/download`, {headers: {'X-Kira-User': identity.user(), 'X-Kira-Client': identity.client()}, credentials: 'include'});
  if (!response.ok) {if (response.status === 401) location.assign('/login?next='+encodeURIComponent(location.pathname+location.search)); const body = await response.json().catch(() => ({})); throw new Error(body.detail || 'The file could not be downloaded.');}
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UploadArea({area, files, busy, run}: {area: Area; files: RawFile[]; busy: string; run: RunAction}) {
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [moveTo, setMoveTo] = useState<Record<number, Area>>({});
  const descriptions = {pos: 'Sales exports from your cashier system.', settlement: 'Reports from your payment providers.', bank: 'Bank statements for the receiving account.'};
  const upload = (pending: Promise<FileInput[]> | FileInput[]) => run(`Uploading ${areaNames[area]}`, async () => {
    const items = await pending;
    if (!items.length) throw new Error('Choose at least one file to upload.');
    if (items.some(item => item.file.size > 10 * 1024 * 1024)) throw new Error('Each file must be 10 MB or smaller.');
    const groups = new Map<string, File[]>();
    for (const {file, folder} of items) groups.set(folder, [...(groups.get(folder) || []), file]);
    const results: Uploaded[] = [];
    for (const [folder, group] of groups) {
      const body = new FormData(); body.set('folder', folder);
      for (const file of group) body.append('uploads', file);
      results.push(...await api<Uploaded[]>(`/files/${area}`, {method: 'POST', body}));
    }
    const added = results.filter(item => item.status === 'added').length;
    const duplicate = results.filter(item => item.status === 'duplicate').length;
    return `${count(added)} files added${duplicate ? `; ${count(duplicate)} duplicates skipped` : ''}.`;
  });
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); if (busy) return;
    const entries = Array.from(event.dataTransfer.items).filter(item => item.kind === 'file').map(item => (item as unknown as {webkitGetAsEntry?: () => Entry | null}).webkitGetAsEntry?.()).filter((item): item is Entry => !!item);
    const pending = entries.length ? Promise.all(entries.map(entry => walk(entry))).then(groups => groups.flat()) : selectedFiles(event.dataTransfer.files);
    void upload(pending);
  };
  return <section className="wf-upload-area" aria-labelledby={`upload-${area}`}>
    <header><div><h3 id={`upload-${area}`}>{areaNames[area]}</h3><p>{descriptions[area]}</p></div><StatusChip tone={files.length ? 'green' : 'neutral'}>{count(files.length)} files</StatusChip></header>
    <div className={`wf-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => {event.preventDefault(); if (!busy) setDragging(true);}} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);}} onDrop={drop}>
      <Upload size={24} aria-hidden="true"/><strong>Drop files or a folder</strong><p>CSV, TXT, Excel or text PDF. Up to 10 MB each.</p>
      <div className="wf-actions"><Button disabled={!!busy} onClick={() => picker.current?.click()}>Choose files<span className="sr-only"> for {areaNames[area]}</span></Button><Button disabled={!!busy} onClick={() => folderPicker.current?.click()}>Choose folder<span className="sr-only"> for {areaNames[area]}</span></Button></div>
      <input ref={picker} type="file" hidden multiple accept=".csv,.txt,.xlsx,.xlsm,.pdf" onChange={event => {if (event.target.files) void upload(selectedFiles(event.target.files)); event.target.value = '';}}/>
      <input ref={folderPicker} type="file" hidden multiple {...{webkitdirectory: ''}} onChange={event => {if (event.target.files) void upload(selectedFiles(event.target.files)); event.target.value = '';}}/>
    </div>
    {!files.length ? <p className="wf-empty-area">No files yet. Choose files or drop them here.</p> : <ul className="wf-file-list">{files.map(file => <li key={file.id}>
      {file.folder && <span className="wf-folder"><FolderOpen size={14}/>{file.folder}</span>}
      <div className="wf-file-heading"><strong>{file.name}</strong><Button variant="quiet" disabled={!!busy} aria-label={`Download ${file.name}`} onClick={() => void run('Downloading file', () => download(file))}><Download size={16}/></Button><Button variant="danger" disabled={!!busy} aria-label={`Remove ${file.name}`} onClick={() => void run('Removing file', async () => {await api(`/files/${file.id}`, {method: 'DELETE'}); return `${file.name} removed.`;})}><Trash2 size={16}/></Button></div>
      <p>{file.sheet ? `${file.sheet}. ` : ''}{count(file.rows)} rows; {count(Math.ceil(file.size / 1024))} KB.</p>
      <small>Added {date(file.uploaded_at)} by {file.uploaded_by}</small>
      {file.wrong_area && <p className="wf-wrong-area">Looks like {areaNames[file.looks_like!]}. Move it to the correct area.</p>}
      <div className="wf-move"><label><span className="sr-only">Move {file.name} to</span><select aria-label={`Move ${file.name} to`} disabled={!!busy} value={moveTo[file.id] || file.looks_like || area} onChange={event => setMoveTo({...moveTo, [file.id]: event.target.value as Area})}>{areas.map(target => <option key={target} value={target}>{areaNames[target]}</option>)}</select></label><Button disabled={!!busy || (moveTo[file.id] || file.looks_like || area) === area} onClick={() => void run('Moving file', async () => {await api(`/files/${file.id}/move`, {method: 'POST', body: JSON.stringify({to: moveTo[file.id] || file.looks_like || area})}); return `${file.name} moved.`;})}>Move</Button></div>
    </li>)}</ul>}
  </section>;
}

export default function Step1({data, busy, run, revision, onNext}: {data: WorkflowData; busy: string; run: RunAction; revision: number; onNext: () => void}) {
  const [history, setHistory] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sampleDay, setSampleDay] = useState('1');
  useEffect(() => {const controller = new AbortController(); setLoading(true); api<Audit[]>('/audit?limit=100', {signal: controller.signal}).then(rows => {setHistory(rows.filter(row => /file/i.test(row.action))); setError('');}).catch(err => {if (!controller.signal.aborted) setError(errorMessage(err));}).finally(() => {if (!controller.signal.aborted) setLoading(false);}); return () => controller.abort();}, [revision, retry]);
  const columns: ColumnDef<Audit, unknown>[] = [{accessorKey: 'at', header: 'When', cell: ({row}) => date(row.original.at)}, {accessorKey: 'actor', header: 'Who'}, {accessorKey: 'action', header: 'Action'}, {accessorKey: 'object', header: 'File'}, {accessorKey: 'detail', header: 'Details'}];
  const ready = areas.every(area => data.status.files[area] > 0);
  return <section className="wf-step-panel" aria-labelledby="wf-upload-title">
    <div className="wf-section-head"><div><h2 id="wf-upload-title">Upload your source files</h2><p>Every file in an area is included when you convert. Folder paths are kept.</p></div><div className="wf-actions"><label><span className="sr-only">Sample day</span><select aria-label="Sample day" value={sampleDay} onChange={event => setSampleDay(event.target.value)} disabled={!!busy}><option value="1">Sample day 1</option><option value="2">Sample day 2</option></select></label><Button disabled={!!busy} onClick={() => void run('Adding sample files', async () => {const result = await api<Uploaded[]>(`/files/samples/${sampleDay}`, {method: 'POST'}); return `${count(result.filter(item => item.status === 'added').length)} sample files added.`;})}>Use sample files</Button></div></div>
    {busy && <p role="status" className="wf-working">{busy}…</p>}
    <div className="wf-upload-grid">{areas.map(area => <UploadArea key={area} area={area} files={data.files.filter(file => file.type === area)} busy={busy} run={run}/>)}</div>
    <details className="wf-history"><summary>Upload history <span>{count(history.length)} events</span></summary>{loading ? <Loading/> : error ? <ErrorState message={error} retry={() => setRetry(value => value + 1)}/> : history.length ? <DataTable data={history} columns={columns} caption="Upload history"/> : <Empty title="No upload history">File additions, moves and removals will appear here.</Empty>}</details>
    <footer className="wf-step-footer"><p>{ready ? 'All three areas have files.' : 'Add at least one file to each area to continue.'}</p><Button variant="primary" disabled={!ready || !!busy} onClick={onNext}>Next: Convert<ArrowRight size={16}/></Button></footer>
  </section>;
}
