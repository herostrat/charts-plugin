import {
  filterBtns,
  importsEmptyEl,
  importsListEl,
  kpiActive,
  kpiAvailable,
  kpiFailed,
  kpiTotal,
  refreshDom
} from '../core/dom.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { showError, clearError } from '../core/ui.js';
import {
  boundsToCompact,
  chipClass,
  escapeAttr,
  escapeHtml,
  fmtBytes,
  fmtIso,
  getBounds,
  normalizeStatus
} from '../core/utils.js';

let renderMapFn: (items: any[]) => void;
let focusBoundsFn: (bounds: number[]) => void;
let openDetailsFn: (job: any, item: any, status: string) => void;
let isSseConnectedFn: () => boolean;

const flattenItems = (jobs: any[]) => {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const out: any[] = [];
  for (const job of safeJobs) {
    const items = Array.isArray(job.items) ? job.items : [];
    for (const item of items) {
      const status = normalizeStatus(job, item);
      const key = `${job.id}:${item.id}`;
      out.push({ job, item, status, key });
    }
  }
  const prio = (s: string) => (s === 'uploading' || s === 'converting' || s === 'queued') ? 0 : (s === 'available' ? 1 : 2);
  out.sort((a, b) => {
    const pa = prio(a.status), pb = prio(b.status);
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.job.updatedAt || a.job.createdAt || 0).getTime();
    const tb = new Date(b.job.updatedAt || b.job.createdAt || 0).getTime();
    return tb - ta;
  });
  return out;
};

const computeKpis = (items: any[]) => {
  const active = items.filter((x) => ['progress','converting'].includes(x.status)).length;
  const available = items.filter((x) => x.status === 'available').length;
  const failed = items.filter((x) => ['error','canceled'].includes(x.status)).length;
  const total = items.length;
  if (kpiActive) kpiActive.textContent = String(active);
  if (kpiAvailable) kpiAvailable.textContent = String(available);
  if (kpiFailed) kpiFailed.textContent = String(failed);
  if (kpiTotal) kpiTotal.textContent = String(total);
};

const applyFilter = (items: any[]) => {
  switch (state.filter) {
    case 'progress': return items.filter((x) => ['progress','converting'].includes(x.status));
    case 'available': return items.filter((x) => x.status === 'available');
    case 'error': return items.filter((x) => ['error','canceled'].includes(x.status));
    default: return items;
  }
};

const sourceLine = (item: any) => {
  if (item.sourcePath) return item.sourcePath;
  if (item.sourceUrl) return item.sourceUrl;
  if (item.streamUrl) return `${item.streamType || 'stream'}: ${item.streamUrl}`;
  return '—';
};

const renderErrors = (job: any, item: any) => {
  const errs = []
    .concat(Array.isArray(item?.errors) ? item.errors : [])
    .concat(Array.isArray(job?.errors) ? job.errors : []);

  if (!errs.length) return '';
  const lines = errs.slice(0, 3).map((e: any) => `<div>• ${escapeHtml(String(e))}</div>`).join('');
  const more = errs.length > 3 ? `<div>...and ${errs.length - 3} more</div>` : '';
  return `<div style="margin-top:6px; color: #b42318;">${lines}${more}</div>`;
};

export const renderImports = (jobs: any[]) => {
  if (!importsListEl) refreshDom();
  const items = flattenItems(jobs);
  computeKpis(items);

  const filtered = applyFilter(items);
  if (importsEmptyEl) importsEmptyEl.classList.toggle('is-hidden', items.length > 0);
  if (importsListEl) importsListEl.innerHTML = '';

  if (!filtered.length && importsListEl) {
    const hint = document.createElement('div');
    hint.className = 'empty';
    hint.textContent = state.filter === 'progress' ? 'No in-progress imports right now.' : 'No items matching the filter.';
    importsListEl.appendChild(hint);
  }

  for (const entry of filtered) {
    const job = entry.job;
    const item = entry.item;
    const status = entry.status;
    const key = entry.key;
    const b = getBounds(item);

    const meta = item?.metadata ?? item?.meta ?? {};
    const minZ = meta?.minZoom ?? meta?.minzoom ?? item?.minZoom ?? item?.minzoom;
    const maxZ = meta?.maxZoom ?? meta?.maxzoom ?? item?.maxZoom ?? item?.maxzoom;
    const updated = meta?.updatedAt ?? meta?.updated ?? meta?.date ?? meta?.timestamp;
    const errorsHtml = renderErrors(job, item);
    const canCancel = status === 'progress' || status === 'converting';
    const canDelete = status === 'available' || status === 'error' || status === 'canceled';

    const el = document.createElement('div');
    el.className = 'item' + (state.focusedKey === key ? ' is-focused' : '');
    el.innerHTML = `
      <div class="item__top">
        <div style="min-width:0;">
          <div class="item__name">${escapeHtml(item.filename || item.id || 'item')}</div>
          <div class="item__sub">${escapeHtml(sourceLine(item))}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="${chipClass(status)}">${escapeHtml(status)}</span>
        </div>
      </div>

      <div class="metaGrid">
        <div class="pill"><b>type</b><span>${escapeHtml(item.detectedType || 'unknown')}</span></div>
        <div class="pill"><b>size</b><span>${escapeHtml(fmtBytes(item.sizeBytes))}</span></div>
        <div class="pill"><b>zoom</b><span>${escapeHtml((minZ != null || maxZ != null) ? `${minZ ?? '?'}–${maxZ ?? '?'}` : '-')}</span></div>
        <div class="pill"><b>bounds</b><span>${escapeHtml(boundsToCompact(b))}</span></div>
        <div class="pill"><b>updated</b><span>${escapeHtml(updated ? fmtIso(updated) : fmtIso(job.updatedAt || job.createdAt))}</span></div>
      </div>
      ${errorsHtml ? `<div class="details">${errorsHtml}</div>` : ''}

      <div class="rowActions">
        <button class="btn btn--ghost btn--sm" data-details="1">Details</button>
        ${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${escapeAttr(String(job.id))}">Cancel job</button>` : ''}
        ${!canCancel && canDelete ? `<button class="btn btn--danger btn--sm" data-delete="${escapeAttr(String(job.id))}">Delete</button>` : ''}
      </div>
    `;

    el.addEventListener('click', () => {
      state.focusedKey = key;
      renderImports(state.jobs);
      if (Array.isArray(b) && b.length === 4) focusBoundsFn?.(b);
    });

    el.querySelector('button[data-details]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openDetailsFn?.(job, item, status);
    });

    const cancelBtn = el.querySelector('button[data-cancel]') as HTMLButtonElement | null;
    cancelBtn?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (cancelBtn) cancelBtn.disabled = true;
      try {
        await api.cancelJob(job.id);
        if (!isSseConnectedFn?.()) await refreshJobs();
      } catch (e: any) {
        showError(`Cancel failed: ${e.message}`);
      } finally {
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });

    const deleteBtn = el.querySelector('button[data-delete]') as HTMLButtonElement | null;
    deleteBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!window.confirm('Delete this import job? This cannot be undone.')) return;
      showError('Delete is not implemented yet.');
    });

    importsListEl?.appendChild(el);
  }

  const allForMap = flattenItems(jobs).map((x) => ({ jobId: x.job.id, item: x.item, key: x.key }));
  renderMapFn?.(allForMap);
};

export const refreshJobs = async () => {
  try {
    const jobs = await api.listJobs();
    state.jobs = Array.isArray(jobs) ? jobs : [];
    clearError();
    renderImports(state.jobs);
  } catch (e: any) {
    showError(`Imports list failed: ${e.message}`);
    renderImports([]);
  }
};

export const initImports = (opts: {
  renderMap: (items: any[]) => void;
  focusBounds: (bounds: number[]) => void;
  openDetails: (job: any, item: any, status: string) => void;
  isSseConnected: () => boolean;
}) => {
  refreshDom();
  renderMapFn = opts.renderMap;
  focusBoundsFn = opts.focusBounds;
  openDetailsFn = opts.openDetails;
  isSseConnectedFn = opts.isSseConnected;

  const setFilter = (name: string) => {
    state.filter = name;
    filterBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.filter === name));
    renderImports(state.jobs);
  };
  filterBtns.forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter || 'all')));
  setFilter('all');
};
