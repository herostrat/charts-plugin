import { API_BASE } from './constants.js';

const apiGet = async (url: string) => {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

const apiSend = async (url: string, method: string, bodyObj: unknown) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ''}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return null;
};

export const api = {
  fs: (path: string) => apiGet(`${API_BASE}/fs?path=${encodeURIComponent(path)}`),
  listJobs: () => apiGet(`${API_BASE}`),
  createJob: (payload: unknown) => apiSend(`${API_BASE}`, 'POST', payload),
  cancelJob: (id: string | number) => apiSend(`${API_BASE}/${encodeURIComponent(id)}`, 'DELETE', null),
  deleteJob: (id: string | number) => apiSend(`${API_BASE}/${encodeURIComponent(id)}?action=delete`, 'DELETE', null),
  getConfig: () => apiGet(`${API_BASE}/config`),
  setConfig: (changes: unknown) => apiSend(`${API_BASE}/config`, 'PUT', { changes })
};
