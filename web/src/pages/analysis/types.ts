export type Stage = 'l1' | 'l2';
export interface SideRow {
    n: number;
    rec: number;
    key: string;
    day: string;
    outlet: string;
    rule: string;
    link: string;
    status: 'Linked' | 'Review' | 'Not found';
    pays?: number;
    row: Record<string, unknown>;
}
export interface SideResponse {
    total: number;
    offset: number;
    limit?: number;
    counts: Record<string, number>;
    columns: {
        name: string;
        type: string;
    }[];
    aggregates: Record<string, {
        sum: number;
        count: number;
        min?: number;
        max?: number;
    }>;
    rows: SideRow[];
}
export interface FollowUp {
    status: string;
    assignee: string;
    note: string;
    by?: string;
    at?: string;
}
export interface FollowRecord {
    i: number;
    rid: string;
    key: string;
    day: string;
    outlet: string;
    provider: string;
    reason: string;
    status: string;
    amount: number;
    pos?: Record<string, unknown> | null;
    stl?: Record<string, unknown> | null;
    follow_up?: FollowUp;
    follow?: FollowUp;
}
export interface FollowResponse {
    total: number;
    offset: number;
    counts: Record<string, number>;
    records: FollowRecord[];
    follow_ups?: Record<string, FollowUp>;
}
export interface Draft extends FollowUp {
    rid: string;
    key?: string;
    group?: string;
    by?: string;
}
export interface DraftResponse {
    drafts: Draft[];
    groups: {
        label: string;
        records: number;
        total: number;
    }[];
    by: string;
    skipped: number;
}
export const ratio = (a: number, b: number) => b ? a / b * 100 : null;
