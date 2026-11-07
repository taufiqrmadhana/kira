import { ApiError, identity } from './api';

export async function downloadAnalysis(scope: string) {
  const response = await fetch(`/api/analysis/export?${scope}`, {
    credentials: 'include', headers: { 'X-Kira-Client': identity.client(), 'X-Kira-User': identity.user() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.detail || 'Export failed. Try again.');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'kira-analysis.csv'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
