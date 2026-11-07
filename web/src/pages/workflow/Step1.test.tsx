import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {api} from '../../lib/api';
import Step1 from './Step1';
import {uploadFile} from './upload';
vi.mock('./upload',()=>({uploadFile:vi.fn(async()=>[])}));
const upload=vi.mocked(uploadFile);
import type {RawFile, RunAction, WorkflowData} from './types';

vi.mock('../../lib/api', async importOriginal => ({...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn(), identity: {user: () => 'Andrew', client: () => 'demo'}}));
const request = vi.mocked(api);
const messages: string[] = [];
const failures: string[] = [];
const run: RunAction = async (_label, action) => {
  try {const message = await action(); if (message) messages.push(message); return true;}
  catch (error) {failures.push((error as Error).message); return false;}
};
const source = (id: number, type: RawFile['type'], name: string, folder = ''): RawFile => ({id, type, name, folder, sheet: null, size: 2048, rows: 36, uploaded_at: '2026-11-07T05:38:00Z', uploaded_by: 'Andrew', looks_like: null, wrong_area: false});
function data(files: RawFile[] = []): WorkflowData {
  const empty = {columns: [], rows: [], total: 0};
  return {status: {step: 1, files: {pos: files.filter(file => file.type === 'pos').length, settlement: files.filter(file => file.type === 'settlement').length, bank: files.filter(file => file.type === 'bank').length}, converted: false, upload_rules_pending: [], cleaning: {open: 0, rules_version: null}, matching: {}}, files, conversion: null, upload_rules: {pos: null, settlement: null, bank: null}, cleaning: {rules: null, recommendations: []}, tables: {parsed: {pos: empty, settlement: empty, bank: empty}, clean: {pos: empty, settlement: empty, bank: empty}}};
}
function mount(current = data(), busy = '', onNext = vi.fn()) {return render(<Step1 data={current} busy={busy} run={run} revision={0} onNext={onNext}/>);}
beforeEach(() => {upload.mockClear();request.mockReset(); request.mockImplementation(async path => path.startsWith('/audit') ? [] : path.startsWith('/files/samples') ? [{name: 'sample.csv', status: 'added', ids: [1]}] : path.startsWith('/files/') ? [] : {}); messages.length = 0; failures.length = 0;});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

it('groups same-folder files once and enables conversion only when all areas have files', async () => {
  const onNext = vi.fn();
  const current = data([source(1, 'pos', 'pos.csv', 'Sample day 1'), source(2, 'settlement', 'dana.csv', 'Sample day 1'), source(3, 'settlement', 'gopay.csv', 'Sample day 1'), source(4, 'bank', 'bank.csv', 'Sample day 1')]);
  mount(current, '', onNext);
  const settlement = screen.getByRole('region', {name: 'Settlement'});
  expect(within(settlement).getAllByText('Sample day 1')).toHaveLength(1);
  expect(within(settlement).getByText('2 files')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Next: Convert'}));
  expect(onNext).toHaveBeenCalledOnce();
  await waitFor(() => expect(request).toHaveBeenCalledWith('/audit?limit=100', expect.anything()));
});

it('keeps file pickers, preserves folder paths in multipart uploads, and rejects oversized files', async () => {
  mount();
  const files = screen.getByLabelText('POS files');
  const folder = screen.getByLabelText('POS folder');
  expect(files).toHaveAttribute('multiple');
  expect(folder).toHaveAttribute('webkitdirectory');
  const file = new File(['branch,amount\nMenteng,100'], 'pos.csv', {type: 'text/csv'});
  Object.defineProperty(file, 'webkitRelativePath', {value: 'week/day1/pos.csv'});
  fireEvent.change(folder, {target: {files: [file]}});
  await waitFor(() => expect(upload).toHaveBeenCalledWith('pos',file,'week/day1',expect.any(Function)));
  const large = new File(['x'], 'large.csv');
  Object.defineProperty(large, 'size', {value: 10 * 1024 * 1024 + 1});
  Object.defineProperty(large, 'webkitRelativePath', {value: ''});
  fireEvent.change(files, {target: {files: [large]}});
  await waitFor(() => expect(failures).toContain('Each file must be 10 MB or smaller.'));
  expect(upload).toHaveBeenCalledTimes(1);
});

it('keeps an obvious correction action for wrong-area files and sends the selected move', async () => {
  mount(data([{...source(1, 'pos', 'bank.csv'), wrong_area: true, looks_like: 'bank'}]));
  expect(screen.getByText(/Looks like Mutation/)).toBeInTheDocument();
  const destination = screen.getByRole('combobox', {name: 'Move bank.csv to'});
  expect(destination).toHaveValue('bank');
  fireEvent.click(screen.getByRole('button', {name: 'Move bank.csv'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/files/1/move', {method: 'POST', body: JSON.stringify({to: 'bank'})}));
  expect(screen.getByRole('button', {name: 'Next: Convert'})).toBeDisabled();
});

it('retains sample loading, removal and pending states', async () => {
  const current = data([source(1, 'pos', 'pos.csv')]);
  const {rerender} = mount(current);
  fireEvent.change(screen.getByRole('combobox', {name: 'Sample day'}), {target: {value: '2'}});
  fireEvent.click(screen.getByRole('button', {name: 'Use sample files'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/files/samples/2', {method: 'POST'}));
  fireEvent.click(screen.getByRole('button', {name: 'Remove pos.csv'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/files/1', {method: 'DELETE'}));
  rerender(<Step1 data={current} busy="Uploading POS" run={run} revision={0} onNext={vi.fn()}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Uploading POS');
  expect(screen.getByRole('button', {name: 'Choose files for POS'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Remove pos.csv'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Next: Convert'})).toBeDisabled();
});

it('uploads files dropped onto the correct category', async () => {
  mount();
  const file = new File(['bank'], 'bank.csv');
  Object.defineProperty(file, 'webkitRelativePath', {value: ''});
  fireEvent.drop(screen.getByLabelText('Drop Mutation files or folders'), {dataTransfer: {items: [], files: [file]}});
  await waitFor(() => expect(upload).toHaveBeenCalledWith('bank',file,'',expect.any(Function)));
});
