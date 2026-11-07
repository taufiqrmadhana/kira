export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const identity = { user: () => localStorage.getItem('kira-user') || 'Andrew', client: () => new URLSearchParams(location.search).get('c') ?? localStorage.getItem('kira-client') ?? '' };
export function clientPath(path: string) { const url = new URL(path, location.origin); if (identity.client())
    url.searchParams.set('c', identity.client()); return url.pathname + url.search; }
export function query(values: Record<string, string | number | boolean | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '')
    params.set(key, String(value)); }); return params.toString(); }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> { const headers = new Headers(init.headers); headers.set('X-Kira-User', identity.user()); headers.set('X-Kira-Client', identity.client()); if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json'); const response = await fetch('/api' + path, { ...init, headers, credentials: 'include' }); if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    if (response.status === 401 && !['/login','/login.html'].includes(location.pathname))
        location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search));
    throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
} if (response.status === 204)
    return undefined as T; return response.json(); }
export async function download(path: string, filename: string) {
    const response = await fetch('/api' + path, { headers: { 'X-Kira-User': identity.user(), 'X-Kira-Client': identity.client() }, credentials: 'include' });
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
