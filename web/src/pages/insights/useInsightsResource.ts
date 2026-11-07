import {useCallback, useEffect, useRef, useState} from 'react';

// Keep the shared resource lifecycle while calling the typed endpoint wrappers.
export function useInsightsResource<T>(load: (signal: AbortSignal) => Promise<T>, key = '') {
  const loader = useRef(load);
  loader.current = load;
  const [state, setState] = useState<{data?: T; error?: string; loading: boolean}>({loading: true});
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState({loading: true});
    loader.current(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({data, loading: false});
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({error: error.message, loading: false});
    });
    return () => controller.abort();
  }, [key, version]);
  useEffect(() => {
    window.addEventListener('kira:data-changed', retry);
    return () => window.removeEventListener('kira:data-changed', retry);
  }, [retry]);
  return {...state, retry};
}
