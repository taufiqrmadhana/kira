import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import Step4 from './Step4';
import {ApiError} from '../../lib/api';
import {useLayoutEffect, useRef} from 'react';
import MatchingResults from './MatchingResults';
import type {Request, Results} from './matchingTypes';

const {stream} = vi.hoisted(() => ({stream: vi.fn()}));
vi.mock('../../lib/progress', () => ({streamProgress: stream}));
const rules = [
  {id: 'PS1', stage: 'l1', kind: 'id', params: {posCol: 'id', stlCol: 'reference'}, name: 'First ID rule', conditions: ['Same ID']},
  {id: 'PS2', stage: 'l1', kind: 'composite', params: {window: 1}, name: 'Outlet and amount', conditions: ['Same outlet']},
  {id: 'SM1', stage: 'l2', kind: 'ref', params: {amountTol: 0}, name: 'Reference and amount', conditions: ['Same reference']},
];
const run = {stage: 'l1', matched: 33, total: 36, unmatched_left: 3, unmatched_right: 2, hits: {PS1: 30, PS2: 3}, rules: ['PS1', 'PS2']};
const final = {totals: {rows: 39, pos: 36, full: 30, matched: 30, mismatched: 9, review: 0, stl: 35, l1: 33, l2: 32, cash: 10329799, credits: 19, credits_linked: 18, many_to_one: 2}};
let done: boolean;
function status() {return {converted: true, upload_rules_pending: [], cleaning: {open: 0, rules_version: 1}, matching: {l1: {done, matched: 33, total: 36, summary: run}, l2: {done, matched: 32, total: 35, summary: {...run, stage: 'l2', matched: 32, total: 35, hits: {SM1: 32}}}}};}
beforeEach(() => {
  done = false; stream.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const body = input.endsWith('/matching/rules') ? rules : input.endsWith('/status') ? status() : input.endsWith('/matching/results') ? (done ? final : null)
      : input.includes('/analysis/records?') ? {total: 39, offset: 0, limit: 50, banks: {'0': {keterangan: 'Provider payout A', kredit: 200000}}, records: [0, 1].map(i => ({i, key: 'sale-' + i, bank_i: 0, pos: {sales_number: 'SALE-' + (i + 1), payment_amount: 100000}, stl: {reference: 'PAY-' + (i + 1), nett_amount: 100000}, status: 'Matched', reason: '', r1: 'PS1', r2: 'SM1'}))}
      : input.endsWith('/test') ? run : input.endsWith('/preview') ? {name: 'Rule preview', conditions: [], matches_alone: 33, extra_after_saved: 3, total: 36} : {};
    return new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json'}});
  }));
});
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();});
async function stageOne() {return within(await screen.findByRole('region', {name: 'POS to settlement'}));}
async function testRules() {const stage = await stageOne(); fireEvent.click(stage.getByRole('button', {name: 'Test selected rules'})); await stage.findByRole('button', {name: 'No, generate matching result'}); return stage;}

it('summarizes saved rules and keeps completed stages compact until Change rules', async () => {
  done = true; render(<Step4/>);
  const stage = await stageOne();
  expect(stage.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '33 of 36 POS sales matched')).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Matching rules'})).toHaveTextContent('PS1');
  expect(stage.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(stage.getByRole('button', {name: 'Change rules'}));
  const first = stage.getByRole('checkbox', {name: 'Select PS1: First ID rule'}), second = stage.getByRole('checkbox', {name: 'Select PS2: Outlet and amount'});
  expect(first.tabIndex).toBe(0); expect(second.tabIndex).toBe(-1);
  fireEvent.keyDown(first, {key: 'ArrowDown'}); expect(second).toHaveFocus();
  fireEvent.keyDown(second, {key: 'Home'}); expect(first).toHaveFocus();
});

it('tests only selected rules and shows a decision without generating saved results', async () => {
  const changed = vi.fn(); render(<Step4 onDataChanged={changed}/>);
  const stage = await stageOne();
  fireEvent.click(stage.getByRole('checkbox', {name: 'Select PS2: Outlet and amount'}));
  fireEvent.click(stage.getByRole('button', {name: 'Test selected rules'}));
  const preview = await stage.findByRole('region', {name: 'POS to settlement test results'});
  expect(preview).toHaveTextContent('33'); expect(preview).toHaveTextContent('3 POS sales unmatched'); expect(preview).toHaveTextContent('2 settlement rows left over');
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/l1/test'));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({rule_ids: ['PS1']});
  expect(stream).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  fireEvent.click(stage.getByRole('button', {name: 'Yes, create a new rule'}));
  expect(stage.getByRole('heading', {name: 'Create a matching rule'})).toBeInTheDocument();
  expect(stream).not.toHaveBeenCalled();
});

it('shows real check counts and rule hits while generating, then renders saved completion', async () => {
  let complete!: () => void;
  stream.mockImplementation(async (_path, _init, progress) => {
    progress({type: 'progress', stage: 'l1', completed: 12, total: 72, unit: 'checks', matched: 10, hits: {PS1: 10}});
    await new Promise<void>(resolve => {complete = resolve;}); done = true; return run;
  });
  render(<Step4 clientId="demo" userName="Andrew"/>);
  const stage = await testRules();
  fireEvent.click(stage.getByRole('button', {name: 'No, generate matching result'}));
  const bar = await stage.findByRole('progressbar', {name: 'POS to settlement matching progress'});
  expect(bar).toHaveAttribute('value', '12'); expect(bar).toHaveAttribute('max', '72');
  expect(stage.getByText('12 of 72 checks')).toBeInTheDocument();
  expect(stage.getByText('10 linked so far')).toBeInTheDocument();
  expect(stream.mock.calls[0][0]).toBe('/matching/l1/run/stream');
  expect(new Headers(stream.mock.calls[0][1].headers).get('X-Kira-Client')).toBe('demo');
  await act(async () => complete());
  await screen.findByRole('heading', {name: 'Matching complete'});
  expect(stage.getByRole('button', {name: 'Change rules'})).toBeInTheDocument();
});

it('requires a refresh after an uncertain stream failure instead of risking a repeated write', async () => {
  stream.mockRejectedValue(new Error('The connection ended before completion.'));
  render(<Step4/>); const stage = await testRules();
  fireEvent.click(stage.getByRole('button', {name: 'No, generate matching result'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('The matching result could not be confirmed');
  expect(stage.queryByRole('button', {name: 'No, generate matching result'})).not.toBeInTheDocument();
  expect(stage.getByRole('button', {name: 'Test selected rules'})).toBeDisabled();
  expect(stage.queryByRole('button', {name: 'Change rules'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Refresh results'}));
  await waitFor(() => expect(stage.getByRole('button', {name: 'Test selected rules'})).toBeEnabled());
  expect(stream).toHaveBeenCalledOnce();
});

it('keeps the tested selection after an explicit server rejection without replaying it', async () => {
  stream.mockRejectedValue(new ApiError(409, 'The selected rules are not ready.'));
  render(<Step4/>); const stage = await testRules();
  fireEvent.click(stage.getByRole('button', {name: 'No, generate matching result'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('The selected rules are not ready.');
  expect(stage.getByRole('button', {name: 'No, generate matching result'})).toBeEnabled();
  expect(stream).toHaveBeenCalledOnce();
});

it('uses actual result totals and loads grouped evidence only when expanded', async () => {
  done = true; render(<Step4/>);
  const results = within(await screen.findByRole('region', {name: 'Matching results'}));
  expect(results.getByRole('heading', {name: 'Matching complete'})).toBeInTheDocument();
  expect(results.getByText('Rp 10.329.799')).toBeInTheDocument();
  expect(results.getByText('18 of 19 bank credits')).toBeInTheDocument();
  expect(results.getByText(/30 of 36 sales reconciled end to end/)).toHaveTextContent('9 mismatched');
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/analysis/records'))).toBe(false);
  fireEvent.click(results.getByRole('button', {name: /View combined table/}));
  const table = await results.findByRole('table', {name: 'Combined matching result'});
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getAllByText('Provider payout A')).toHaveLength(1);
  expect(within(table).getByText('SALE-1')).toBeInTheDocument();
  expect(results.getByText(/Showing 2 of 39 combined rows/)).toBeInTheDocument();
});

it('keeps the first expansion after results commit and resets only for refreshed results', async () => {
  const requestMock = vi.fn(async () => ({records: [], banks: {}, total: 0, offset: 0, limit: 50}));
  const request: Request = async <T,>() => await requestMock() as T;
  function ResultView({result}: {result: Results}) {
    const container = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      // A click can arrive after the result is committed but before passive effects run.
      container.current?.querySelector<HTMLButtonElement>('.step4-combined-toggle')?.click();
    }, []);
    return <div ref={container}><MatchingResults results={result} status={null} request={request} busy={false} onExport={() => {}}/></div>;
  }
  const {rerender} = render(<ResultView result={final}/>);
  expect(screen.getByRole('button', {name: /Hide combined table/})).toHaveAttribute('aria-expanded', 'true');
  await screen.findByText('No combined records in this result.');
  rerender(<ResultView result={{...final, totals: {...final.totals, rows: 40}}}/>);
  expect(screen.getByRole('button', {name: /View combined table/})).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('No combined records in this result.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: /View combined table/}));
  await screen.findByText('No combined records in this result.');
  expect(requestMock).toHaveBeenCalledTimes(2);
});

it('downloads Excel with the exact bound client and actor, including default client', async () => {
  done = true; const create = vi.fn(() => 'blob:export');
  Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: create});
  Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: vi.fn()});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  localStorage.setItem('kira-client', 'some-other-client');
  render(<Step4 clientId="" userName="Rifat"/>);
  fireEvent.click(await screen.findByRole('button', {name: 'Export Excel'}));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/matching/export.xlsx'));
  expect(new Headers(call?.[1]?.headers).get('X-Kira-Client')).toBe('');
  expect(new Headers(call?.[1]?.headers).get('X-Kira-User')).toBe('Rifat');
  expect(call?.[1]?.credentials).toBe('include');
  expect(screen.getByText(/import it into Google Sheets/)).toBeInTheDocument();
});

it('aborts an in-flight generation when the client changes', async () => {
  stream.mockImplementation(() => new Promise(() => {}));
  const {rerender} = render(<Step4 clientId="old" userName="Andrew"/>);
  const stage = await testRules(); fireEvent.click(stage.getByRole('button', {name: 'No, generate matching result'}));
  await waitFor(() => expect(stream).toHaveBeenCalledOnce());
  const signal = stream.mock.calls[0][1].signal as AbortSignal;
  rerender(<Step4 clientId="new" userName="Andrew"/>);
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).get('X-Kira-Client')).toBe('new'));
});

it('invalidates a test when selection changes and disables testing an empty selection', async () => {
  render(<Step4/>); const stage = await testRules();
  fireEvent.click(stage.getByRole('checkbox', {name: 'Select PS1: First ID rule'}));
  expect(stage.queryByRole('button', {name: 'No, generate matching result'})).not.toBeInTheDocument();
  fireEvent.click(stage.getByRole('checkbox', {name: 'Select PS2: Outlet and amount'}));
  expect(stage.getByRole('button', {name: 'Test selected rules'})).toBeDisabled();
  const stageTwo = within(screen.getByRole('region', {name: 'Settlement to bank'}));
  expect(stageTwo.getByRole('button', {name: 'Test selected rules'})).toBeDisabled();
  expect(stream).not.toHaveBeenCalled();
});

it('distinguishes a committed run from a failed refresh and does not offer to generate it again', async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let saved = false;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    if (saved) throw new Error('Connection lost');
    return original(...args);
  });
  stream.mockImplementation(async () => {saved = true; return run;});
  render(<Step4/>); const stage = await testRules();
  fireEvent.click(stage.getByRole('button', {name: 'No, generate matching result'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('The matching result was saved, but could not be refreshed');
  expect(screen.queryByRole('button', {name: 'No, generate matching result'})).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', {name: 'Matching complete'})).not.toBeInTheDocument();
  expect(stage.getByRole('button', {name: 'Test selected rules'})).toBeDisabled();
  saved = false;
  fireEvent.click(screen.getByRole('button', {name: 'Refresh results'}));
  await waitFor(() => expect(stage.getByRole('button', {name: 'Test selected rules'})).toBeEnabled());
  expect(stream).toHaveBeenCalledOnce();
});

it('loads the next combined-record page from the server', async () => {
  done = true; const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    const url = String(args[0]);
    if (!url.includes('/analysis/records?')) return original(...args);
    const offset = Number(new URL(url, 'http://test').searchParams.get('offset'));
    return new Response(JSON.stringify({total: 55, offset, limit: 50, banks: {}, records: Array.from({length: offset ? 5 : 50}, (_, i) => ({i: offset + i, key: 'sale-' + (offset + i), bank_i: null, pos: {sales_number: 'SALE-' + (offset + i + 1)}, stl: null, status: 'Mismatched', reason: 'No settlement'}))}));
  });
  render(<Step4/>);
  fireEvent.click(await screen.findByRole('button', {name: /View combined table/}));
  const table = await screen.findByRole('table', {name: 'Combined matching result'});
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  fireEvent.click(screen.getByRole('button', {name: 'Combined table next page'}));
  await screen.findByText('SALE-51');
  expect(within(screen.getByRole('table', {name: 'Combined matching result'})).getAllByRole('row')).toHaveLength(6);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/analysis/records?offset=50&limit=50')).toBe(true);
});


it('keeps inactive Nurwan rules out of the selected run and persists deactivation', async () => {
  const inactive = {...rules[1], params: {...rules[1].params, enabled: false}};
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith('/matching/rules')
    ? new Response(JSON.stringify([rules[0], inactive, rules[2]])) : original(input, init));
  render(<Step4/>);
  const stage = await stageOne();
  expect(stage.getByRole('checkbox', {name:'Select PS2: Outlet and amount'})).toBeDisabled();
  expect(stage.getByRole('checkbox', {name:'Select PS2: Outlet and amount'})).not.toBeChecked();
  fireEvent.click(stage.getByRole('button', {name:'Test selected rules'}));
  await stage.findByRole('region', {name:'POS to settlement test results'});
  const testCall = vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/l1/test'));
  expect(JSON.parse(String(testCall?.[1]?.body))).toEqual({rule_ids:['PS1']});
  fireEvent.click(stage.getByRole('button', {name:'Deactivate PS1'}));
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url,init])=>String(url).endsWith('/rules/PS1') && init?.method==='PATCH' && JSON.parse(String(init.body)).params.enabled===false)).toBe(true));
});

it('retains the guided rule editor and explicit activation review', async () => {
  render(<Step4/>);const stage=await stageOne();
  fireEvent.click(stage.getByRole('button',{name:'Create rule'}));
  expect(stage.getByRole('heading',{name:'Create a matching rule'})).toBeInTheDocument();
  expect(stage.getByRole('checkbox',{name:'Approve and activate this rule'})).not.toBeChecked();
  expect(stage.getByRole('combobox',{name:'POS amount'})).toBeInTheDocument();
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/matching/columns'))).toBe(true));
});
