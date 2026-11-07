import { useCallback, useEffect, useState } from 'react';
import { api, identity } from './api';

interface PendingResource {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
}
const pending = new Map<string, PendingResource>();

function subscribe(path: string, key: string) {
  let request = pending.get(key);
  if (!request) {
    const controller = new AbortController();
    const entry: PendingResource = {
      controller, subscribers: 0,
      promise: api(path, { signal: controller.signal }).finally(() => {
        if (pending.get(key) === entry) pending.delete(key);
      }),
    };
    pending.set(key, entry);
    request = entry;
  }
  request.subscribers++;
  return request;
}

export function useResource<T>(path: string | null) {
  const key = path ? JSON.stringify([identity.client(), identity.user(), path]) : null;
  const [state, setState] = useState<{ path: string | null; key: string | null; data?: T; error?: string; loading: boolean }>({ path, key, loading: !!path });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path || !key) { setState({ path, key, loading: false }); return; }
    const request = subscribe(path, key);
    let active = true;
    setState(previous => ({ path, key, loading: true, data: previous.key === key ? previous.data : undefined }));
    request.promise.then(data => {
      if (active) setState({ path, key, loading: false, data: data as T });
    }).catch(error => {
      if (active) setState(previous => ({ ...previous, loading: false, error: error.message }));
    });
    return () => {
      active = false;
      request.subscribers--;
      // StrictMode immediately subscribes again; only abort requests with no subscribers.
      queueMicrotask(() => {
        if (request.subscribers) return;
        if (pending.get(key) === request) pending.delete(key);
        request.controller.abort();
      });
    };
  }, [path, key, version]);
  const retry = useCallback(() => {
    if (key) pending.delete(key);
    setVersion(v => v + 1);
  }, [key]);
  useEffect(() => {
    window.addEventListener('kira:data-changed', retry);
    return () => window.removeEventListener('kira:data-changed', retry);
  }, [retry]);
  return state.key === key
    ? { path: state.path, data: state.data, error: state.error, loading: state.loading, retry }
    : { path, data: undefined, error: undefined, loading: !!path, retry };
}
