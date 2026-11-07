import {query} from './api';
import {useEndpoint} from './query';
import type {WorkflowProgress} from '../kira/WorkspaceStatus';
import type {Cleaning, RawFile, Table, WorkflowData, Area} from '../pages/workflow/types';
import type {FollowResponse, SideResponse, Stage} from '../pages/analysis/types';
import type {PerformanceResponse, AnomaliesResponse, ProfilesResponse, InsightFilters} from '../pages/insights/api';

type Scope = Record<string, string | number | boolean | undefined>;
export const useWorkflow = () => useEndpoint<WorkflowData>('/workflow?rows=5');
export const useStatus = () => useEndpoint<WorkflowProgress>('/status');
export const useFiles = () => useEndpoint<RawFile[]>('/files');
export const useCleaning = () => useEndpoint<Cleaning>('/cleaning');
export const useTable = (layer: 'parsed' | 'clean', area: Area, scope: Scope = {}) => useEndpoint<Table>(`/tables/${layer}/${area}?${query(scope)}`);
export const useSide = (stage: Stage, table: string, scope: Scope = {}) => useEndpoint<SideResponse>(`/analysis/side/${stage}/${table}?${query(scope)}`);
export const useFollowUps = (scope: Scope = {}) => useEndpoint<FollowResponse>('/analysis/follow-ups?' + query(scope));
export const usePerformance = (scope: InsightFilters = {}) => useEndpoint<PerformanceResponse>('/performance/outlets?' + query({...scope}));
export const useAnomalies = (scope: InsightFilters = {}) => useEndpoint<AnomaliesResponse>('/performance/anomalies?' + query({...scope}));
export const useProfiles = () => useEndpoint<ProfilesResponse>('/performance/outlet-profiles');
