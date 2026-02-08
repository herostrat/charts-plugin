import { autoRefreshEl, liveStateEl } from '../core/dom.js';
import { state } from '../core/state.js';
import { API_BASE } from '../core/constants.js';
import { showError } from '../core/ui.js';

let renderImportsFn: (jobs: any[]) => void;

const setLiveUi = (mode: string, text?: string) => {
  state.sse.status = mode;
  if (!liveStateEl) return;

  liveStateEl.classList.remove('live--on','live--re','live--off');
  if (mode === 'connected') liveStateEl.classList.add('live--on');
  else if (mode === 'off') liveStateEl.classList.add('live--off');
  else liveStateEl.classList.add('live--re');

  liveStateEl.textContent = text || mode;
};

const safeJson = (str: string) => {
  try { return JSON.parse(str); } catch { return null; }
};

const upsertJob = (job: any) => {
  if (!job || job.id == null) return;
  const id = String(job.id);
  const idx = state.jobs.findIndex((j) => String(j.id) === id);
  if (idx >= 0) {
    const prev = state.jobs[idx];
    const merged = {
      ...prev,
      ...job,
      items: Array.isArray(job.items) ? job.items : prev?.items
    };
    state.jobs[idx] = merged;
  } else state.jobs.push(job);
};

const upsertItem = (jobId: any, item: any) => {
  if (jobId == null || !item) return;
  const id = String(jobId);
  let job = state.jobs.find((j) => String(j.id) === id);
  if (!job) {
    job = { id: jobId, state: 'QUEUED', items: [] };
    state.jobs.push(job);
  }
  if (!Array.isArray(job.items)) job.items = [];
  const itemId = String(item.id ?? item.filename ?? Math.random());
  const i = job.items.findIndex((x: any) => String(x.id ?? x.filename) === itemId);
  if (i >= 0) job.items[i] = { ...job.items[i], ...item };
  else job.items.push(item);
};

const removeJob = (jobId: any) => {
  const id = String(jobId);
  state.jobs = state.jobs.filter((j) => String(j.id) !== id);
};

const handleSsePayload = (payload: any) => {
  if (payload == null) return;

  if (Array.isArray(payload)) {
    state.jobs = payload;
    renderImportsFn?.(state.jobs);
    return;
  }

  if (Array.isArray(payload.jobs)) {
    state.jobs = payload.jobs;
    renderImportsFn?.(state.jobs);
    return;
  }

  if (payload.job) {
    upsertJob(payload.job);
    renderImportsFn?.(state.jobs);
    return;
  }

  if (payload.item && payload.jobId != null) {
    upsertItem(payload.jobId, payload.item);
    renderImportsFn?.(state.jobs);
    return;
  }

  if (payload.type === 'snapshot' && Array.isArray(payload.data)) {
    state.jobs = payload.data;
    renderImportsFn?.(state.jobs);
    return;
  }
  if (payload.type === 'job' && payload.data) {
    upsertJob(payload.data);
    renderImportsFn?.(state.jobs);
    return;
  }
  if (payload.type === 'item' && payload.data && payload.jobId != null) {
    upsertItem(payload.jobId, payload.data);
    renderImportsFn?.(state.jobs);
    return;
  }
  if (payload.type === 'delete' && payload.jobId != null) {
    removeJob(payload.jobId);
    renderImportsFn?.(state.jobs);
    return;
  }
};

export const disconnectSse = () => {
  try { state.sse.es?.close?.(); } catch (_) {}
  state.sse.es = null;
  if (state.sse.watchdog) window.clearInterval(state.sse.watchdog);
  state.sse.watchdog = null;
  setLiveUi('off', 'off');
};

export const connectSse = () => {
  disconnectSse();

  if (!autoRefreshEl?.checked) {
    setLiveUi('off', 'off');
    return;
  }

  if (!('EventSource' in window)) {
    setLiveUi('off', 'no SSE');
    showError('This browser does not support Server-Sent Events (EventSource).');
    return;
  }

  const url = `${API_BASE}/events`;
  setLiveUi('connecting', 'connecting');

  const es = new EventSource(url);
  state.sse.es = es;
  state.sse.lastEventAt = Date.now();

  es.onopen = () => {
    state.sse.lastEventAt = Date.now();
    setLiveUi('connected', 'connected');
  };

  es.onerror = () => {
    setLiveUi('reconnecting', 'reconnecting');
  };

  const onAny = (ev: MessageEvent) => {
    state.sse.lastEventAt = Date.now();
    const payload = safeJson(ev.data);
    handleSsePayload(payload);
  };

  es.onmessage = onAny;
  es.addEventListener('snapshot', onAny);
  es.addEventListener('job', onAny);
  es.addEventListener('item', onAny);
  es.addEventListener('delete', onAny);
  es.addEventListener('ping', () => { state.sse.lastEventAt = Date.now(); });

  state.sse.watchdog = window.setInterval(() => {
    if (!autoRefreshEl?.checked) return;
    const age = Date.now() - (state.sse.lastEventAt || 0);
    if (age > 30000) {
      setLiveUi('reconnecting', 'reconnecting');
      try { es.close(); } catch (_) {}
      connectSse();
    }
  }, 5000);
};

export const isSseConnected = () => {
  return state.sse.status === 'connected' && !!state.sse.es;
};

export const initSse = (opts: { renderImports: (jobs: any[]) => void }) => {
  renderImportsFn = opts.renderImports;

  autoRefreshEl?.addEventListener('change', () => {
    if (autoRefreshEl.checked) connectSse();
    else disconnectSse();
  });
};
