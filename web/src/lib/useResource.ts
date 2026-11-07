import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
export function useResource<T>(path: string | null) { const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
}>({ loading: !!path }); const [version, setVersion] = useState(0); useEffect(() => { if (!path) {
    setState({ loading: false });
    return;
} const controller = new AbortController(); setState({ loading: true }); api<T>(path, { signal: controller.signal }).then(data => { if (!controller.signal.aborted)
    setState({ loading: false, data }); }).catch(error => { if (!controller.signal.aborted)
    setState({ loading: false, error: error.message }); }); return () => controller.abort(); }, [path, version]); const retry = useCallback(() => setVersion(v => v + 1), []); useEffect(() => { window.addEventListener('kira:data-changed', retry); return () => window.removeEventListener('kira:data-changed', retry); }, [retry]); return { ...state, retry }; }
