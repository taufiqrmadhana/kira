export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
type MutationListener = (path: string, method: string, client: string) => void | Promise<void>;
const mutationListeners = new Set<MutationListener>();
export function onMutation(listener: MutationListener) { mutationListeners.add(listener); return () => mutationListeners.delete(listener); }
export const identity = { user: () => localStorage.getItem('kira-user') || 'Andrew', client: () => new URLSearchParams(location.search).get('c') ?? localStorage.getItem('kira-client') ?? '' };
export function clientPath(path: string) { const url = new URL(path, location.origin); if (identity.client())
    url.searchParams.set('c', identity.client()); return url.pathname + url.search; }
export function query(values: Record<string, string | number | boolean | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '')
    params.set(key, String(value)); }); return params.toString(); }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> { const headers = new Headers(init.headers); if (!headers.has('X-Kira-User')) headers.set('X-Kira-User', identity.user()); if (!headers.has('X-Kira-Client')) headers.set('X-Kira-Client', identity.client()); if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json'); const response = await fetch('/api' + path, { ...init, headers, credentials: 'include' }); if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    if (response.status === 401 && path.split('?')[0] !== '/login' && !['/login','/login.html'].includes(location.pathname))
        location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search));
    throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
} if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) await Promise.all([...mutationListeners].map(listener => listener(path, init.method!, headers.get('X-Kira-Client')!))); if (response.status === 204)
    return undefined as T; return response.json(); }
export async function download(path: string, filename: string, client = identity.client()) {
    const response = await fetch('/api' + path, { headers: { 'X-Kira-User': identity.user(), 'X-Kira-Client': client }, credentials: 'include' });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: response.statusText }));
        if (response.status === 401)
            location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search));
        throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
