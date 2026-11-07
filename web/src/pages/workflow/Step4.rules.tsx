import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';

export type Stage = 'l1' | 'l2';
export type Params = Record<string, string | number | boolean>;
export type Rule = { id?: string; stage: Stage; kind: string; params: Params; name: string; conditions: string[]; why?: string; matches_alone?: number; extra_after_saved?: number; total?: number };
export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Columns = Record<'pos' | 'settlement' | 'bank', { name: string; type: string }[]>;
type Preview = Pick<Rule, 'name' | 'conditions' | 'matches_alone' | 'extra_after_saved' | 'total'>;
const count = (n: number) => new Intl.NumberFormat('id-ID').format(n);
const labels: Record<string, string> = {
  trace_number: 'Payment reference', external_reference_id: 'Original payment reference',
  reference: 'Settlement reference', entity_id: 'Store ID', merchant_id: 'Merchant ID',
  partner_merchant_id: 'Provider merchant ID', branch: 'Outlet', payment_amount: 'POS payment amount',
  gross_amount: 'Gross settlement amount', nett_amount: 'Net settlement amount',
  sales_datetime_out: 'Sale date and time', transaction_date: 'Settlement date and time',
};
const kinds: Record<string, string> = {
  composite: 'Payment amount and date', id: 'Reference only', withdrawal: 'Daily withdrawal to bank',
  batch: 'Daily settlement total to bank', ref: 'One settlement by reference', amount: 'One settlement by amount',
};
const presets = [
  ['Reference, exact amount, same date', 'Start with the strongest evidence.'],
  ['Exact amount, same date', 'Allow a missing reference. Keep each pair unique.'],
  ['Exact amount, date range', 'Allow a delay between the two reports.'],
  ['Amount tolerance, date range', 'Keep amount differences visible for follow-up.'],
];

export function newRule(stage: Stage): Rule {
  return { stage, kind: stage === 'l1' ? 'composite' : 'withdrawal', name: '', conditions: [], params: {
    enabled: false, amountTol: 0, ...(stage === 'l1'
      ? { outlet: true, method: false, window: 'day', requireId: true }
      : { groupBy: 'entity_id', requireId: true, minDays: 0, maxDays: 0 }),
  } };
}

export function RuleEditor({ rule, request, busy, onSave, onCancel }: {
  rule: Rule; request: Request; busy: boolean; onSave: (rule: Rule) => void; onCancel: () => void;
}) {
  const id = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<Rule>({ ...rule, params: rule.stage === 'l2'
    ? { minDays: 0, maxDays: 3, ...rule.params } : rule.params });
  const [columns, setColumns] = useState<Columns | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [columnError, setColumnError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState(Number(rule.params.window) >= 1440 ? 1440 : Number(rule.params.window) >= 60 ? 60 : 1);
  const update = (patch: Params) => setDraft(previous => ({ ...previous, params: { ...previous.params, ...patch } }));
  useEffect(() => {
    title.current?.focus();
    const controller = new AbortController();
    request<Columns>('/matching/columns', { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setColumns(value);
      if (!rule.id && rule.stage === 'l1' && !rule.params.posCol) {
        const pick = (area: 'pos' | 'settlement', preferred: string) => value[area].find(c => c.name === preferred)?.name ?? '';
        const left = pick('pos', 'trace_number'), right = pick('settlement', 'external_reference_id');
        if (left && right) setDraft(previous => ({ ...previous, params: { ...previous.params, posCol: left, stlCol: right } }));
        else setDraft(previous => ({ ...previous, params: { ...previous.params, requireId: false } }));
      }
    }).catch((err: Error) => { if (!controller.signal.aborted) setColumnError(err.message); });
    return () => controller.abort();
  }, [request, rule.id, rule.stage]);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError('');
    if (!columns) return () => controller.abort();
    setLoading(true);
    const timer = setTimeout(() => {
      request<Preview>(`/matching/${draft.stage}/preview`, { method: 'POST', body: JSON.stringify({
        kind: draft.kind, params: draft.params, exclude: draft.id ?? null,
      }), signal: controller.signal }).then(value => { if (!controller.signal.aborted) setPreview(value); })
        .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft.kind, draft.params, draft.stage, draft.id, request, columns]);

  const chooseKind = (kind: string) => {
    const p: Params = { enabled: false };
    if (kind === 'id' || kind === 'composite') {
      p.posCol = draft.params.posCol ?? 'trace_number'; p.stlCol = draft.params.stlCol ?? 'external_reference_id';
    }
    if (kind === 'composite') Object.assign(p, { outlet: true, method: false, requireId: true, amountTol: 0, window: 'day' });
    if (kind !== 'id' && kind !== 'composite') Object.assign(p, { amountTol: 0, minDays: 0, maxDays: 0 });
    if (kind === 'withdrawal' || kind === 'batch') Object.assign(p, { groupBy: kind === 'withdrawal' ? 'entity_id' : 'merchant_id', requireId: true });
    setDraft(previous => ({ ...previous, kind, params: p }));
  };
  const applyPreset = (index: number) => {
    const base = newRule(draft.stage);
    const p = { ...base.params, requireId: index === 0, amountTol: index === 3 ? 1000 : 0 };
    if (draft.stage === 'l1') {
      Object.assign(p, { window: index < 2 ? 'day' : 4320 });
      if (draft.params.posCol && draft.params.stlCol || index === 0) Object.assign(p, {
        posCol: draft.params.posCol ?? '', stlCol: draft.params.stlCol ?? '',
      });
    }
    else Object.assign(p, { groupBy: draft.params.groupBy ?? 'entity_id', maxDays: index < 2 ? 0 : 3 });
    setUnit(1440);
    setDraft(previous => ({ ...previous, kind: base.kind, params: p, name: presets[index][0] }));
  };
  const selectColumn = (key: string, area: keyof Columns, label: string, fallback = '') => <label htmlFor={`${id}-${key}`}>
    {label}<select id={`${id}-${key}`} aria-label={label} required value={String(draft.params[key] ?? fallback)} onChange={e => update({ [key]: e.target.value })}>
      <option value="" disabled>Choose a column</option>
      {(columns?.[area] ?? []).map(col => <option key={col.name} value={col.name}>{labels[col.name] ? `${labels[col.name]} (${col.name})` : col.name.replaceAll('_', ' ')}</option>)}
    </select>
  </label>;
  const check = (key: string, label: string, fallback = false) => <label className="step4-check">
    <input type="checkbox" checked={Boolean(draft.params[key] ?? fallback)} onChange={e => update({ [key]: e.target.checked })} />{label}
  </label>;
  const number = (key: string, label: string, fallback = 0) => <label htmlFor={`${id}-${key}`}>{label}
    <input id={`${id}-${key}`} required type="number" min={0} step="any" value={String(draft.params[key] ?? fallback)} onChange={e => update({ [key]: e.target.value === '' ? '' : Number(e.target.value) })} />
  </label>;
  const datesExact = draft.stage === 'l1' ? draft.params.window === 'day' : draft.params.maxDays !== '' && Number(draft.params.maxDays ?? 3) === 0;
  const amountExact = draft.params.amountTol !== '' && Number(draft.params.amountTol ?? 0) === 0;
  const enabled = draft.params.enabled !== false;
  const submit = (event: FormEvent) => { event.preventDefault(); if (preview && !loading && !columnError) onSave(draft); };

  return <form className="step4-editor" onSubmit={submit} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={title} tabIndex={-1}>{rule.id ? `Edit rule ${rule.id}` : 'Create a matching rule'}</h3>
    <p>Start from a layer, then adjust its conditions. Only unmatched rows reach the next active rule.</p>
    <fieldset disabled={busy || !columns}>
      <legend className="step4-sr-only">Rule conditions</legend>
      <div className="step4-presets">{presets.map(([name, description], index) => <button key={name} type="button" onClick={() => applyPreset(index)}>
        <strong>{index + 1}. {name}</strong><small>{description}</small>
      </button>)}</div>
      <div className="step4-fields">
        <label htmlFor={`${id}-name`}>Rule name<input id={`${id}-name`} maxLength={100} placeholder="For example: bank deposits within 2 days" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label htmlFor={`${id}-kind`}>What to compare<select id={`${id}-kind`} value={draft.kind} onChange={e => chooseKind(e.target.value)}>
          {(draft.stage === 'l1' ? ['composite', 'id'] : ['withdrawal', 'batch', 'ref', 'amount']).map(k => <option key={k} value={k}>{kinds[k]}</option>)}
        </select></label>
      </div>
      {(draft.kind === 'id' || draft.kind === 'composite') && <>
        <h4>Payment reference</h4>
        {draft.kind === 'composite' && <label className="step4-check"><input type="checkbox" checked={'posCol' in draft.params} onChange={e => {
          const params: Params = { ...draft.params, requireId: false };
          if (e.target.checked) Object.assign(params, { posCol: '', stlCol: '' });
          else { delete params.posCol; delete params.stlCol; }
          setDraft({ ...draft, params });
        }} />Use reference fields when available</label>}
        {(draft.kind === 'id' || 'posCol' in draft.params) && <div className="step4-fields">{selectColumn('posCol', 'pos', 'Reference in POS')}{selectColumn('stlCol', 'settlement', 'Reference in settlement')}
          {draft.kind === 'composite' && check('requireId', 'Require a reference on both sides')}
        </div>}
        <p>{draft.kind === 'id' ? 'This rule checks the reference only. Amount differences remain open for follow-up.' : 'When both references exist, they must agree. A missing reference is allowed only when the box is off.'}</p>
      </>}
      {(draft.kind === 'withdrawal' || draft.kind === 'batch') && <div className="step4-fields">
        {selectColumn('groupBy', 'settlement', 'Group daily payments by')}
        {check('requireId', 'Require store ID in the bank description', true)}
        <p>A missing store ID is allowed when the box is off. A bank description that identifies another known store is never linked.</p>
      </div>}
      {draft.kind !== 'id' && <>
        <h4>Amount and date limits</h4>
        <div className="step4-fields">
          <label htmlFor={`${id}-amount-mode`}>Amount<select id={`${id}-amount-mode`} value={amountExact ? 'exact' : 'range'} onChange={e => update({ amountTol: e.target.value === 'exact' ? 0 : 1000 })}>
            <option value="exact">Must be equal</option><option value="range">Allow a difference</option>
          </select></label>
          {!amountExact && number('amountTol', 'Maximum difference per pair or payout (Rp)')}
          <label htmlFor={`${id}-date-mode`}>Date<select id={`${id}-date-mode`} value={datesExact ? 'exact' : 'range'} onChange={e => update(draft.stage === 'l1' ? { window: e.target.value === 'exact' ? 'day' : 4320 } : { minDays: 0, maxDays: e.target.value === 'exact' ? 0 : 3 })}>
            <option value="exact">Same calendar date</option><option value="range">Allow a date range</option>
          </select></label>
          {!datesExact && draft.stage === 'l1' && <div className="step4-window">
            <label htmlFor={`${id}-window`}>Maximum time difference<input id={`${id}-window`} required type="number" min={0} step="any" value={draft.params.window === '' ? '' : Number(draft.params.window ?? 1) / unit} onChange={e => update({ window: e.target.value === '' ? '' : Number(e.target.value) * unit })} /></label>
            <label htmlFor={`${id}-unit`}>Unit<select id={`${id}-unit`} value={unit} onChange={e => setUnit(Number(e.target.value))}><option value={1}>Minutes</option><option value={60}>Hours</option><option value={1440}>Days</option></select></label>
          </div>}
          {!datesExact && draft.stage === 'l2' && <>{number('minDays', 'Earliest bank arrival (days after payout)')}{number('maxDays', 'Latest bank arrival (days after payout)', 3)}</>}
        </div>
        <p>Amount limits apply to each payment pair or the whole payout, not each sale in a payout. Differences stay visible.</p>
      </>}
      {draft.kind === 'composite' && <details className="step4-advanced"><summary>More conditions and column mapping</summary>
        <div className="step4-fields">{check('outlet', 'Require the same outlet', true)}{check('method', 'Require the same payment method')}
          {selectColumn('posAmount', 'pos', 'POS amount', 'payment_amount')}{selectColumn('stlAmount', 'settlement', 'Settlement amount', 'gross_amount')}
          {selectColumn('posDate', 'pos', 'POS date', 'sales_datetime_out')}{selectColumn('stlDate', 'settlement', 'Settlement date', 'transaction_date')}
        </div>
      </details>}
      <div className="step4-approval">
        {check('enabled', 'Approve and activate this rule', true)}
        <p>{enabled ? 'Saving approves these limits for future matching runs. Affected saved results will be cleared.' : 'Save this rule as inactive. It will not match any rows until you approve and activate it.'}</p>
      </div>
    </fieldset>
    <div className="step4-preview" role="status" aria-live="polite">{loading ? 'Checking the current data…' : preview ? <>
      <strong>{count(preview.matches_alone ?? 0)} rows link with this rule alone.</strong> {count(preview.extra_after_saved ?? 0)} additional links in its saved position.
      <p>{preview.conditions?.join('. ')}. A row with several possible partners stays open for review.</p>
    </> : 'Choose valid conditions to see their effect. Preview does not save matches.'}</div>
    {(error || columnError) && <p className="step4-error" role="alert">{columnError || error}</p>}
    <div className="step4-actions"><button className="step4-primary" disabled={busy || loading || !preview || !!columnError} type="submit">{enabled ? 'Save and activate' : 'Save inactive rule'}</button><button disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
