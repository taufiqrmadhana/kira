import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {api} from '../../lib/api';
import Step2 from './Step2';
import Step3 from './Step3';
import {availableStep, type Recommendation, type RunAction, type WorkflowData} from './types';

vi.mock('../../lib/api', async importOriginal => ({...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn()}));
const request = vi.mocked(api);
const run: RunAction = async (_label, action) => {await action(); return true;};
function data(): WorkflowData {
  const empty = {columns: [], rows: [], total: 0};
  return {status: {step: 2, files: {pos: 1, settlement: 1, bank: 1}, converted: true, upload_rules_pending: ['pos'], cleaning: {open: 0, rules_version: null}, matching: {}}, files: [], conversion: {at: '2026-11-07', stale: false, decisions: {pos: 'new'}, proposals: {pos: {
    proposed: [{name: 'outlet', type: 'text', keep: true}, {name: 'other_store', type: 'text', keep: true}, {name: 'branch', type: 'text', keep: true}, {name: 'payment_amount', type: 'number', keep: true}, {name: 'sales_datetime_out', type: 'datetime', keep: true}],
    delimiter: ',', diff: null, rows: 2, files: 2, samples: {outlet: 'Menteng', other_store: 'Senopati', branch: 'Menteng', payment_amount: '100', sales_datetime_out: '2026-10-20'}, rename: {outlet: {to: 'branch', by: 'alias'}, other_store: {to: 'branch', by: 'alias'}},
  }}}, upload_rules: {pos: null, settlement: null, bank: null}, cleaning: {rules: null, recommendations: []}, tables: {parsed: {pos: empty, settlement: empty, bank: empty}, clean: {pos: empty, settlement: empty, bank: empty}}};
}
const rec: Recommendation = {id: 'settlement.branch', table: 'settlement', column: 'branch', kind: 'map', title: 'Use standard outlet names', why: 'One spelling differs.', decision: null, choices: ['Menteng', 'Senopati'], items: [{from: 'MENTENG', to: 'Menteng', rows: 1}]};
beforeEach(() => {request.mockReset();});
afterEach(cleanup);

describe('Workflow steps', () => {
  it('locks later steps when files, conversion or saved cleaning are incomplete', () => {
    const current = data(); expect(availableStep(current)).toBe(2);
    current.status.files.bank = 0; expect(availableStep(current)).toBe(1);
    current.status.files.bank = 1; current.status.upload_rules_pending = []; expect(availableStep(current)).toBe(3);
    current.cleaning.rules = {version: 1, maps: {}, exclude: {}}; expect(availableStep(current)).toBe(4);
    current.cleaning.recommendations = [{...rec, decision: 'accept'}]; expect(availableStep(current)).toBe(3);
    current.conversion!.stale = true; expect(availableStep(current)).toBe(2);
  });
  it('clearing one source preserves the other provider mapping', async () => {
    request.mockResolvedValue({});
    render(<Step2 data={data()} busy="" run={run} onBack={() => {}} onNext={() => {}}/>);
    fireEvent.change(screen.getByRole('combobox', {name: 'Source for POS branch'}), {target: {value: ''}});
    fireEvent.click(screen.getByRole('button', {name: 'Create rule'}));
    await waitFor(() => expect(request).toHaveBeenCalled());
    const payload = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(payload.rename).toEqual({outlet: '', other_store: 'branch'});
    expect(payload.columns.some((column: {name: string}) => column.name === 'branch')).toBe(true);
  });
  it('clearing all mappings preserves reviewed target overrides for mixed native files', async () => {
    const current = data(); delete current.conversion!.proposals.pos!.rename.other_store;
    Object.assign(current.conversion!.proposals.pos!.proposed.find(column => column.name === 'branch')!, {keep: false, type: 'number'});
    request.mockResolvedValue({});
    render(<Step2 data={current} busy="" run={run} onBack={() => {}} onNext={() => {}}/>);
    fireEvent.change(screen.getByRole('combobox', {name: 'Source for POS branch'}), {target: {value: ''}});
    fireEvent.click(screen.getByRole('button', {name: 'Create rule'}));
    await waitFor(() => expect(request).toHaveBeenCalled());
    const payload = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(payload.rename.outlet).toBe('');
    expect(payload.columns.find((column: {name: string}) => column.name === 'branch')).toEqual({name: 'branch', type: 'number', keep: false});
    expect(payload.columns.some((column: {name: string}) => column.name === 'branch')).toBe(true);
  });
  it('keep sends only the keep choice, ignoring edited controls', async () => {
    const current = data(); current.upload_rules.pos = {version: 1, columns: [], rename: {}, created_at: '', created_by: ''};
    request.mockResolvedValue({});
    render(<Step2 data={current} busy="" run={run} onBack={() => {}} onNext={() => {}}/>);
    fireEvent.click(screen.getByRole('button', {name: 'Keep saved rule'}));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/upload-rules/pos', {method: 'POST', body: JSON.stringify({choice: 'keep'})}));
  });
  it('shows original cleaned values and sends accepted or undone mappings', async () => {
    request.mockImplementation(async path => path === '/cleaning' ? {standard: {outlets: {Menteng: []}, providers: {DANA: []}}, rules: null, recommendations: [rec]} : path.startsWith('/tables/') ? {columns: [{name: 'branch', type: 'text'}], rows: [{branch: 'Menteng', __was: {branch: 'MENTENG-RAW'}}], total: 51, changed: 1, dropped: 0} : {});
    const current = data(); current.cleaning.recommendations = [rec];
    const {rerender} = render(<Step3 data={current} busy="" run={run} revision={1} onBack={() => {}} onNext={() => {}}/>);
    await screen.findByText('Menteng', {selector: '.wf-changed-cell'});
    fireEvent.click(screen.getByRole('checkbox', {name: 'Show before cleaning'}));
    expect(screen.getByText('MENTENG-RAW')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', {name: 'Map MENTENG in Settlement branch'}), {target: {value: 'Senopati'}});
    fireEvent.click(screen.getByRole('button', {name: 'Accept Use standard outlet names'}));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/cleaning/recommendations/settlement.branch', {method: 'POST', body: JSON.stringify({decision: 'accept', mapping: {MENTENG: 'Senopati'}})}));
    const decided = {...current, cleaning: {...current.cleaning, recommendations: [{...rec, decision: 'accept' as const, items: [{from: 'MENTENG', to: 'Senopati', rows: 1}]}]}};
    rerender(<Step3 data={decided} busy="" run={run} revision={2} onBack={() => {}} onNext={() => {}}/>);
    fireEvent.click(screen.getByRole('button', {name: 'Undo Use standard outlet names'}));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/cleaning/recommendations/settlement.branch', {method: 'POST', body: JSON.stringify({decision: null, mapping: {MENTENG: 'Senopati'}})}));
    await screen.findByRole('button', {name: 'POS before cleaning next page'});
    fireEvent.click(screen.getByRole('button', {name: 'POS before cleaning next page'}));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/tables/clean/pos?limit=50&offset=50', expect.anything()));
  });
});
it('moves through upload-rule column ticks without changing the reviewed choices',()=>{
  render(<Step2 data={data()} busy="" run={run} onBack={()=>{}} onNext={()=>{}}/>);
  const ticks=screen.getAllByRole('checkbox');
  expect(ticks.filter(tick=>tick.tabIndex===0)).toHaveLength(1);
  fireEvent.keyDown(ticks[0],{key:'ArrowDown'});expect(ticks[1]).toHaveFocus();expect(ticks[1]).toBeChecked();
  fireEvent.keyDown(ticks[1],{key:'End'});expect(ticks.at(-1)).toHaveFocus();
});
