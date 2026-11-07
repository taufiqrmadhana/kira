import {useRovingFocus} from '../../components/useRovingFocus';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button, DataTable, StatusChip } from '../../components';
import { api, query } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { count, date, money, plural } from '../../lib/format';
import './rate-table-v2.css';
import type { DraftResponse, FollowRecord, FollowResponse, FollowUp } from './types';
const emptyFollow: FollowUp = { status: 'open', assignee: '', note: '' };
const editable = (value: FollowUp): FollowUp => ({ status: value.status, note: value.note, assignee: value.assignee });
interface EditorState {
    valueFor: (record: FollowRecord) => FollowUp;
    edit: (record: FollowRecord, patch: Partial<FollowUp>) => void;
    draft: (rid?: string) => Promise<void>;
    saveOne: (rid: string) => Promise<void>;
    busy: string;
    changes: Record<string, FollowUp>;
    draftIds: Record<string, boolean>;
}
const EditorContext = createContext<EditorState | null>(null);
function FollowCell({ record, field }: {
    record: FollowRecord;
    field: string;
}) {
    const editor = useContext(EditorContext)!;
    const value = editor.valueFor(record);
    if (field === 'evidence')
        return <div className="follow-evidence"><strong>{record.key}</strong><span>{record.outlet}</span><small>{date(record.day)}</small><StatusChip tone="amber">{record.reason}</StatusChip><strong>{money(record.amount)}</strong></div>;
    if (field === 'status')
        return <select aria-label={`Status for ${record.key}`} value={value.status} disabled={!!editor.busy} onChange={event => editor.edit(record, { status: event.target.value })}>{['open', 'investigating', 'resolved'].map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>;
    if (field === 'assignee')
        return <input aria-label={`Assignee for ${record.key}`} maxLength={100} placeholder="Unassigned" value={value.assignee} disabled={!!editor.busy} onChange={event => editor.edit(record, { assignee: event.target.value })}/>;
    if (field === 'note')
        return <div className={editor.draftIds[record.rid] ? 'draft-field' : 'note-field'}>{editor.draftIds[record.rid] && <small>Kira’s draft: check it, then Save</small>}<textarea rows={1} maxLength={10000} aria-label={`Note for ${record.key}`} value={value.note} disabled={!!editor.busy} onChange={event => editor.edit(record, { note: event.target.value })}/>{value.by && <small>Saved by {value.by}{value.at ? ` on ${date(value.at)}` : ''}</small>}</div>;
    return <div className="row-actions"><Button disabled={!!editor.busy} onClick={() => editor.draft(record.rid)}>Draft</Button><Button variant="primary" disabled={!!editor.busy || !editor.changes[record.rid]} onClick={() => editor.saveOne(record.rid)}>Save</Button></div>;
}
const columns: ColumnDef<FollowRecord, unknown>[] = [['evidence', 'Record and evidence'], ['status', 'Follow-up status'], ['assignee', 'Assignee'], ['note', 'Note'], ['actions', 'Actions']].map(([id, header]) => ({ id, header, enableSorting: false, cell: ({ row }) => <FollowCell record={row.original} field={id}/> }));
export default function FollowUps({ scope, onDirtyChange }: {
    scope: string;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const [offset, setOffset] = useState(0), [limit, setLimit] = useState(20), [follow, setFollow] = useState(''), [search, setSearch] = useState('');
    const [language, setLanguage] = useState('en'), [onlyEmpty, setOnlyEmpty] = useState(true);
    const [changes, setChanges] = useState<Record<string, FollowUp>>({}), [draftIds, setDraftIds] = useState<Record<string, boolean>>({}), [saved, setSaved] = useState<Record<string, FollowUp>>({});
    const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const listQuery = [scope, query({ offset, limit, follow, search })].filter(Boolean).join('&');
    const records = useResource<FollowResponse>('/analysis/follow-ups?' + listQuery);
    const pending = Object.keys(changes).length;
    useEffect(() => { onDirtyChange?.(pending > 0); return () => onDirtyChange?.(false); }, [pending, onDirtyChange]);
    useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (pending) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [pending]);
    const valueFor = (record: FollowRecord): FollowUp => changes[record.rid] || saved[record.rid] || record.follow_up || record.follow || records.data?.follow_ups?.[record.rid] || emptyFollow;
    const edit = (record: FollowRecord, patch: Partial<FollowUp>) => setChanges(previous => ({ ...previous, [record.rid]: { ...editable(valueFor(record)), ...patch } }));
    async function draft(rid?: string) {
        setBusy(rid || 'draft');
        setError('');
        setNotice('');
        try {
            let rids = rid ? [rid] : undefined;
            // The draft endpoint's implicit scope doesn't include list search/status. Resolve
            // those filters across every server page before requesting the draft.
            if (!rid && (follow || search)) {
                rids = [];
                let page = 0;
                while (true) {
                    const response = await api<FollowResponse>('/analysis/follow-ups?' + [scope, query({ follow, search, offset: page, limit: 200 })].filter(Boolean).join('&'));
                    rids.push(...response.records.map(record => record.rid));
                    page += response.records.length;
                    if (page >= response.total)
                        break;
                    if (!response.records.length)
                        throw new Error('The follow-up list changed. Refresh it and try drafting again.');
                }
                if (!rids.length) {
                    setNotice('No records in this list need a draft.');
                    return;
                }
            }
            const result = await api<DraftResponse>('/analysis/follow-ups/draft' + (scope ? '?' + scope : ''), { method: 'POST', body: JSON.stringify({ ...(rids ? { rids } : {}), only_empty: onlyEmpty, lang: language }) });
            const fresh = result.drafts.filter(item => !changes[item.rid]);
            setChanges(previous => ({ ...Object.fromEntries(fresh.map(item => [item.rid, { status: item.status, note: item.note, assignee: item.assignee || '' }])), ...previous }));
            setDraftIds(previous => ({ ...previous, ...Object.fromEntries(fresh.map(item => [item.rid, true])) }));
            const protectedCount = result.drafts.length - fresh.length;
            setNotice(`${count(fresh.length)} notes drafted. Review them before saving.${result.skipped ? ` ${count(result.skipped)} existing notes skipped.` : ''}${protectedCount ? ` ${protectedCount} unsaved edits kept.` : ''}`);
        }
        catch (error) {
            setError((error as Error).message);
        }
        finally {
            setBusy('');
        }
    }
    function removeSaved(ids: string[]) { setChanges(previous => Object.fromEntries(Object.entries(previous).filter(([rid]) => !ids.includes(rid)))); setDraftIds(previous => Object.fromEntries(Object.entries(previous).filter(([rid]) => !ids.includes(rid)))); }
    async function saveOne(rid: string) { setBusy(rid); setError(''); try {
        const result = await api<FollowUp>('/analysis/follow-ups', { method: 'POST', body: JSON.stringify({ rid, ...changes[rid] }) });
        setSaved(previous => ({ ...previous, [rid]: result }));
        removeSaved([rid]);
        setNotice('Saved 1 note.');
    }
    catch (error) {
        setError((error as Error).message);
    }
    finally {
        setBusy('');
    } }
    async function saveAll() {
        setBusy('save');
        setError('');
        setNotice('');
        let completed = 0;
        try {
            const entries = Object.entries(changes);
            for (let start = 0; start < entries.length; start += 2000) {
                const batch = entries.slice(start, start + 2000);
                const result = await api<{
                    saved: number;
                    follow_ups: Record<string, FollowUp>;
                }>('/analysis/follow-ups/bulk', { method: 'POST', body: JSON.stringify({ items: batch.map(([rid, value]) => ({ rid, ...value })) }) });
                const acknowledged = batch.map(([rid]) => rid).filter(rid => Object.hasOwn(result.follow_ups, rid));
                setSaved(previous => ({ ...previous, ...result.follow_ups }));
                removeSaved(acknowledged);
                completed += acknowledged.length;
                if (acknowledged.length !== batch.length)
                    throw new Error(`The server confirmed ${acknowledged.length} of ${batch.length} notes. Unconfirmed notes are still here; retry saving them.`);
            }
            setNotice(`Saved ${completed} notes.`);
        }
        catch (error) {
            setError((error as Error).message);
            if (completed)
                setNotice(`Saved ${completed} notes before the error. The remaining notes are still unsaved.`);
        }
        finally {
            setBusy('');
        }
    }
    const statusFocus=useRovingFocus(['','open','investigating','resolved'],{initial:follow,disabled:busy?['','open','investigating','resolved']:[]});
    return <EditorContext.Provider value={{ valueFor, edit, draft, saveOne, busy, changes, draftIds }}><section className="follow-ups" data-tour="follow-ups" aria-busy={records.updating} data-ready={!records.loading && !!records.data && !records.error}><div className="table-toolbar"><div><h2>Follow-up</h2><span>{plural(records.data?.total||0,'record')}</span></div><div><label className="inline">Draft language<select aria-label="Draft language" value={language} onChange={event => setLanguage(event.target.value)} disabled={!!busy}><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></label><label className="inline"><input type="checkbox" checked={onlyEmpty} onChange={event => setOnlyEmpty(event.target.checked)} disabled={!!busy}/>Only empty notes</label><Button disabled={!!busy || !records.data?.total} onClick={() => draft()}>{busy === 'draft' ? 'Drafting…' : 'Draft notes for this list'}</Button></div></div>
    <p className="table-note">Drafts cover this filtered list across all pages. Nothing is saved until you choose Save.</p>
    <div className="follow-filters"><div className="status-filters" role="group" aria-label="Follow-up status">{['', 'open', 'investigating', 'resolved'].map(status => <button type="button" key={status} {...statusFocus(status)} aria-pressed={follow === status} disabled={!!busy} onClick={() => { setFollow(status); setOffset(0); }}>{status ? status[0].toUpperCase() + status.slice(1) : 'All'} <span>{count(status ? records.data?.counts[status] || 0 : Object.values(records.data?.counts || {}).reduce((a, b) => a + b, 0))}</span></button>)}</div><input type="search" aria-label="Search follow-ups" placeholder="Find a record or note…" value={search} disabled={!!busy} onChange={event => { setSearch(event.target.value); setOffset(0); }}/></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error-inline">{error}</p>}
    {pending > 0 && <div className="draft-bar" role="region" aria-label="Unsaved follow-up notes"><div><strong>{plural(pending,'unsaved note')}</strong><small>{count(Object.keys(draftIds).length)} drafted by Kira. Review all pages before saving.</small></div><Button disabled={!!busy} onClick={() => { setChanges({}); setDraftIds({}); setNotice('Drafts and unsaved edits discarded.'); }}>Discard drafts</Button><Button variant="primary" disabled={!!busy} onClick={saveAll}>{busy === 'save' ? 'Saving…' : `Save ${plural(pending,'note')}`}</Button></div>}
    <DataTable density="compact" data={records.data?.records || []} columns={columns} caption="Follow-up" getRowId={record => record.rid} loading={records.loading || records.updating} error={records.error} retry={records.retry} server={{ offset, limit, total: records.data?.total || 0, onPage: (next, size) => { setOffset(next); setLimit(size); } }} emptyTitle="No follow-ups in this selection" emptyDescription="Try another status or clear the filters. Matched records do not need follow-up."/>
  </section></EditorContext.Provider>;
}
