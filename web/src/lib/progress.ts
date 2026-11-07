import {ApiError, identity} from './api';

export interface ProgressUpdate {
  type: 'progress';
  area?: 'pos' | 'settlement' | 'bank';
  stage?: 'l1' | 'l2';
  completed: number;
  total: number;
  unit?: string;
  message?: string;
  matched?: number;
  hits?: Record<string, number>;
}

/** A write succeeds only after the server sends its committed completion event. */
export async function streamProgress<T>(path: string, init: RequestInit, onProgress: (event: ProgressUpdate) => void): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('X-Kira-User')) headers.set('X-Kira-User', identity.user());
  if (!headers.has('X-Kira-Client')) headers.set('X-Kira-Client', identity.client());
  headers.set('Accept', 'application/x-ndjson');
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch('/api'+path, {...init, headers, credentials:'include'});
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && !['/login','/login.html'].includes(location.pathname)) {
      location.assign('/login?next='+encodeURIComponent(location.pathname+location.search));
    }
    throw new ApiError(response.status, typeof payload.detail === 'string' ? payload.detail : `Request failed (${response.status}). Try again.`);
  }
  if (!response.body) throw new Error('Progress is unavailable. Refresh the workflow before trying again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function readLine(line: string): {result: T} | undefined {
    init.signal?.throwIfAborted();
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object') throw new Error();
      event = parsed as Record<string, unknown>;
    } catch { throw new Error('Invalid progress response. Refresh the workflow before trying again.'); }
    if (event.type === 'error') throw new ApiError(typeof event.status === 'number' ? event.status : 500,
      typeof event.detail === 'string' ? event.detail : 'The operation did not finish. Refresh the workflow before trying again.');
    if (event.type === 'complete' && Object.hasOwn(event,'result')) return {result:event.result as T};
    if (event.type === 'heartbeat') return;
    if (event.type !== 'progress' || typeof event.completed !== 'number' || typeof event.total !== 'number'
      || !Number.isFinite(event.completed) || !Number.isFinite(event.total)
      || event.completed < 0 || event.total < event.completed) {
      throw new Error('Invalid progress response. Refresh the workflow before trying again.');
    }
    onProgress(event as unknown as ProgressUpdate);
  }

  try {
    while (true) {
      init.signal?.throwIfAborted();
      const {done,value} = await reader.read();
      buffer += decoder.decode(value, {stream:!done});
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0,newline);
        buffer = buffer.slice(newline+1);
        const complete = readLine(line);
        if (complete) return complete.result;
      }
      if (done) {
        const complete = readLine(buffer);
        if (complete) return complete.result;
        throw new Error('The connection ended before completion. Refresh the workflow before trying again.');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
