import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {identity} from '../../lib/api';
import {queryClient, resourceKey} from '../../lib/query';

export function useInsightsResource<T>(load: (signal: AbortSignal, client: string) => Promise<T>, key = '', endpoint = '/performance/outlet-profiles') {
  const client = identity.client();
  const filters = key ? JSON.parse(key) as Record<string,string> : {};
  const params = new URLSearchParams(Object.entries(filters).filter(([,value]) => value !== ''));
  const result = useQuery({
    queryKey: resourceKey(endpoint + '?' + params, client),
    queryFn: () => load(new AbortController().signal, client),
    placeholderData: (previous, query) => query?.queryKey[1] === client ? keepPreviousData(previous) : undefined,
  }, queryClient);
  return {data: result.data, error: result.error?.message, loading: result.isPending, updating: result.isFetching && !result.isPending, retry: () => {void result.refetch();}};
}
