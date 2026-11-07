export type ScreenContext = Record<string, string | number | boolean | null>;

export interface PendingApproval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: { status: string; result?: unknown; message?: string; confirmation_id?: string };
}

export interface ChatReply {
  reply: string;
  pending: PendingApproval[];
  tool_calls: ToolCall[];
  guarded?: boolean;
}

export interface HistoryMessage {
  who: 'user' | 'kira';
  text: string;
  tools?: ToolCall[];
}

export interface Highlight {
  keys: string[];
  note: string;
}

export function pendingFromHistory(history: HistoryMessage[]): PendingApproval[] {
  const pending = new Map<string, PendingApproval>();
  for (const message of history) {
    for (const call of message.tools || []) {
      if (call.result?.status === 'pending' && typeof call.result.confirmation_id === 'string') {
        pending.set(call.result.confirmation_id, { id: call.result.confirmation_id, tool: call.tool, args: call.args });
      }
    }
  }
  return [...pending.values()];
}

export type ChangeDestination = 2 | 3 | 4 | 'follow-up' | 'analysis';

export const DEMO_QUESTIONS = [
  'kenapa Harbor Square tanggal 24 Oktober 0%?',
  'selisih uang dari mana aja?',
  'outlet mana yang paling bermasalah minggu ini?',
  'apa yang udah kamu pelajari?',
] as const;

const CHANGE_DESTINATIONS: Record<string, ChangeDestination> = {
  convert_files: 2,
  save_upload_rule: 2,
  save_cleaning: 3,
  save_matching_rule: 4,
  run_matching: 4,
  save_follow_ups: 'follow-up',
  export_results: 'analysis',
};

export const TOOL_LABELS: Record<string, string> = {
  get_workflow_status: 'Checked workflow progress',
  list_files: 'Checked uploaded files',
  get_upload_rules: 'Read upload rules',
  preview_table: 'Read table rows',
  get_cleaning_recommendations: 'Checked cleaning recommendations',
  get_matching_rules: 'Read matching rules',
  suggest_matching_rules: 'Suggested matching rules',
  test_matching_rules: 'Tested matching rules',
  get_results: 'Checked matching results',
  explain_unmatched: 'Checked unmatched records',
  get_match_rate: 'Checked match rates',
  get_rate_table: 'Read the match-rate table',
  get_match_map: 'Read linked records',
  explain_money_gaps: 'Checked money differences',
  get_follow_ups: 'Read follow-ups',
  draft_follow_up_notes: 'Drafted follow-up notes',
  get_learning: 'Checked learned rules',
  highlight_records: 'Highlighted records',
  convert_files: 'Converted files',
  save_upload_rule: 'Saved an upload rule',
  save_cleaning: 'Saved cleaning decisions',
  save_matching_rule: 'Saved a matching rule',
  run_matching: 'Ran matching',
  save_follow_ups: 'Saved follow-up notes',
  export_results: 'Exported results',
};

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const stageName = (value: unknown): string =>
  value === 'l1' ? 'POS to settlement' : value === 'l2' ? 'settlement to bank' : asText(value, 'the selected stage');

export function approvalDescription(pending: PendingApproval): string {
  const args = pending.args;
  switch (pending.tool) {
    case 'convert_files': return 'Convert all uploaded files into tables and compare them with the saved upload rules.';
    case 'save_upload_rule': return `${asText(args.choice, 'Save')} the ${asText(args.table, 'selected')} upload rule using the proposed columns.`;
    case 'save_cleaning': return `Accept ${asList(args.accept).length} cleaning recommendations and reject ${asList(args.reject).length}; save the cleaning rules.`;
    case 'save_matching_rule': return `Save ${asText(args.name, asText(args.kind, 'a matching rule'))} for ${stageName(args.stage)}.`;
    case 'run_matching': return `Run ${stageName(args.stage)} using ${asList(args.rule_ids).length ? asList(args.rule_ids).join(', ') : 'all saved rules'}.${args.stage === 'l1' ? ' This clears the settlement-to-bank results.' : ''}`;
    case 'export_results': return 'Export the combined matching results as a CSV file.';
    case 'save_follow_ups': {
      const keys = asList(args.keys);
      const scope = [args.reason, args.outlet, args.day].map((value) => asText(value)).filter(Boolean).join(' / ');
      const selected = keys.length ? `${keys.length} records${scope ? ` (${scope})` : ''}` : scope || 'the selected records';
      return `Save a follow-up note on ${selected}: ${asText(args.status, 'investigating')}, ${asText(args.assignee) ? `assigned to ${asText(args.assignee)}` : 'unassigned'}.\nNote: “${asText(args.note)}”`;
    }
    default: return `Run ${pending.tool.replaceAll('_', ' ')} with the details below.`;
  }
}

export function collectEffects(calls: ToolCall[]) {
  const changed: ToolCall[] = [];
  const highlights: Highlight[] = [];
  let destination: ChangeDestination | undefined;
  for (const call of calls) {
    if (call.result?.status !== 'ok') continue;
    if (Object.hasOwn(CHANGE_DESTINATIONS, call.tool)) {
      changed.push(call);
      destination = CHANGE_DESTINATIONS[call.tool];
    }
    if (call.tool === 'highlight_records' && call.result.result && typeof call.result.result === 'object') {
      const result = call.result.result as Record<string, unknown>;
      const keys = asList(result.highlighted);
      if (keys.length) highlights.push({ keys, note: asText(result.note) });
    }
  }
  return { changed, highlights, destination };
}

export function safeLink(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value;
  return null;
}

interface AgentConnection {
  baseUrl: string;
  client: string;
  user: string;
  onUnauthorized?: () => void;
}

export async function requestAgent<T>(
  connection: AgentConnection,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${connection.baseUrl.replace(/\/$/, '')}/agent${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'X-Kira-Client': connection.client,
      'X-Kira-User': connection.user,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) connection.onUnauthorized?.();
    throw new Error(typeof data?.detail === 'string' ? data.detail : `Kira could not finish this request (${response.status}).`);
  }
  if (data === null) throw new Error('Kira returned an unreadable response. Try again.');
  return data as T;
}
