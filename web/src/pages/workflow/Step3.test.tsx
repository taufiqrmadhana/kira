import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {api} from '../../lib/api';
import Step3 from './Step3';
import type {Cleaning, Recommendation, RunAction, Table, WorkflowData} from './types';

vi.mock('../../lib/api', async importOriginal => ({...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn()}));
const request = vi.mocked(api);
const run: RunAction = async (_label, action) => {await action(); return true;};
const standard: Cleaning['standard'] = {outlets: {Menteng: ['menteng', 'MTG'], Senopati: ['senopati']}, providers: {DANA: ['dana', 'qris'], GOPAY: ['gopay']}};
const columns: Table['columns'] = [{name: 'id', type: 'text'}, {name: 'branch', type: 'text'}, {name: 'amount', type: 'number'}, {name: 'flag', type: 'bool'}, {name: 'note', type: 'text'}, {name: 'same', type: 'text'}];
const changed = {id: 'changed-1', branch: 'Menteng', amount: 5, flag: true, note: 'Added note', same: 'Same', __was: {branch: 'MTG', amount: 0, flag: false, note: null, same: 'Same'}};
function data(): WorkflowData {
  const empty = {columns: [], rows: [], total: 0};
  return {status: {step: 3, files: {pos: 1, settlement: 1, bank: 1}, converted: true, upload_rules_pending: [], cleaning: {open: 0, rules_version: 2}, matching: {}}, files: [], conversion: null, upload_rules: {pos: null, settlement: null, bank: null}, cleaning: {rules: {version: 2, maps: {}, exclude: {}}, recommendations: []}, tables: {parsed: {pos: empty, settlement: empty, bank: empty}, clean: {pos: {...empty, total: 75}, settlement: {...empty, total: 13}, bank: {...empty, total: 9}}}};
}
function mockTable(table?: Table) {
  request.mockImplementation(async path => {
    if (path === '/cleaning') return {standard, rules: data().cleaning.rules, recommendations: []};
    if (path.startsWith('/tables/')) {
      if (table) return table;
      const url = new URL(path, 'http://localhost');
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 0);
      return {columns, total: 75, changed: 1, dropped: 2, rows: Array.from({length: Math.min(limit, 75 - offset)}, (_, index) => ({id: `sale-${String(offset + index + 1).padStart(3, '0')}`, branch: 'Menteng', amount: 100, flag: false, note: '', same: 'Same'}))};
    }
    return {};
  });
}
function mount(current = data(), revision = 0) {return render(<Step3 data={current} busy="" run={run} revision={revision} onBack={vi.fn()} onNext={vi.fn()}/>);}
beforeEach(() => {request.mockReset(); mockTable();});
afterEach(cleanup);

it('shows 50 rows without local repagination, typed headers, real tab counts and one server pager', async () => {
  mount();
  const table = await screen.findByRole('table', {name: 'POS cleaned table'});
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  expect(screen.getByRole('tab', {name: 'POS 75 rows'})).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', {name: 'Settlement 13 rows'})).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', {name: 'Amount Number'})).toBeInTheDocument();
  expect(screen.getByText(/Showing 50 of 75 rows/)).toBeInTheDocument();
  expect(screen.getAllByRole('combobox', {name: 'POS cleaned table rows per page'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', {name: 'POS cleaned table next page'}));
  await screen.findByText('sale-051');
  expect(request).toHaveBeenCalledWith('/tables/clean/pos?limit=50&offset=50', expect.anything());
  expect(within(screen.getByRole('table', {name: 'POS cleaned table'})).getAllByRole('row')).toHaveLength(26);
  expect(screen.getByText(/Showing 25 of 75 rows/)).toBeInTheDocument();
});

it('highlights only genuine changes and restores false, zero and null without yellow in before view', async () => {
  mockTable({columns, rows: [changed], total: 1, changed: 1, dropped: 0});
  const {container} = mount();
  const table = await screen.findByRole('table', {name: 'POS cleaned table'});
  expect(container.querySelectorAll('.wf-changed-cell')).toHaveLength(4);
  expect(screen.getByText('1 row changed by cleaning')).toBeInTheDocument();
  const evidence = within(table).getByText('Added note');
  fireEvent.focus(evidence);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Before cleaning');
  fireEvent.blur(evidence);
  fireEvent.click(screen.getByRole('checkbox', {name: 'Show before cleaning'}));
  expect(container.querySelectorAll('.wf-changed-cell')).toHaveLength(0);
  const cells = within(screen.getByRole('table', {name: 'POS before cleaning'})).getAllByRole('cell');
  expect(cells[2]).toHaveTextContent('MTG');
  expect(cells[3]).toHaveTextContent(/^0/);
  expect(cells[4]).toHaveTextContent(/^No/);
  expect(cells[5]).toHaveTextContent(/^—/);
});

it('shows standard names alone and exposes source aliases on focus', async () => {
  mount();
  const panel = await screen.findByRole('region', {name: 'Your data standard'});
  await within(panel).findByText('Menteng');
  expect(within(panel).queryByText('menteng, MTG')).not.toBeInTheDocument();
  fireEvent.focus(within(panel).getByText('Menteng'));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('menteng, MTG');
  fireEvent.blur(within(panel).getByText('Menteng'));
  expect(within(panel).getByText('DANA')).toBeVisible();
  fireEvent.focus(within(panel).getByText('DANA'));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('dana, qris');
  expect(screen.getByText(/Cleaning rules v2 cover these files/)).toBeInTheDocument();
});

it('resets server pagination when switching categories and handles missing counts', async () => {
  mount();
  await screen.findByText('sale-001');
  fireEvent.click(screen.getByRole('button', {name: 'POS cleaned table next page'}));
  await screen.findByText('sale-051');
  fireEvent.click(screen.getByRole('tab', {name: 'Mutation 9 rows'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/tables/clean/bank?limit=50&offset=0', expect.anything()));
  await waitFor(() => expect(within(screen.getByRole('table', {name: 'Mutation cleaned table'})).getByText('sale-001')).toBeInTheDocument());
});

it('does not display NaN or claim changes when optional counts are null', async () => {
  mockTable({columns, rows: [{id: 'row-1'}], total: 1, changed: null, dropped: null} as unknown as Table);
  mount();
  await screen.findByText('row-1');
  expect(document.body).not.toHaveTextContent('NaN');
  expect(screen.queryByText(/rows? changed by cleaning/)).not.toBeInTheDocument();
});

it('retains the loaded rows when the current category tab is clicked again', async () => {
  mount();
  await screen.findByText('sale-001');
  fireEvent.click(screen.getByRole('tab', {name: 'POS 75 rows'}));
  expect(screen.getByText('sale-001')).toBeInTheDocument();
  expect(screen.getByRole('table', {name: 'POS cleaned table'})).toBeInTheDocument();
});

it('retains reject, undo and save cleaning actions', async () => {
  const rec: Recommendation = {id: 'settlement.branch', table: 'settlement', column: 'branch', kind: 'map', title: 'Use standard outlet names', why: 'One spelling differs.', decision: null, choices: ['Menteng'], items: [{from: 'MTG', to: 'Menteng', rows: 1}]};
  const current = data(); current.cleaning = {rules: null, recommendations: [rec]};
  const {rerender} = mount(current);
  expect(screen.getByRole('button', {name: 'Save cleaning rules v1'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Reject Use standard outlet names'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/cleaning/recommendations/settlement.branch', {method: 'POST', body: JSON.stringify({decision: 'reject', mapping: {MTG: 'Menteng'}})}));
  const decided = {...current, cleaning: {...current.cleaning, recommendations: [{...rec, decision: 'reject' as const}]}};
  rerender(<Step3 data={decided} busy="" run={run} revision={1} onBack={vi.fn()} onNext={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Undo Use standard outlet names'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/cleaning/recommendations/settlement.branch', {method: 'POST', body: JSON.stringify({decision: null, mapping: {MTG: 'Menteng'}})}));
  fireEvent.click(screen.getByRole('button', {name: 'Save cleaning rules v1'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/cleaning/save', {method: 'POST'}));
});

it('moves a confirmed decision into Saved rules and keeps undo available', async () => {
  const rec: Recommendation = {id:'pos.branch',table:'pos',column:'branch',kind:'map',title:'Standardize outlet',why:'Different spelling',decision:null,choices:['Menteng'],items:[{from:'MTG',to:'Menteng',rows:1}]};
  const current=data();current.cleaning={rules:null,recommendations:[rec]};
  const view=mount(current);
  fireEvent.click(screen.getByRole('button',{name:'Accept Standardize outlet'}));
  expect(screen.queryByText('Saved rules')).not.toBeInTheDocument();
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/cleaning/recommendations/pos.branch',expect.anything()));
  view.rerender(<Step3 data={{...current,cleaning:{rules:null,recommendations:[{...rec,decision:'accept'}]}}} busy="" run={run} revision={1} onBack={vi.fn()} onNext={vi.fn()}/>);
  const saved=await screen.findByRole('group',{name:'Saved rules'});
  expect(within(saved).getByRole('button',{name:'Undo Standardize outlet'})).toBeEnabled();
  expect(within(saved).queryByRole('combobox')).not.toBeInTheDocument();
});

it('flashes changed cells only after a successful rules save', async () => {
  mockTable({columns,rows:[changed],total:1,changed:1,dropped:0});
  const current=data();current.cleaning.rules=null;
  let finish:(ok:boolean)=>void=()=>{};
  const saving:RunAction=()=>new Promise(resolve=>{finish=resolve;});
  const view=render(<Step3 data={current} busy="" run={saving} revision={0} onBack={vi.fn()} onNext={vi.fn()}/>);
  await screen.findByRole('table',{name:'POS cleaned table'});
  fireEvent.click(screen.getByRole('button',{name:'Save cleaning rules v1'}));
  expect(view.container.querySelector('.wf-clean-flash')).toBeNull();
  finish(false);await Promise.resolve();
  expect(view.container.querySelector('.wf-clean-flash')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save cleaning rules v1'}));finish(true);
  await waitFor(()=>expect(view.container.querySelector('.wf-clean-flash')).not.toBeNull());
});
