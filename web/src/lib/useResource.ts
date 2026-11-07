import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string; loading: boolean }>({ path, loading: !!path });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) { setState({ path, loading: false }); return; }
    const controller = new AbortController();
    setState(previous => ({ path, loading: true, data: previous.path === path ? previous.data : undefined }));
    api<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ path, loading: false, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message }));
    });
    return () => controller.abort();
  }, [path, version]);
  const retry = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    window.addEventListener('kira:data-changed', retry);
    return () => window.removeEventListener('kira:data-changed', retry);
  }, [retry]);
  return { ...state, retry };
}
