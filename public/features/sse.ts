import { liveStateEl, refreshBtn } from '../core/dom.js';
import { state } from '../core/state.js';
import { API_BASE } from '../core/constants.js';
import { showError } from '../core/ui.js';

let renderImportsFn: (jobs: any[]) => void;

const buildSseUrl = (hostOverride?: string) => {
  const url = new URL(`${API_BASE}/events`, window.location.origin);
  if (hostOverride) url.hostname = hostOverride;
  return url.toString();
};

const setLiveUi = (mode: string, text?: string) => {
  state.sse.status = mode;
  if (!liveStateEl) return;

  liveStateEl.classList.remove('live--on','live--re','live--off');
  if (mode === 'connected') liveStateEl.classList.add('live--on');
  else if (mode === 'off') liveStateEl.classList.add('live--off');
  else liveStateEl.classList.add('live--re');

  liveStateEl.textContent = text || mode;
};

const logSse = (msg: string, data?: unknown) => {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.debug(`[sse] ${msg}${payload}`);
};

const syncRefreshUi = () => {
  if (!refreshBtn) return;
  const showRefresh = state.sse.status === 'no-sse';
  refreshBtn.disabled = !showRefresh;
  refreshBtn.classList.toggle('is-hidden', !showRefresh);
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

  if (state.sse.status !== 'connected') {
     setLiveUi('connected', 'active');
    syncRefreshUi();
  }

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
  setLiveUi('off', 'off');
  syncRefreshUi();
};

export const connectSse = (hostOverride?: string, allowAltHost = true) => {
  disconnectSse();

  if (!('EventSource' in window)) {
    setLiveUi('no-sse', 'no SSE');
    showError('This browser does not support Server-Sent Events (EventSource).');
    syncRefreshUi();
    logSse('EventSource not available');
    return;
  }

  const url = buildSseUrl(hostOverride);
  setLiveUi('connecting', 'connecting');
  syncRefreshUi();
  logSse('connecting', { url, origin: window.location.origin });

  const es = new EventSource(url);
  state.sse.es = es;
  state.sse.lastEventAt = Date.now();

  const readyFallback = window.setTimeout(() => {
    if (state.sse.es === es && es.readyState === 1) {
        setLiveUi('connected', 'active');
      syncRefreshUi();
    }
  }, 1500);


  es.onopen = () => {
    state.sse.lastEventAt = Date.now();
      setLiveUi('connected', 'active');
    window.clearTimeout(readyFallback);
    logSse('open');
  };

  es.onerror = () => {
    window.clearTimeout(readyFallback);
    logSse('error', { readyState: es.readyState, url });

    if (allowAltHost) {
      const host = window.location.hostname;
      const altHost = host === 'localhost' ? '127.0.0.1' : host === '127.0.0.1' ? 'localhost' : null;
      if (altHost && !hostOverride) {
        logSse('retry-alt-host', { altHost });
        connectSse(altHost, false);
        return;
      }
    }

    setLiveUi('no-sse', 'no SSE');
    syncRefreshUi();
  };

  const onAny = (ev: MessageEvent) => {
    state.sse.lastEventAt = Date.now();
    const payload = safeJson(ev.data);
    window.clearTimeout(readyFallback);
    logSse(`event:${ev.type}`, payload ?? ev.data);
    handleSsePayload(payload);
  };

  es.onmessage = onAny;
  es.addEventListener('snapshot', onAny);
  es.addEventListener('job', onAny);
  es.addEventListener('item', onAny);
  es.addEventListener('delete', onAny);
  es.addEventListener('hello', onAny);
  es.addEventListener('ping', () => { state.sse.lastEventAt = Date.now(); });

  // No watchdog: idle periods can be normal for this app.
};

export const isSseConnected = () => {
  return state.sse.status === 'connected' && !!state.sse.es;
};

export const initSse = (opts: { renderImports: (jobs: any[]) => void }) => {
  renderImportsFn = opts.renderImports;

  syncRefreshUi();
};
