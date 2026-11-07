import {api, query} from '../../lib/api';

export interface InsightFilters {
  date_from?: string;
  date_to?: string;
  outlet?: string;
  city?: string;
  region?: string;
  period?: string;
}
export interface OutletProfile {
  outlet: string;
  city: string;
  region: string;
  updated_by?: string;
  updated_at?: string;
}
export interface Outlet {
  outlet: string;
  orders: number;
  gross_sales: number;
  avg_ticket: number | null;
  provider_gross: number;
  mdr: number;
  promo_provider: number | null;
  fees: number;
  nett_settled: number;
  bank_received: number;
  pending_bank: number;
  to_check: number;
  expected_diff: number;
  deduction: number;
  deduction_rate: number | null;
  keep_rate: number | null;
  keep_rate_expected: number | null;
  match_rate: number | null;
  city: string;
  region: string;
  quadrant: string;
  reason: string;
}
export interface PerformanceResponse {
  period: {
    from: string | null;
    to: string | null;
    days: number;
    label: string;
    coverage: number;
    data_from?: string | null;
    data_to?: string | null;
    data_dates?: string[];
  };
  totals: Pick<Outlet, 'orders' | 'gross_sales' | 'bank_received' | 'deduction' | 'deduction_rate' | 'keep_rate' | 'to_check'> & Partial<Outlet>;
  medians: {gross_sales: number | null; keep_rate: number | null};
  rows: Outlet[];
  unassigned: {credits: number; amount: number};
}
export interface Anomaly {
  kind: string;
  severity: string;
  outlet: string;
  period: {from: string; to: string};
  value: number;
  expected: number | null;
  rupiah: number;
  why: string;
  filter: {date_from: string; date_to: string; outlet: string; reason: string};
}
export interface AnomaliesResponse {
  anomalies: Anomaly[];
  skipped: {kind: string; why: string}[];
}
export interface ProfilesResponse {profiles: OutletProfile[]}

export function getOutletPerformance(filters: InsightFilters = {}, signal?: AbortSignal) {
  return api<PerformanceResponse>('/performance/outlets?' + query({...filters}), {signal});
}
export function getOutletAnomalies(filters: InsightFilters = {}, signal?: AbortSignal) {
  return api<AnomaliesResponse>('/performance/anomalies?' + query({...filters}), {signal});
}
export function getOutletProfiles(signal?: AbortSignal) {
  return api<ProfilesResponse>('/performance/outlet-profiles', {signal});
}
export function saveOutletProfiles(profiles: Pick<OutletProfile, 'outlet' | 'city' | 'region'>[]) {
  return api<ProfilesResponse>('/performance/outlet-profiles', {method: 'PUT', body: JSON.stringify({profiles})});
}
