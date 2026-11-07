export const areas = ['pos', 'settlement', 'bank'] as const;
export type Area = typeof areas[number];
export const areaNames: Record<Area, string> = {pos: 'POS', settlement: 'Settlement', bank: 'Mutation'};
export const requiredColumns: Record<Area, string[]> = {
  pos: ['branch', 'payment_amount', 'sales_datetime_out'],
  settlement: ['branch', 'gross_amount', 'transaction_date', 'reference', 'nett_amount'],
  bank: ['keterangan', 'kredit'],
};
export type Column = {name: string; type: 'text' | 'number' | 'date' | 'datetime' | 'bool'; keep?: boolean; by?: string; why?: string};
export type Mapping = Record<string, {to: string; by?: string; why?: string}>;
export type Proposal = {proposed: Column[]; delimiter: string; diff: null | {added: string[]; missing: string[]; types: {name: string; from: string; to: string}[]; delimiter: boolean; rename: Record<string, string>}; rows: number; files: number; samples: Record<string, string>; rename: Mapping};
export type UploadRule = {version: number; columns: Column[]; rename: Record<string, string>; created_at: string; created_by: string};
export type Conversion = {at: string | null; stale: boolean; proposals: Partial<Record<Area, Proposal>>; decisions: Partial<Record<Area, string>>};
export type RawFile = {id: number; type: Area; name: string; folder: string; sheet: string | null; size: number; rows: number; looks_like: Area | null; wrong_area: boolean; uploaded_by: string; uploaded_at: string};
export type MapItem = {from: string; to: string; rows: number; by?: string; why?: string};
export type ExcludeItem = {pattern: string; example: string; rows: number; credit: number; debit: number; exclude: boolean; by?: string; why?: string};
export type Recommendation = {id: string; table: Area; column: string; kind: 'map' | 'exclude'; title: string; why: string; decision: 'accept' | 'reject' | null; choices?: string[]; items: (MapItem | ExcludeItem)[]};
export type CleaningRules = {version: number; maps: Record<string, Record<string, string>>; exclude: Record<string, Record<string, boolean>>; created_at?: string; created_by?: string};
export type Cleaning = {standard: {outlets: Record<string, string[]>; providers: Record<string, string[]>}; rules: CleaningRules | null; recommendations: Recommendation[]};
export type TableRow = Record<string, unknown> & {__was?: Record<string, unknown>};
export type Table = {columns: Column[]; rows: TableRow[]; total: number; raw?: number; dupes?: number; changed?: number; dropped?: number};
export type WorkflowData = {
  status: {step: number; files: Record<Area, number>; converted: boolean; upload_rules_pending: string[]; cleaning: {open: number; rules_version: number | null}; matching: Record<string, {done: boolean}>};
  files: RawFile[];
  conversion: Conversion | null;
  upload_rules: Record<Area, UploadRule | null>;
  cleaning: {rules: CleaningRules | null; recommendations: Recommendation[]};
  tables: Record<'parsed' | 'clean', Record<Area, Table>>;
};
export type RunAction = (label: string, action: () => Promise<string | void>) => Promise<boolean>;

export function availableStep(data: WorkflowData): number {
  if (!areas.every(area => data.status.files[area] > 0)) return 1;
  if (!data.status.converted || data.conversion?.stale || data.status.upload_rules_pending.length) return 2;
  if (!data.cleaning.rules || data.cleaning.recommendations.length) return 3;
  return 4;
}
export function errorMessage(error: unknown): string {return error instanceof Error ? error.message : 'The request failed. Please try again.';}
